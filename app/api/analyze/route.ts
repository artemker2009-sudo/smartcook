import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File;
    // Получаем режим готовки от клиента (по умолчанию 'strict')
    const mode = formData.get("mode") as string || 'strict';

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");
    const dataUrl = `data:${file.type};base64,${base64Image}`;

    // ДВА РАЗНЫХ ПРОМПТА В ЗАВИСИМОСТИ ОТ РЕЖИМА
    let instructions = "";

    if (mode === 'strict') {
      // СТРОГИЙ РЕЖИМ
      instructions = `
        РЕЖИМ: "ЭКОНОМИЯ / ЧИСТКА ХОЛОДИЛЬНИКА".
        1. Исходи из того, что у пользователя дома есть ТОЛЬКО: Вода, Соль, Перец, Сахар, Растительное масло.
        2. Ингредиенты на фото — это ВСЁ, что есть.
        3. НЕ предлагай блюда, требующие докупить что-то существенное (мясо, сливки, яйца), если их нет на фото.
        4. Если на фото только макароны -> Предлагай "Жареная вермишель", "Макароны с маслом".
      `;
    } else {
      // РЕЖИМ "МОГУ ДОКУПИТЬ"
      instructions = `
        РЕЖИМ: "ВКУСНО / ГОТОВ СХОДИТЬ В МАГАЗИН".
        1. Ты можешь предложить блюда, для которых нужно ДОКУПИТЬ 1-2 ингредиента, чтобы было вкуснее.
        2. Например: если видишь макароны, предложи "Паста Карбонара" (надо докупить бекон/сливки) или "Макароны по-флотски" (докупить фарш).
        3. Но основа блюда (80%) всё равно должна быть из того, что на фото.
      `;
    }

    const prompt = `
      Ты — профессиональный шеф-повар.
      Твоя задача:
      1. Найти ингредиенты на фото.
      2. Предложить 3-4 названия блюд.
      
      ${instructions}
      
      Верни ответ ТОЛЬКО в формате JSON:
      {
        "ingredients": ["список найденных продуктов"],
        "dishes": ["Блюдо 1", "Блюдо 2", "Блюдо 3"]
      }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
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