import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getVerifiedUserId } from "@/lib/auth";

// ЛИМИТЫ AI-ГЕНЕРАЦИЙ. Меняй только эти два числа.
export const RATE_LIMIT_PER_HOUR = 10;
export const RATE_LIMIT_PER_DAY = 30;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Сообщения, которые увидит пользователь на фронтенде при превышении лимита.
export const RATE_LIMIT_MESSAGES = {
  hour: "Вы сгенерировали максимум за этот час. Попробуйте немного позже 🙏",
  day: "Вы сгенерировали максимум на сегодня. Возвращайтесь завтра!",
} as const;

export const RATE_LIMIT_ERROR_CODE = "RATE_LIMITED";

const supabaseAdmin = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
);

type RateLimitWindow = "hour" | "day";

export type RateLimitResult =
  | { ok: true }
  | { ok: false; window: RateLimitWindow; scope: "ip" | "user" }
  | { ok: false; window: "error"; scope: "error" };

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

// null означает "не удалось посчитать" (сбой БД/отсутствие таблицы и т.п.) —
// отличаем от 0 событий, чтобы не спутать сбой с "лимит не исчерпан".
async function countEvents(identifier: string, sinceMs: number): Promise<number | null> {
  const since = new Date(Date.now() - sinceMs).toISOString();
  const { count, error } = await supabaseAdmin
    .from("ai_rate_limit_events")
    .select("id", { count: "exact", head: true })
    .eq("identifier", identifier)
    .gte("created_at", since);

  // На HEAD-запросах шлюз Supabase иногда возвращает 204 без тела и без error
  // даже для несуществующей/недоступной таблицы (count при этом остается null).
  // Поэтому null-count тоже считаем сбоем, а не "0 событий".
  if (error || count === null) {
    console.error("[rateLimit] count query failed", error?.message ?? "count came back null");
    return null;
  }
  return count;
}

async function checkIdentifier(
  identifier: string,
  scope: "ip" | "user",
  limits: { perHour: number; perDay: number } = { perHour: RATE_LIMIT_PER_HOUR, perDay: RATE_LIMIT_PER_DAY },
): Promise<RateLimitResult> {
  const hourly = await countEvents(identifier, HOUR_MS);
  // Сбой БД (например, таблица лимитов недоступна) — блокируем запрос вместо
  // того, чтобы молча пропускать его без счетчика. Отказ в генерации дешевле,
  // чем неограниченные вызовы OpenAI при сбое инфраструктуры.
  if (hourly === null) return { ok: false, window: "error", scope: "error" };
  if (hourly >= limits.perHour) return { ok: false, window: "hour", scope };

  const daily = await countEvents(identifier, DAY_MS);
  if (daily === null) return { ok: false, window: "error", scope: "error" };
  if (daily >= limits.perDay) return { ok: false, window: "day", scope };

  return { ok: true };
}

function logRateLimitHit(info: {
  route: string;
  ip: string;
  userId: string | null;
  scope: "ip" | "user" | "error";
  window: RateLimitWindow | "error";
}) {
  console.warn(
    `[RATE_LIMIT_HIT] route=${info.route} scope=${info.scope} window=${info.window} ip=${info.ip} user=${info.userId ?? "-"}`,
  );
}

