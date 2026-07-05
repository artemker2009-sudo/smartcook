import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  | { ok: false; window: RateLimitWindow; scope: "ip" | "user" };

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

// Пользователь считается "залогиненным" только если фронтенд прислал
// реальный Supabase access token, который мы тут же проверяем на сервере.
// sessionId из тела запроса для этого не годится — его легко подделать
// или сбросить очисткой localStorage.
async function getVerifiedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

async function countEvents(identifier: string, sinceMs: number): Promise<number> {
  const since = new Date(Date.now() - sinceMs).toISOString();
  const { count, error } = await supabaseAdmin
    .from("ai_rate_limit_events")
    .select("id", { count: "exact", head: true })
    .eq("identifier", identifier)
    .gte("created_at", since);

  if (error) {
    // Не роняем генерацию из-за сбоя базы — просто пропускаем запрос.
    console.error("[rateLimit] count query failed", error.message);
    return 0;
  }
  return count ?? 0;
}

async function checkIdentifier(
  identifier: string,
  scope: "ip" | "user",
): Promise<RateLimitResult> {
  const hourly = await countEvents(identifier, HOUR_MS);
  if (hourly >= RATE_LIMIT_PER_HOUR) return { ok: false, window: "hour", scope };

  const daily = await countEvents(identifier, DAY_MS);
  if (daily >= RATE_LIMIT_PER_DAY) return { ok: false, window: "day", scope };

  return { ok: true };
}

function logRateLimitHit(info: {
  route: string;
  ip: string;
  userId: string | null;
  scope: "ip" | "user";
  window: RateLimitWindow;
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

export function rateLimitResponse(result: Extract<RateLimitResult, { ok: false }>) {
  return NextResponse.json(
    {
      error: RATE_LIMIT_MESSAGES[result.window],
      code: RATE_LIMIT_ERROR_CODE,
      window: result.window,
    },
    { status: 429 },
  );
}
