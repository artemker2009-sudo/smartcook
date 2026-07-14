import { NextResponse } from "next/server";
import { checkAndConsumeAiRateLimit, rateLimitResponse } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOTE_MAX = 300;

function clean(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

// Запасной путь «через админа»: пользователь потерял и пароль, и код
// восстановления. Он оставляет заявку — мы шлём её тебе в Telegram, и ты
// вручную сбрасываешь пароль в админке (вкладка «Управление» → «Сброс пароля»),
// после чего сообщаешь пользователю новый код. Персональные данные тут не
// собираем: только логин и (по желанию) как связаться.
export async function POST(req: Request) {
  const rate = await checkAndConsumeAiRateLimit(req, "auth-support-reset");
  if (!rate.ok) return rateLimitResponse(rate);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });

  const username = typeof body.username === "string" ? body.username.toLowerCase().trim() : "";
  const contact = clean(body.contact, NOTE_MAX);

  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return NextResponse.json({ error: "Укажите ваш логин." }, { status: 400 });
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (BOT_TOKEN && CHAT_ID) {
    const text =
      `🔑 *Заявка на сброс пароля*\n\n` +
      `👤 Логин: \`${username}\`\n` +
      (contact ? `📞 Связь: ${contact}\n` : "") +
      `\nСбросить: админка → «Управление» → «Сброс пароля пользователя».`;
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "Markdown" }),
      });
    } catch (e) {
      console.error("[auth/support-reset] telegram failed", e);
      // Заявку не теряем «наружу»: пользователю всё равно говорим, что приняли.
    }
  } else {
    console.warn("[auth/support-reset] Telegram not configured; request from", username);
  }

  return NextResponse.json({ ok: true });
}
