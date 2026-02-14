import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// 1. Инициализируем Supabase и OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { dish, ingredients, sessionId } = await req.json();

    if (!dish) {
      return NextResponse.json({ error: "No dish provided" }, { status: 400 });
    }

    const productsList = ingredients && ingredients.length > 0 
      ? ingredients.join(", ") 
      : "продукты не указаны";

    // 2. Генерируем рецепт (СТРОГИЙ РЕЖИМ)
    const systemPrompt = `
      Ты — строгий шеф-повар и технолог ресторана. 
      Твоя задача — написать ИДЕАЛЬНУЮ ТЕХНОЛОГИЧЕСКУЮ КАРТУ для блюда "${dish}".

      У пользователя есть: ${productsList}.

      СТРОГИЕ ПРАВИЛА:
      1. ГРАММОВКИ: Все основные ингредиенты должны иметь точный вес (г) или объем (мл).
      2. ВРЕМЯ: В шагах ВСЕГДА указывай точное время (мин) и температуру.
      3. ОПЦИОНАЛЬНО: Дополнительные продукты помечай "(по желанию)" или "(для подачи)".
      4. ПОКУПКИ: В 'missing_ingredients' добавь то, чего нет в списке '${productsList}'.

      Верни ответ JSON:
      {
        "title": "Название",
        "description": "Описание",
        "time": "Время (мин)",
        "calories": "Ккал",
        "detailed_ingredients": [
          { "name": "Продукт", "amount": "Вес" }
        ],
        "missing_ingredients": ["Продукт 1", "Продукт 2"],
        "steps": ["Шаг 1...", "Шаг 2..."]
      }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Составь техкарту для "${dish}".` },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("Empty response from OpenAI");

    const recipe = JSON.parse(content);

    // 3. СОХРАНЯЕМ В ИСТОРИЮ (SUPABASE) — ВОТ ЭТО Я ВЕРНУЛ
    if (sessionId) {
      const { error: dbError } = await supabase.from('recipes').insert({
        session_id: sessionId,
        title: recipe.title,
        description: recipe.description,
        time: recipe.time,
        calories: recipe.calories,
        // Сохраняем подробные ингредиенты, если есть колонка, или просто список
        ingredients: recipe.detailed_ingredients?.map((i: any) => `${i.name} - ${i.amount}`) || [],
        detailed_ingredients: recipe.detailed_ingredients, 
        steps: recipe.steps,
        is_favorite: false
      });

      if (dbError) {
        console.error("Supabase Save Error:", dbError);
        // Не ломаем работу, если не сохранилось, но пишем в лог
      }
    }

    return NextResponse.json({ recipe });
  } catch (error: any) {
    console.error("Recipe generation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}