// Вызывать в начале обработчика, сразу после базовой валидации входных
// данных и до обращения к OpenAI. Если лимит не превышен — сразу же
// "бронирует" слот (пишет событие в БД), чтобы повторный вызов до того,
// как первый успел завершиться, тоже был учтён.
export async function checkAndConsumeAiRateLimit(
  req: Request,
  route: string,
): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  const userId = await getVerifiedUserId(req);

  const ipResult = await checkIdentifier(`ip:${ip}`, "ip");
  if (!ipResult.ok) {
    logRateLimitHit({ route, ip, userId, scope: ipResult.scope, window: ipResult.window });
    return ipResult;
  }

  if (userId) {
    const userResult = await checkIdentifier(`user:${userId}`, "user");
    if (!userResult.ok) {
      logRateLimitHit({ route, ip, userId, scope: userResult.scope, window: userResult.window });
      return userResult;
    }
  }

  const rows = [{ identifier: `ip:${ip}`, route }];
  if (userId) rows.push({ identifier: `user:${userId}`, route });

  const { error } = await supabaseAdmin.from("ai_rate_limit_events").insert(rows);
  if (error) console.error("[rateLimit] failed to record event", error.message);

  // Best-effort уборка старых записей для этого IP, чтобы таблица не росла бесконечно.
  void supabaseAdmin
    .from("ai_rate_limit_events")
    .delete()
    .eq("identifier", `ip:${ip}`)
    .lt("created_at", new Date(Date.now() - DAY_MS - HOUR_MS).toISOString())
    .then(() => {});

  return { ok: true };
}

// Более мягкий лимитер для публичных read-эндпоинтов (лента рецептов/фото),
// нужен как защита от массового скрейпинга скриптами, а не от обычного
// пролистывания ленты живым человеком. Используем ту же таблицу событий,
// но с собственным префиксом идентификатора ("read:<route>:..."), чтобы не
// делить счётчик с AI-лимитом (checkAndConsumeAiRateLimit использует
// "ip:"/"user:" без префикса route) — иначе открытие ленты съедало бы тот
// же бюджет, что и генерация рецептов.
const READ_RATE_LIMIT_PER_HOUR = 120;
const READ_RATE_LIMIT_PER_DAY = 1500;

export async function checkAndConsumeReadRateLimit(
  req: Request,
  route: string,
): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  const identifier = `read:${route}:ip:${ip}`;
  const limits = { perHour: READ_RATE_LIMIT_PER_HOUR, perDay: READ_RATE_LIMIT_PER_DAY };

  const result = await checkIdentifier(identifier, "ip", limits);
  if (!result.ok) {
    logRateLimitHit({ route, ip, userId: null, scope: result.scope, window: result.window });
    return result;
  }

  const { error } = await supabaseAdmin.from("ai_rate_limit_events").insert([{ identifier, route }]);
  if (error) console.error("[rateLimit] failed to record read event", error.message);

  void supabaseAdmin
    .from("ai_rate_limit_events")
    .delete()
    .eq("identifier", identifier)
    .lt("created_at", new Date(Date.now() - DAY_MS - HOUR_MS).toISOString())
    .then(() => {});

  return { ok: true };
}

// Лимитер отправки баг-репортов («Сообщить об ошибке»): не больше 5 в час с
// одной сессии/IP. Используем ту же таблицу событий с отдельным префиксом
// "report:...", чтобы не делить бюджет с AI-генерациями.
const REPORT_RATE_LIMIT_PER_HOUR = 5;
const REPORT_RATE_LIMIT_PER_DAY = 20;

export async function checkAndConsumeReportRateLimit(
  req: Request,
  userId: string | null,
): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  const route = "report-error";
  const limits = { perHour: REPORT_RATE_LIMIT_PER_HOUR, perDay: REPORT_RATE_LIMIT_PER_DAY };

  const ipIdentifier = `report:ip:${ip}`;
  const ipResult = await checkIdentifier(ipIdentifier, "ip", limits);
  if (!ipResult.ok) {
    logRateLimitHit({ route, ip, userId, scope: ipResult.scope, window: ipResult.window });
    return ipResult;
  }

  if (userId) {
    const userResult = await checkIdentifier(`report:user:${userId}`, "user", limits);
    if (!userResult.ok) {
      logRateLimitHit({ route, ip, userId, scope: userResult.scope, window: userResult.window });
      return userResult;
    }
  }

  const rows = [{ identifier: ipIdentifier, route }];
  if (userId) rows.push({ identifier: `report:user:${userId}`, route });

  const { error } = await supabaseAdmin.from("ai_rate_limit_events").insert(rows);
  if (error) console.error("[rateLimit] failed to record report event", error.message);

  return { ok: true };
}

