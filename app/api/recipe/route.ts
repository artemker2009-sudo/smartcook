import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { dish, ingredients, sessionId } = await req.json();

    const systemPrompt = `
      Ты — профессиональный инженер-технолог общественного питания.
      Твоя задача — составить ИДЕАЛЬНО ТОЧНЫЙ рецепт и определить, чего не хватает пользователю.
      
      Вводные данные:
      - Блюдо: "${dish}"
      - Есть в наличии: ${ingredients.join(", ")}
      
      СТРОГИЕ ПРАВИЛА СОСТАВЛЕНИЯ РЕЦЕПТА:
      1. НИКАКОЙ "ВОДЫ". Только сухие инструкции.
      2. ГРАММОВКИ: Для КАЖДОГО ингредиента укажи точный вес (г) или объем (мл).
      3. ВРЕМЯ: В каждом шаге пиши ТОЧНОЕ время.
      4. АНАЛИЗ НЕДОСТАЮЩЕГО (ВАЖНО!):
         - Сравни список того, что ЕСТЬ, с тем, что НУЖНО для идеального рецепта.
         - Если каких-то ВАЖНЫХ ингредиентов нет (например: нужны сливки, а их нет; нужна томатная паста, а её нет) — добавь их в список "missing_ingredients".
         - Базовые вещи (соль, перец, вода, растительное масло, сахар) считаем, что есть у всех — их в "недостающее" писать НЕ НАДО.
         - Если ингредиент можно заменить тем, что есть — заменяй и не пиши в недостающее.

      Верни ответ ТОЛЬКО валидный JSON:
      {
        "title": "Название",
        "time": "Время (мин)",
        "calories": "Ккал",
        "ingredients": ["Список для отображения (включая и то, что есть, и то, что надо докупить)"],
        "missing_ingredients": ["Сливки 20%", "Свежий базилик"], 
        "detailed_ingredients": [
           { "name": "Продукт", "amount": "Вес/Объем" }
        ],
        "steps": ["Шаг 1...", "Шаг 2..."]
      }
    `;

    const userMessage = `Блюдо: "${dish}". Ингредиенты пользователя: ${ingredients.join(", ")}.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Или "gpt-3.5-turbo"
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("Empty response");

    const recipeData = JSON.parse(content);

    return NextResponse.json({ recipe: recipeData });

  } catch (error: any) {
    console.error("OpenAI error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}