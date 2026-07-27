// Общий серверный помощник для Telegram-бота основателя. Токен и chat_id живут
// ТОЛЬКО в env на сервере (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) и никогда не
// попадают в клиентский код или логи. Этот модуль нельзя импортировать в
// клиентские ("use client") компоненты.
//
// Используется для премодерации ленты сообщества: при новом посте бот шлёт
// основателю фото + подпись с инлайн-кнопками «Одобрить»/«Отклонить», а
// telegram-webhook обрабатывает нажатие. Существующего бота переиспользуем,
// нового не заводим.

const TELEGRAM_API = "https://api.telegram.org";

function credentials(): { token: string; chatId: string } | null {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId) return null;
  return { token, chatId };
}

// chat_id основателя из env — единственный чат, из которого принимаются решения
// модерации (проверяется в вебхуке). Наружу не отдаётся.
export function founderChatId(): string | null {
  const chatId = (process.env.TELEGRAM_CHAT_ID || "").trim();
  return chatId || null;
}

// Префиксы callback_data кнопок модерации ленты. Уникальны (не пересекаются со
// старым mod_* из удалённого флоу).
export const FEED_APPROVE_PREFIX = "community_approve_";
export const FEED_REJECT_PREFIX = "community_reject_";

// Готовим текст автора к вставке в карточку: вырезаем управляющие символы и
// схлопываем пробелы. parse_mode НЕ используем — карточка уходит обычным
// текстом, поэтому Markdown/HTML пользователя не интерпретируется и сломать
// разметку он не может. Управляющие символы уже режутся на уровне БД/сервера,
// это дополнительная страховка.
function plain(value: string | null | undefined, max: number): string {
  if (!value) return "—";
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, max) || "—";
}

// Отправляет карточку поста на модерацию основателю. Возвращает true при успехе.
// Ошибки глотаем и логируем БЕЗ токена — публикация поста не должна падать
// из-за недоступности Telegram (пост уже в БД как pending, виден в админке).
export async function sendModerationCard(input: {
  postId: string;
  recipeTitle: string | null;
  userName: string | null;
  caption: string | null;
  photoUrl: string;
}): Promise<boolean> {
  const creds = credentials();
  if (!creds) {
    console.error("[telegram] TELEGRAM_BOT_TOKEN/CHAT_ID не заданы — карточка не отправлена");
    return false;
  }

  const captionText =
    `🍽 Новый пост в ленте — на модерацию\n\n` +
    `Блюдо: ${plain(input.recipeTitle, 200)}\n` +
    `Автор: ${plain(input.userName, 100)}\n` +
    `Подпись: ${plain(input.caption, 300)}`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "✅ Одобрить", callback_data: `${FEED_APPROVE_PREFIX}${input.postId}` },
        { text: "❌ Отклонить", callback_data: `${FEED_REJECT_PREFIX}${input.postId}` },
      ],
    ],
  };

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${creds.token}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: creds.chatId,
        photo: input.photoUrl,
        caption: captionText,
        reply_markup: replyMarkup,
      }),
    });
    if (!res.ok) {
      console.error("[telegram] sendPhoto не удался, статус", res.status);
      return false;
    }
    return true;
  } catch {
    console.error("[telegram] sendPhoto: сетевая ошибка");
    return false;
  }
}

// Ответ на нажатие инлайн-кнопки (убирает «часики» в клиенте Telegram).
export async function answerCallbackQuery(callbackQueryId: string, text: string): Promise<void> {
  const creds = credentials();
  if (!creds) return;
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${creds.token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
    // Ошибку не проглатываем: именно молчаливый сбой этого вызова оставляет
    // «часики» на кнопке в вечной загрузке — логируем статус, чтобы было видно.
    if (!res.ok) console.error("[telegram] answerCallbackQuery не удался, статус", res.status);
  } catch {
    console.error("[telegram] answerCallbackQuery: сетевая ошибка");
  }
}

// Обновляет подпись карточки и убирает кнопки после принятого решения.
export async function editCardResult(
  chatId: number | string,
  messageId: number,
  originalCaption: string,
  resultText: string,
): Promise<void> {
  const creds = credentials();
  if (!creds) return;
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${creds.token}/editMessageCaption`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        caption: `${originalCaption}\n\n➖➖➖➖➖➖\n${resultText}`,
        reply_markup: { inline_keyboard: [] },
      }),
    });
    // Логируем сбой (напр. 400 «message is not modified» при повторном
    // нажатии) — раньше он молча терялся. Это перерисовка карточки, поэтому на
    // ответ вебхука не влияет, но в логах теперь виден.
    if (!res.ok) console.error("[telegram] editMessageCaption не удался, статус", res.status);
  } catch {
    console.error("[telegram] editMessageCaption: сетевая ошибка");
  }
}