// Лимитер AUTH-роутов (регистрация, восстановление пароля, заявка админу).
// Отдельный префикс "auth:..." — принципиально: раньше эти роуты сидели на
// общем AI-бюджете, и человек, который днём искал рецепты, при попытке
// восстановить пароль упирался в лимит и получал «Вы сгенерировали максимум за
// этот час» — то есть не мог вернуть себе доступ из-за счётчика генераций.
// Бюджет всё равно жёсткий: это защита от перебора кода восстановления.
const AUTH_RATE_LIMIT_PER_HOUR = 10;
const AUTH_RATE_LIMIT_PER_DAY = 40;

export async function checkAndConsumeAuthRateLimit(
  req: Request,
  route: string,
): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  const identifier = `auth:ip:${ip}`;
  const limits = { perHour: AUTH_RATE_LIMIT_PER_HOUR, perDay: AUTH_RATE_LIMIT_PER_DAY };

  const result = await checkIdentifier(identifier, "ip", limits);
  if (!result.ok) {
    logRateLimitHit({ route, ip, userId: null, scope: result.scope, window: result.window });
    return result;
  }

  const { error } = await supabaseAdmin.from("ai_rate_limit_events").insert([{ identifier, route }]);
  if (error) console.error("[rateLimit] failed to record auth event", error.message);

  void supabaseAdmin
    .from("ai_rate_limit_events")
    .delete()
    .eq("identifier", identifier)
    .lt("created_at", new Date(Date.now() - DAY_MS - HOUR_MS).toISOString())
    .then(() => {});

  return { ok: true };
}

// Лимитер публикаций в ленту сообщества: защита от спама фотопостами. Отдельный
// префикс "feed:..." — не делим бюджет ни с AI-генерациями, ни с auth. Считаем
// и по IP, и по пользователю (владелец из проверенной сессии).
const FEED_SUBMIT_PER_HOUR = 10;
const FEED_SUBMIT_PER_DAY = 30;

export async function checkAndConsumeFeedSubmitRateLimit(
  req: Request,
  userId: string,
): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  const route = "feed-submit";
  const limits = { perHour: FEED_SUBMIT_PER_HOUR, perDay: FEED_SUBMIT_PER_DAY };

  const ipResult = await checkIdentifier(`feed:ip:${ip}`, "ip", limits);
  if (!ipResult.ok) {
    logRateLimitHit({ route, ip, userId, scope: ipResult.scope, window: ipResult.window });
    return ipResult;
  }

  const userResult = await checkIdentifier(`feed:user:${userId}`, "user", limits);
  if (!userResult.ok) {
    logRateLimitHit({ route, ip, userId, scope: userResult.scope, window: userResult.window });
    return userResult;
  }

  const { error } = await supabaseAdmin
    .from("ai_rate_limit_events")
    .insert([{ identifier: `feed:ip:${ip}`, route }, { identifier: `feed:user:${userId}`, route }]);
  if (error) console.error("[rateLimit] failed to record feed event", error.message);

  return { ok: true };
}

// Лимитер лайков в ленте. Лайк доступен без регистрации, поэтому единственный
// заслон от накрутки скриптом — частота с одной гостевой сессии (и с одного IP).
// Считаем в МИНУТНОМ окне: живой человек не ставит 20 лайков за минуту, а бот
// упирается сразу. actorKey — "guest:<uuid>" или "user:<uuid>" (владелец из
// httpOnly-cookie / проверенного JWT, не из тела запроса).
const LIKE_PER_MINUTE = 20;
const LIKE_IP_PER_MINUTE = 60; // за одним IP может сидеть подъезд/офис/NAT

