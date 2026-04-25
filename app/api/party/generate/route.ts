import { NextResponse } from "next/server";
import OpenAI from "openai";

export const maxDuration = 60;
export const runtime = "edge";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { title, guestCount } = await req.json();

    if (!title || typeof guestCount !== "number") {
      return NextResponse.json(
        { error: "Нужно передать title и guestCount" },
        { status: 400 }
      );
    }

    const systemPrompt = `Ты шеф-повар. Составь меню для мероприятия: ${title} на ${guestCount} человек. Верни СТРОГИЙ JSON формат: { "menu": [ { "name": "Название блюда", "category": "Закуски" | "Горячее блюдо" | "Напитки", "ingredients": [ { "name": "Продукт", "amount": число, "unit": "шт/г/мл" } ] } ] }. Ингредиенты должны быть УЖЕ умножены на количество гостей.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Составь меню для "${title}" на ${guestCount} человек.`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;

    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    let cleanText = content.replace(/```json/g, "").replace(/```/g, "").trim();

    const arrayStartIndex = cleanText.indexOf("[");
    const arrayEndIndex = cleanText.lastIndexOf("]");

    if (arrayStartIndex !== -1 && arrayEndIndex !== -1) {
      cleanText = cleanText.substring(arrayStartIndex, arrayEndIndex + 1);
      return NextResponse.json({ menu: JSON.parse(cleanText) });
    }

    const objectStartIndex = cleanText.indexOf("{");
    const objectEndIndex = cleanText.lastIndexOf("}");

    if (objectStartIndex !== -1 && objectEndIndex !== -1) {
      cleanText = cleanText.substring(objectStartIndex, objectEndIndex + 1);
    }

    return NextResponse.json(JSON.parse(cleanText));
  } catch (error: any) {
    console.error("Party menu generation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
