import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { query, sessionId } = await req.json();

    const systemPrompt = `
      Ты — строгий инженер-технолог общественного питания.
      Пользователь ищет рецепт: "${query}".
      
      Твоя задача — выдать ИДЕАЛЬНО ТОЧНУЮ технологическую карту блюда ровно на 1 ПОРЦИЮ.
      
      ЖЕЛЕЗНЫЕ ПРАВИЛА (Игнорирование карается):
      1. ГРАММОВКИ: 
         - Расчет строго на 1 человека (1 порция).
         - ЗАПРЕЩЕНО писать "по вкусу" (кроме соли), "на глаз", "немного".
         - ОБЯЗАТЕЛЬНО пиши точный вес (г) или объем (мл) для КАЖДОГО ингредиента.
         - Пример: Не "Сливки", а "Сливки 20% (100 мл)". Не "Спагетти", а "Спагетти (100 г)".
      
      2. ВРЕМЯ:
         - В шагах приготовления ОБЯЗАТЕЛЬНО указывай время в минутах.
         - Пример: "Варить 8 минут", "Жарить 3 минуты".
      
      3. ОПИСАНИЕ:
         - Напиши краткое, вкусное вступление (2 предложения).

      4. ПОКУПКИ (Missing Ingredients):
         - Так как это поиск по названию, считай, что у пользователя дома есть ТОЛЬКО (Соль, Перец, Вода, Масло).
         - ВСЕ остальные ингредиенты добавь в список "missing_ingredients".

      Верни ответ ТОЛЬКО валидный JSON:
      {
        "title": "Точное название блюда",
        "description": "Вкусное описание...",
        "time": "Общее время (мин)",
        "calories": "Ккал на порцию",
        "ingredients": ["Список ингредиентов для отображения"],
        "missing_ingredients": ["Товар 1", "Товар 2"], 
        "detailed_ingredients": [
           { "name": "Продукт", "amount": "Вес/Объем" }
        ],
        "steps": ["Шаг 1 (с минутами)...", "Шаг 2 (с минутами)..."]
      }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Дай рецепт: ${query}` },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("Empty response");

    const recipeData = JSON.parse(content);

    return NextResponse.json({ recipe: recipeData });

  } catch (error: any) {
    console.error("Search recipe error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}