export async function checkAndConsumeFeedLikeRateLimit(
  req: Request,
  actorKey: string,
): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  const route = "feed-like";
  const actorId = `like:${actorKey}`;
  const ipId = `like:ip:${ip}`;

  const actorCount = await countEvents(actorId, MINUTE_MS);
  if (actorCount === null) return { ok: false, window: "error", scope: "error" };
  if (actorCount >= LIKE_PER_MINUTE) {
    logRateLimitHit({ route, ip, userId: actorKey, scope: "user", window: "hour" });
    return { ok: false, window: "hour", scope: "user" };
  }

  const ipCount = await countEvents(ipId, MINUTE_MS);
  if (ipCount === null) return { ok: false, window: "error", scope: "error" };
  if (ipCount >= LIKE_IP_PER_MINUTE) {
    logRateLimitHit({ route, ip, userId: actorKey, scope: "ip", window: "hour" });
    return { ok: false, window: "hour", scope: "ip" };
  }

  const { error } = await supabaseAdmin
    .from("ai_rate_limit_events")
    .insert([{ identifier: actorId, route }, { identifier: ipId, route }]);
  if (error) console.error("[rateLimit] failed to record like event", error.message);

  // Уборка своих же старых записей — минутному окну хранить сутки незачем.
  void supabaseAdmin
    .from("ai_rate_limit_events")
    .delete()
    .eq("identifier", actorId)
    .lt("created_at", new Date(Date.now() - HOUR_MS).toISOString())
    .then(() => {});

  return { ok: true };
}

// Лимитер умной сортировки списка покупок (/api/shopping/sort). Отдельный
// префикс "shopping:..." — не делит бюджет ни с AI-генерациями рецептов, ни с
// прочими лимитами. Считаем и по IP, и по пользователю (если залогинен). Список
// покупок живёт на устройстве, но сама сортировка дёргает OpenAI — поэтому
// защищаем расходы так же, как генерации.
const SHOPPING_SORT_PER_HOUR = 15;
const SHOPPING_SORT_PER_DAY = 60;

export async function checkAndConsumeShoppingSortRateLimit(
  req: Request,
  userId: string | null,
): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  const route = "shopping-sort";
  const limits = { perHour: SHOPPING_SORT_PER_HOUR, perDay: SHOPPING_SORT_PER_DAY };

  const ipResult = await checkIdentifier(`shopping:ip:${ip}`, "ip", limits);
  if (!ipResult.ok) {
    logRateLimitHit({ route, ip, userId, scope: ipResult.scope, window: ipResult.window });
    return ipResult;
  }

  if (userId) {
    const userResult = await checkIdentifier(`shopping:user:${userId}`, "user", limits);
    if (!userResult.ok) {
      logRateLimitHit({ route, ip, userId, scope: userResult.scope, window: userResult.window });
      return userResult;
    }
  }

  const rows = [{ identifier: `shopping:ip:${ip}`, route }];
  if (userId) rows.push({ identifier: `shopping:user:${userId}`, route });

  const { error } = await supabaseAdmin.from("ai_rate_limit_events").insert(rows);
  if (error) console.error("[rateLimit] failed to record shopping event", error.message);

  return { ok: true };
}

// Лимитер распознавания списка по фото (/api/shopping/recognize). Отдельный
// префикс "shopping-photo:..." и СВОЙ, более жёсткий бюджет: vision-запрос с
// картинкой дороже текстовой сортировки, и делить с ней счётчик нельзя —
// иначе одно фото съедало бы лимит сортировок и наоборот.
const SHOPPING_PHOTO_PER_HOUR = 10;
const SHOPPING_PHOTO_PER_DAY = 30;

