import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { postId, recipeTitle, userName, comment, photoUrl } = await req.json();

    // Берем ключи из переменных окружения
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
      console.error("Отсутствуют ключи Telegram в .env");
      return NextResponse.json({ success: false, error: "Телеграм не настроен" });
    }

    // Красивый текст сообщения для тебя
    const caption = `🔥 *Новое фото на проверку!*\n\n👨‍🍳 *Блюдо:* ${recipeTitle}\n👤 *Автор:* ${userName}\n💬 *Комментарий:* ${comment}\n\nID поста: ${postId}`;

    // Клавиатура с кнопками под фото
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "✅ Одобрить", callback_data: `mod_approve_${postId}` },
          { text: "❌ Удалить", callback_data: `mod_reject_${postId}` }
        ]
      ]
    };

    // Отправляем фото и текст в Телеграм
    const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
    
    const res = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        photo: photoUrl,
        caption: caption,
        parse_mode: "Markdown",
        reply_markup: replyMarkup
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Ошибка Telegram API:", err);
      throw new Error("Не удалось отправить сообщение в ТГ");
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Telegram API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}