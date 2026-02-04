import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File;

    if (!file) {
      return NextResponse.json({ error: "Файл не получен" }, { status: 400 });
    }

    // 1. Превращаем файл в Base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");
    const mimeType = file.type;
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    // 2. Отправляем в OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Посмотри на фото. 1. Перечисли список продуктов, которые ты видишь. 2. Предложи 3 названия блюд, которые можно приготовить из этих продуктов. Верни ответ строго в формате JSON: { \"ingredients\": [\"продукт1\", \"продукт2\"], \"dishes\": [\"блюдо1\", \"блюдо2\", \"блюдо3\"] }. Не пиши ничего лишнего."
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
                detail: "low"
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    // 3. Обработка ответа
    const content = response.choices[0].message.content;
    if (!content) return NextResponse.json({ error: "Пустой ответ" }, { status: 500 });

    const result = JSON.parse(content);
    return NextResponse.json({ ok: true, data: result });

  } catch (error: any) {
    console.error("Ошибка API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}