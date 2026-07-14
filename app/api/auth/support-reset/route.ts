import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { checkAndConsumeAiRateLimit, rateLimitResponse } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TELEGRAM_MAX = 100;

function clean(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

// Заявка на восстановление доступа: пользователь потерял и пароль, и код.
// Он оставляет логин + свой Telegram — заявка ложится в password_reset_requests
// и параллельно прилетает админу в Telegram. Админ выдаёт в админке НОВЫЙ КОД
// ВОССТАНОВЛЕНИЯ (не пароль!) и лично присылает его пользователю; пароль тот
// задаёт себе сам, введя код в форме «Забыли пароль».
export async function POST(req: Request) {
  const rate = await checkAndConsumeAiRateLimit(req, "auth-support-reset");
  if (!rate.ok) return rateLimitResponse(rate);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });

  const username = typeof body.username === "string" ? body.username.toLowerCase().trim() : "";
  const telegram = clean(body.telegram, TELEGRAM_MAX);

  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return NextResponse.json({ error: "Укажите ваш логин." }, { status: 400 });
  }
  if (telegram.length < 2) {
    return NextResponse.json(
      { error: "Укажите ваш Telegram — туда мы пришлём код восстановления." },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("password_reset_requests")
    .insert({ username, telegram, status: "new" });

  if (error) {
    console.error("[auth/support-reset] insert failed", error.message);
    return NextResponse.json({ error: "Не удалось отправить заявку. Попробуйте позже." }, { status: 500 });
  }

  // Пинг админу — best-effort: заявка уже в базе и видна в админке, поэтому
  // упавший Telegram не должен ронять запрос.
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (BOT_TOKEN && CHAT_ID) {
    const text =
      `🔑 *Заявка на восстановление доступа*\n\n` +
      `👤 Логин: \`${username}\`\n` +
      `✈️ Telegram: ${telegram}\n\n` +
      `Админка → «Заявки на доступ» → «Выдать код» → пришли код этому человеку.`;
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "Markdown" }),
      });
    } catch (e) {
      console.error("[auth/support-reset] telegram failed", e);
    }
  }

  return NextResponse.json({ ok: true });
}
