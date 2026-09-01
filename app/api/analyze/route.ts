import { NextResponse } from "next/server";
import OpenAI from "openai";
import { checkAndConsumeAiRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";

// Распознавание фото (vision) — самый долгий вызов в продукте: на снимке
// открытого холодильника модель возвращает список продуктов, три блюда и
// uncertain, и это заметно дольше текстовой генерации. Без явного maxDuration
// платформа убивает функцию по короткому дефолту — соединение рвётся, и на
// iPhone это выглядит как «Load failed» (репорты в error_reports).
//
// Важно: клиентский таймаут PHOTO_STEP_TIMEOUT_MS = 30с. Пока серверный лимит
// был МЕНЬШЕ клиентского, наш AbortController не успевал сработать, и в
// телеметрию шёл невнятный "analyze" вместо честного "analyze-timeout".
// Серверный запас обязан быть больше клиентского — иначе мы не видим таймауты.
export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ANALYZE_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_FIELD_LENGTH = 500;

export async function POST(req: Request) {
  try {
    if (!isTrustedOrigin(req)) return originBlockedResponse();

    const formData = await req.formData();
    const file = formData.get("image") as File;
    const mode = formData.get("mode") as string || 'strict';
    const allergies = ((formData.get("allergies") as string) || '').slice(0, MAX_TEXT_FIELD_LENGTH);
    const dislikes = ((formData.get("dislikes") as string) || '').slice(0, MAX_TEXT_FIELD_LENGTH);

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Можно загружать только изображения" }, { status: 400 });
    }

    if (file.size > ANALYZE_PHOTO_MAX_BYTES) {
      return NextResponse.json({ error: "Файл слишком большой. Максимум 10 МБ" }, { status: 413 });
    }

    const rateLimit = await checkAndConsumeAiRateLimit(req, "analyze");
    if (!rateLimit.ok) return rateLimitResponse(rateLimit);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");
    const dataUrl = `data:${file.type};base64,${base64Image}`;

    let instructions = "";

    if (mode === 'strict') {
      instructions = `
        РЕЖИМ: "ЭКОНОМИЯ / ЧИСТКА ХОЛОДИЛЬНИКА".
        1. Исходи из того, что у пользователя дома есть ТОЛЬКО: Вода, Соль, Перец, Сахар, Растительное масло.
        2. Ингредиенты на фото — это ВСЁ, что есть.
        3. НЕ предлагай блюда, требующие докупить что-то существенное (мясо, сливки, яйца), если их нет на фото.
        4. Если на фото только макароны -> Предлагай "Жареная вермишель", "Макароны с маслом".
      `;
    } else {
      instructions = `
        РЕЖИМ: "ВКУСНО / ГОТОВ СХОДИТЬ В МАГАЗИН".
        1. Ты можешь предложить блюда, для которых нужно ДОКУПИТЬ 1-2 ингредиента, чтобы было вкуснее.
        2. Например: если видишь макароны, предложи "Паста Карбонара" (надо докупить бекон/сливки) или "Макароны по-флотски" (докупить фарш).
        3. Но основа блюда (80%) всё равно должна быть из того, что на фото.
      `;
    }

    let dietaryInstructions = "";
    if (allergies || dislikes) {
      dietaryInstructions = `
      === ОГРАНИЧЕНИЯ И ПРЕДПОЧТЕНИЯ (КРИТИЧЕСКИ ВАЖНО) ===
      ${allergies ? `- У пользователя АЛЛЕРГИЯ НА: ${allergies}. СТРОГО ИСКЛЮЧИТЬ ЛЮБЫЕ БЛЮДА С ЭТИМИ ИНГРЕДИЕНТАМИ.` : ""}
      ${dislikes ? `- Пользователь НЕ ЛЮБИТ: ${dislikes}. Постарайся предложить блюда без них.` : ""}
      `;
    }

    const prompt = `
      Ты — профессиональный шеф-повар и внимательный ассистент по распознаванию
      продуктов на фото. Твоя задача:
      1. Максимально полно перечислить продукты, которые ВИДНО на фото.
      2. Предложить 3-4 названия блюд из этих продуктов.

      === ШАГ 1. ЕСТЬ ЛИ ЕДА НА ФОТО (ВАЖНО) ===
      Сначала реши, есть ли на изображении продукты питания.
      - Если продуктов НЕТ (например: человек, селфи, животное, пейзаж, техника,
        мебель, документ, пустой стол) — верни СТРОГО
        {"no_food": true, "ingredients": [], "dishes": [], "uncertain": []}.
      - Упаковки продуктов, готовые блюда и напитки СЧИТАЮТСЯ едой (no_food: false).
      - Если еда есть — верни "no_food": false и заполни поля как описано ниже.

      === ШАГ 2. РАСПОЗНАВАНИЕ ПРОДУКТОВ (главное) ===
      Типичные сцены пользователя: открытый холодильник (осмотри полки, дверцу и
      нижние ящики), стол с разложенными продуктами, полка или шкаф с припасами.
      Пройди взглядом по всей картинке, включая задний план и углы.
      Правила:
      - Перечисли ВСЕ различимые продукты, в том числе частично видимые (виден
        только край, продукт выглядывает из-за другого) и продукты в упаковке —
        определяй их по этикеткам, форме и цвету упаковки.
      - НИЧЕГО НЕ ВЫДУМЫВАЙ. Вноси только то, что реально видно на этом фото. Не
        додумывай «типичное содержимое холодильника» и не угадывай, что внутри
        непрозрачных пакетов, банок и коробок без читаемой этикетки.
      - Если сомневаешься, что это за продукт (плохо видно, спорная упаковка), —
        всё равно можешь его добавить в "ingredients", но продублируй его название
        в массиве "uncertain". Если уверен во всём — "uncertain": [].
      - Нормализуй названия: по-русски, в именительном падеже, в обычной словарной
        форме единственного числа там, где так говорят («огурец», «морковь»,
        «яйцо»). Переводи иностранные этикетки на русский:
        "Cherry tomatoes" → «помидоры черри», "Milk" → «молоко». Убирай бренды,
        вес и лишние слова: «Простоквашино молоко 3.2% 900 г» → «молоко».
      - Не дублируй один и тот же продукт разными словами.

      ${instructions}
      ${dietaryInstructions}

      === ФОРМАТ ОТВЕТА ===
      Верни ответ ТОЛЬКО в формате JSON (без пояснений и текста вне JSON):
      {
        "no_food": false,
        "ingredients": ["список найденных продуктов"],
        "dishes": ["Блюдо 1", "Блюдо 2", "Блюдо 3"],
        "uncertain": ["продукты, в которых не уверен — подмножество ingredients"]
      }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error("No output");

    const json = JSON.parse(content);

    return NextResponse.json({ data: json });

  } catch (error: any) {
    console.error("Analyze error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}