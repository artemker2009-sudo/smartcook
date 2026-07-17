import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import {
  founderChatId,
  answerCallbackQuery,
  editCardResult,
  FEED_APPROVE_PREFIX,
  FEED_REJECT_PREFIX,
} from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Вебхук Telegram для премодерации ленты. Две обязательные проверки:
//   1) secret token Telegram (заголовок X-Telegram-Bot-Api-Secret-Token) сверяем
//      с TELEGRAM_WEBHOOK_SECRET из env — отсекаем чужие POST-запросы;
//   2) callback пришёл из чата основателя (TELEGRAM_CHAT_ID) — только он может
//      модерировать.
// Токен и chat_id — только в env на сервере, в ответы/логи не попадают.
// Всегда отвечаем 200 (кроме проваленной проверки секрета), иначе Telegram
// зависает и ретраит.

function secretOk(req: Request): boolean {
  const expected = (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (!expected) {
    console.error("[telegram-webhook] TELEGRAM_WEBHOOK_SECRET не задан — отклоняю");
    return false; // fail-closed: без секрета не доверяем никому
  }
  const got = req.headers.get("x-telegram-bot-api-secret-token") || "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  // 1) Секрет вебхука. Не прошёл — 401, дальше не читаем.
  if (!secretOk(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    const callbackQuery = body?.callback_query;

    if (callbackQuery) {
      // 2) Решение принимается только из чата основателя.
      const chatId = callbackQuery.message?.chat?.id;
      const founder = founderChatId();
      if (!founder || String(chatId) !== founder) {
        await answerCallbackQuery(callbackQuery.id, "Нет доступа");
        return NextResponse.json({ ok: true });
      }

      const data: string = callbackQuery.data || "";
      let newStatus: "approved" | "rejected" | "" = "";
      let resultText = "";

      if (data.startsWith(FEED_APPROVE_PREFIX)) {
        newStatus = "approved";
        resultText = "✅ Одобрено — пост опубликован в ленте.";
      } else if (data.startsWith(FEED_REJECT_PREFIX)) {
        newStatus = "rejected";
        resultText = "❌ Отклонено — пост не опубликован.";
      }

      if (newStatus) {
        const postId =
          newStatus === "approved"
            ? data.slice(FEED_APPROVE_PREFIX.length)
            : data.slice(FEED_REJECT_PREFIX.length);

        const supabase = createServiceRoleClient();
        const { error } = await supabase
          .from("community_posts")
          .update({ status: newStatus, moderated_at: new Date().toISOString() })
          .eq("id", postId);
        if (error) console.error("[telegram-webhook] update failed", error.message);

        await answerCallbackQuery(callbackQuery.id, "Решение принято");
        await editCardResult(
          chatId,
          callbackQuery.message.message_id,
          callbackQuery.message.caption || "",
          resultText,
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[telegram-webhook] error", e instanceof Error ? e.message : "unknown");
    // Telegram всё равно нужен 200, иначе он ретраит вебхук.
    return NextResponse.json({ ok: true });
  }
}
