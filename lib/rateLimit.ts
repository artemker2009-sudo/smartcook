import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getVerifiedUserId } from "@/lib/auth";

// ЛИМИТЫ AI-ГЕНЕРАЦИЙ. Меняй только эти два числа.
export const RATE_LIMIT_PER_HOUR = 10;
export const RATE_LIMIT_PER_DAY = 30;

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
