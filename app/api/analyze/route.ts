import { NextResponse } from "next/server";
import OpenAI from "openai";
import { checkAndConsumeAiRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";

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
      Ты — профессиональный шеф-повар.
      Твоя задача:
      1. Найти ингредиенты на фото.
      2. Предложить 3-4 названия блюд.

      === ПРОВЕРКА: ЕСТЬ ЛИ ЕДА НА ФОТО (ВАЖНО) ===
      Сначала реши, есть ли на изображении продукты питания.
      - Если продуктов НЕТ (например: человек, селфи, животное, пейзаж, техника,
        мебель, документ, пустой стол) — верни СТРОГО {"no_food": true, "ingredients": [], "dishes": []}.
        НЕ выдумывай продукты, которых не видно на фото.
      - Упаковки продуктов, готовые блюда и напитки СЧИТАЮТСЯ едой (no_food: false).
      - Если еда есть — верни "no_food": false и заполни ingredients/dishes как обычно.

      ${instructions}
      ${dietaryInstructions}

      Верни ответ ТОЛЬКО в формате JSON:
      {
        "no_food": false,
        "ingredients": ["список найденных продуктов"],
        "dishes": ["Блюдо 1", "Блюдо 2", "Блюдо 3"]
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