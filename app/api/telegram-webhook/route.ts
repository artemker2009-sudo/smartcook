import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
  (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim()
);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.callback_query) {
      const callbackQuery = body.callback_query;
      const data = callbackQuery.data; 
      const messageId = callbackQuery.message.message_id;
      const chatId = callbackQuery.message.chat.id;
      const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();

      let newStatus = '';
      let resultText = '';

      if (data.startsWith('mod_approve_')) {
        const postId = data.replace('mod_approve_', '');
        await supabase.from('feed_posts').update({ status: 'approved' }).eq('id', postId);
        newStatus = 'approved';
        resultText = '✅ ВЫ ОДОБРИЛИ ЭТО ФОТО. ОНО ДОБАВЛЕНО В ЛЕНТУ.';
      } 
      else if (data.startsWith('mod_reject_')) {
        const postId = data.replace('mod_reject_', '');
        await supabase.from('feed_posts').update({ status: 'rejected' }).eq('id', postId);
        newStatus = 'rejected';
        resultText = '❌ ВЫ ОТКЛОНИЛИ И УДАЛИЛИ ЭТО ФОТО.';
      }

      if (newStatus) {
        // МГНОВЕННО отвечаем Телеграму, чтобы убрать "часики" загрузки на кнопке
        await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callbackQuery.id,
            text: "Решение принято!"
          })
        });

        // Меняем текст сообщения, убираем кнопки и пишем статус
        await fetch(`https://api.telegram.org/bot${botToken}/editMessageCaption`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            caption: `${callbackQuery.message.caption}\n\n➖➖➖➖➖➖\n${resultText}`,
            reply_markup: { inline_keyboard: [] } 
          })
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Webhook error:", e);
    // Обязательно возвращаем статус 200, чтобы Телеграм не зависал
    return NextResponse.json({ success: true, error: e.message });
  }
}