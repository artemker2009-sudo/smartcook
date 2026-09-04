import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getVerifiedUserId } from "@/lib/auth";

// ЛИМИТЫ AI-ГЕНЕРАЦИЙ. Меняй только эти два числа.
export const RATE_LIMIT_PER_HOUR = 10;
export const RATE_LIMIT_PER_DAY = 30;

// --- Исключение для проверяющих App Store -----------------------------------
//
// Проверяющий Apple прогоняет приложение вдоль и поперёк за один заход: фото,
// поиск, перегенерации, банкет, список покупок. Обычные 10 генераций в час он
// упирает за первые минуты, видит «Вы сгенерировали максимум за этот час» и
// закрывает ревью как «функция не работает» (Guideline 2.1). Поэтому у
// демо-аккаунта отдельный, заведомо достаточный лимит на сутки.
//
// Список аккаунтов — в переменной окружения, НЕ в коде: это операционная
// настройка (аккаунт могут пересоздать между подачами), и в репозитории ей
// делать нечего. Формат — user_id (uuid) через запятую:
//
//   AI_RATE_LIMIT_EXEMPT_USER_IDS=1b2c…,9f8e…
//
// Пусто/не задано → исключений нет вовсе и всё работает ровно как раньше.
export const REVIEW_RATE_LIMIT_PER_DAY = 100;

// Разбираем один раз на модуль: переменная за жизнь процесса не меняется.
const EXEMPT_USER_IDS: ReadonlySet<string> = new Set(
  (process.env.AI_RATE_LIMIT_EXEMPT_USER_IDS || "")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean),
);

// userId приходит ТОЛЬКО из getVerifiedUserId (подпись JWT проверена
// Supabase). Ни имя пользователя, ни что-либо из тела запроса сюда не попадает
// — иначе повышенный лимит выдавался бы по строке, которую клиент придумал сам.
function isExemptUser(userId: string | null): boolean {
  return !!userId && EXEMPT_USER_IDS.has(userId.toLowerCase());
}

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

  // Демо-аккаунт ревью: свой счётчик и свой префикс идентификатора, чтобы не
  // смешиваться с обычным бюджетом. IP-лимит для него НЕ проверяем сознательно:
  // проверяющие сидят за общим адресом, и 10 генераций в час на IP срубили бы
  // повышенный лимит раньше, чем он успел бы пригодиться. Это единственный
  // способ сделать исключение работающим, а не декоративным.
  if (isExemptUser(userId)) {
    const identifier = `review:user:${userId}`;
    const limits = { perHour: REVIEW_RATE_LIMIT_PER_DAY, perDay: REVIEW_RATE_LIMIT_PER_DAY };
    const reviewResult = await checkIdentifier(identifier, "user", limits);
    if (!reviewResult.ok) {
      logRateLimitHit({ route, ip, userId, scope: reviewResult.scope, window: reviewResult.window });
      return reviewResult;
    }

    const { error: reviewErr } = await supabaseAdmin
      .from("ai_rate_limit_events")
      .insert([{ identifier, route }]);
    if (reviewErr) console.error("[rateLimit] failed to record review event", reviewErr.message);

    void supabaseAdmin
      .from("ai_rate_limit_events")
      .delete()
      .eq("identifier", identifier)
      .lt("created_at", new Date(Date.now() - DAY_MS - HOUR_MS).toISOString())
      .then(() => {});

    return { ok: true };
  }

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

// --- Общий (семейный) список покупок -----------------------------------------
//
// Три отдельных префикса со своими бюджетами. Ни один НЕ делится с умной
// сортировкой ("shopping:") и распознаванием по фото ("shopping-photo:") — тот
// же принцип, по которому фото в своё время получило собственный счётчик:
// исчерпать чужой лимит своими действиями нельзя.
//
// OpenAI здесь не участвует, так что лимиты защищают не расходы, а сам список:
// чтобы по одной ссылке нельзя было завалить семью спамом.

const SHARED_CREATE_PER_DAY = 5;
const SHARED_JOIN_PER_HOUR = 20;
const SHARED_WRITE_PER_HOUR = 60;
const SHARED_WRITE_PER_DAY = 300;

