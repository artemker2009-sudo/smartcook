import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Подключаемся к Supabase, чтобы менять статус поста
const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
  (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim()
);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Проверяем, что к нам пришло именно нажатие на инлайн-кнопку из Телеграма
    if (body.callback_query) {
      const callbackQuery = body.callback_query;
      const data = callbackQuery.data; // Тут будет 'mod_approve_123' или 'mod_reject_123'
      const messageId = callbackQuery.message.message_id;
      const chatId = callbackQuery.message.chat.id;
      const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();

      let newStatus = '';
      let resultText = '';

      // Если ты нажал "Одобрить"
      if (data.startsWith('mod_approve_')) {
        const postId = data.replace('mod_approve_', '');
        // Обновляем статус в БД на 'approved' (теперь фото будет видно всем)
        await supabase.from('feed_posts').update({ status: 'approved' }).eq('id', postId);
        newStatus = 'approved';
        resultText = '✅ ФОТО ОДОБРЕНО И ДОБАВЛЕНО В ЛЕНТУ';
      } 
      // Если ты нажал "Удалить"
      else if (data.startsWith('mod_reject_')) {
        const postId = data.replace('mod_reject_', '');
        // Обновляем статус в БД на 'rejected' (никто его не увидит)
        await supabase.from('feed_posts').update({ status: 'rejected' }).eq('id', postId);
        newStatus = 'rejected';
        resultText = '❌ ФОТО ОТКЛОНЕНО И УДАЛЕНО';
      }

      if (newStatus) {
        // Меняем текст сообщения в Телеграме и УДАЛЯЕМ кнопки, чтобы нельзя было нажать дважды
        const editUrl = `https://api.telegram.org/bot${botToken}/editMessageCaption`;
        await fetch(editUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            caption: `${callbackQuery.message.caption}\n\n➖➖➖➖➖➖\n${resultText}`,
            reply_markup: { inline_keyboard: [] } // Пустая клавиатура стирает кнопки
          })
        });

        // Отвечаем серверам Телеграма, что клик обработан (иначе на кнопке будут висеть часики)
        const answerUrl = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
        await fetch(answerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callbackQuery.id,
            text: "Решение сохранено!"
          })
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Webhook error:", e);
    // Телеграму всегда нужно возвращать 200 OK, иначе он будет долбить нас повторными запросами
    return NextResponse.json({ success: false, error: e.message });
  }
}