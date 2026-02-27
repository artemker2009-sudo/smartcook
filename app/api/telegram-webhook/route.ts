import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ИСПРАВЛЕНИЕ: Используем SERVICE_ROLE_KEY, чтобы у вебхука были права админа!
const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim()
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
        const { error } = await supabase.from('feed_posts').update({ status: 'approved' }).eq('id', postId);
        if (error) console.error("DB Error Approve:", error);
        
        newStatus = 'approved';
        resultText = '✅ ВЫ ОДОБРИЛИ ЭТО ФОТО. ОНО ДОБАВЛЕНО В ЛЕНТУ.';
      } 
      else if (data.startsWith('mod_reject_')) {
        const postId = data.replace('mod_reject_', '');
        const { error } = await supabase.from('feed_posts').update({ status: 'rejected' }).eq('id', postId);
        if (error) console.error("DB Error Reject:", error);
        
        newStatus = 'rejected';
        resultText = '❌ ВЫ ОТКЛОНИЛИ И УДАЛИЛИ ЭТО ФОТО.';
      }

      if (newStatus) {
        // МГНОВЕННО отвечаем Телеграму, чтобы убрать часики
        await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: callbackQuery.id,
            text: "Решение принято!"
          })
        });

        // Меняем текст сообщения и убираем кнопки
        await fetch(`https://api.telegram.org/bot${botToken}/editMessageCaption`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            caption: `${callbackQuery.message.caption || ''}\n\n➖➖➖➖➖➖\n${resultText}`,
            reply_markup: { inline_keyboard: [] } 
          })
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Webhook error:", e);
    // Телеграму всегда нужен ответ 200, иначе он зависнет
    return NextResponse.json({ success: true, error: e.message });
  }
}