export async function checkAndConsumeSharedListCreateRateLimit(req: Request): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  const route = "shared-shopping-create";
  const identifier = `shshop-create:ip:${ip}`;

  // Часовой и суточный потолок совпадают: 5 списков в день — это и есть предел,
  // отдельного часового смысла нет.
  const result = await checkIdentifier(identifier, "ip", {
    perHour: SHARED_CREATE_PER_DAY,
    perDay: SHARED_CREATE_PER_DAY,
  });
  if (!result.ok) {
    logRateLimitHit({ route, ip, userId: null, scope: result.scope, window: result.window });
    return result;
  }

  const { error } = await supabaseAdmin.from("ai_rate_limit_events").insert([{ identifier, route }]);
  if (error) console.error("[rateLimit] failed to record shared create event", error.message);

  return { ok: true };
}

export async function checkAndConsumeSharedListJoinRateLimit(req: Request): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  const route = "shared-shopping-join";
  const identifier = `shshop-join:ip:${ip}`;

  const result = await checkIdentifier(identifier, "ip", {
    perHour: SHARED_JOIN_PER_HOUR,
    perDay: SHARED_JOIN_PER_HOUR * 4,
  });
  if (!result.ok) {
    logRateLimitHit({ route, ip, userId: null, scope: result.scope, window: result.window });
    return result;
  }

  const { error } = await supabaseAdmin.from("ai_rate_limit_events").insert([{ identifier, route }]);
  if (error) console.error("[rateLimit] failed to record shared join event", error.message);

  return { ok: true };
}

// memberRef приходит из тела запроса и сервером не подтверждён (та же модель
// доверия, что у party.user_id) — значит одного счётчика по нему мало:
// подделав ref, счётчик можно обнулить. Поэтому второй, более широкий, по IP.
export async function checkAndConsumeSharedListWriteRateLimit(
  req: Request,
  memberRef: string,
): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  const route = "shared-shopping-write";
  const memberId = `shshop:member:${memberRef}`;
  const ipId = `shshop:ip:${ip}`;

  // Оба счётчика читаем ПАРАЛЛЕЛЬНО. В отличие от AI-роутов, здесь запрос
  // делается на каждую галочку в магазине, и лишний последовательный round-trip
  // до Supabase человек чувствует пальцем. Проверки независимы, так что
  // единственная плата за параллельность — одно лишнее чтение в тот редкий
  // момент, когда лимит уже превышен.
  //
  // По IP потолок кратно выше: за одним адресом сидит вся семья (домашний NAT),
  // и их совместная работа со списком не должна упираться в лимит одного.
  const [memberResult, ipResult] = await Promise.all([
    checkIdentifier(memberId, "user", { perHour: SHARED_WRITE_PER_HOUR, perDay: SHARED_WRITE_PER_DAY }),
    checkIdentifier(ipId, "ip", { perHour: SHARED_WRITE_PER_HOUR * 4, perDay: SHARED_WRITE_PER_DAY * 4 }),
  ]);

  if (!memberResult.ok) {
    logRateLimitHit({ route, ip, userId: memberRef, scope: memberResult.scope, window: memberResult.window });
    return memberResult;
  }
  if (!ipResult.ok) {
    logRateLimitHit({ route, ip, userId: memberRef, scope: ipResult.scope, window: ipResult.window });
    return ipResult;
  }

  const { error } = await supabaseAdmin
    .from("ai_rate_limit_events")
    .insert([{ identifier: memberId, route }, { identifier: ipId, route }]);
  if (error) console.error("[rateLimit] failed to record shared write event", error.message);

  return { ok: true };
}

// Ответ на превышение лимита общего списка: без слова «генерации» — человек
// просто добавлял продукты.
export function sharedListRateLimitResponse(result: Extract<RateLimitResult, { ok: false }>) {
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
          ? "Слишком много изменений подряд. Попробуйте через несколько минут."
          : "На сегодня достаточно изменений в общем списке. Возвращайтесь завтра.",
      code: RATE_LIMIT_ERROR_CODE,
      window: result.window,
    },
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