export async function checkAndConsumeShoppingPhotoRateLimit(
  req: Request,
  userId: string | null,
): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  const route = "shopping-photo";
  const limits = { perHour: SHOPPING_PHOTO_PER_HOUR, perDay: SHOPPING_PHOTO_PER_DAY };

  const ipResult = await checkIdentifier(`shopping-photo:ip:${ip}`, "ip", limits);
  if (!ipResult.ok) {
    logRateLimitHit({ route, ip, userId, scope: ipResult.scope, window: ipResult.window });
    return ipResult;
  }

  if (userId) {
    const userResult = await checkIdentifier(`shopping-photo:user:${userId}`, "user", limits);
    if (!userResult.ok) {
      logRateLimitHit({ route, ip, userId, scope: userResult.scope, window: userResult.window });
      return userResult;
    }
  }

  const rows = [{ identifier: `shopping-photo:ip:${ip}`, route }];
  if (userId) rows.push({ identifier: `shopping-photo:user:${userId}`, route });

  const { error } = await supabaseAdmin.from("ai_rate_limit_events").insert(rows);
  if (error) console.error("[rateLimit] failed to record shopping photo event", error.message);

  return { ok: true };
}

// Ответ на превышение лимита распознавания фото: своя формулировка, чтобы
// человек понял, какой именно лимит кончился.
export function shoppingPhotoRateLimitResponse(result: Extract<RateLimitResult, { ok: false }>) {
  if (result.window === "error") {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте через минуту.", code: "RATE_LIMIT_UNAVAILABLE" },
      { status: 503 },
    );
  }
  return NextResponse.json(
    {
      error:
        result.window === "hour"
          ? "Слишком часто. Попробуйте распознать фото через час."
          : "На сегодня хватит распознаваний. Возвращайтесь завтра!",
      code: RATE_LIMIT_ERROR_CODE,
      window: result.window,
    },
    { status: 429 },
  );
}

// Ответ на превышение лимита сортировки списка покупок: без слова «генерации».
export function shoppingRateLimitResponse(result: Extract<RateLimitResult, { ok: false }>) {
  if (result.window === "error") {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте через минуту.", code: "RATE_LIMIT_UNAVAILABLE" },
      { status: 503 },
    );
  }
  return NextResponse.json(
    {
      error:
        result.window === "hour"
          ? "Слишком часто. Попробуйте сортировку через час."
          : "На сегодня хватит сортировок. Возвращайтесь завтра!",
      code: RATE_LIMIT_ERROR_CODE,
      window: result.window,
    },
    { status: 429 },
  );
}

// Ответ на превышение лимита лайков: короткий и без слова «генерации».
export function likeRateLimitResponse(result: Extract<RateLimitResult, { ok: false }>) {
  if (result.window === "error") {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте через минуту.", code: "RATE_LIMIT_UNAVAILABLE" },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { error: "Слишком часто. Подождите минуту.", code: RATE_LIMIT_ERROR_CODE },
    { status: 429 },
  );
}

// Ответ для auth-роутов: текст про попытки, а не про «генерации».
export function authRateLimitResponse(result: Extract<RateLimitResult, { ok: false }>) {
  if (result.window === "error") {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте через минуту.", code: "RATE_LIMIT_UNAVAILABLE" },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      error:
        result.window === "hour"
          ? "Слишком много попыток. Попробуйте через час."
          : "Слишком много попыток за сегодня. Попробуйте завтра.",
      code: RATE_LIMIT_ERROR_CODE,
      window: result.window,
    },
    { status: 429 },
  );
}

export function readRateLimitResponse(result: Extract<RateLimitResult, { ok: false }>) {
  if (result.window === "error") {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте через минуту.", code: "RATE_LIMIT_UNAVAILABLE" },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { error: "Слишком много запросов. Попробуйте позже.", code: RATE_LIMIT_ERROR_CODE, window: result.window },
    { status: 429 },
  );
}

export function rateLimitResponse(result: Extract<RateLimitResult, { ok: false }>) {
  if (result.window === "error") {
    // Сбой инфраструктуры лимитера — честно говорим об ошибке, а не врем
    // про превышенный лимит, но всё равно отказываем в генерации.
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте через минуту.", code: "RATE_LIMIT_UNAVAILABLE" },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      error: RATE_LIMIT_MESSAGES[result.window],
      code: RATE_LIMIT_ERROR_CODE,
      window: result.window,
    },
    { status: 429 },
  );
}
