import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { query, sessionId } = await req.json();

    const systemPrompt = `
      Ты — строгий шеф-повар и технолог.
      Твоя задача — написать подробный рецепт по запросу: "${query}".
      
      ПРАВИЛА ТЕХНОЛОГИЧЕСКОЙ КАРТЫ:
      1. ГРАММОВКИ: Все ингредиенты строго с весом (г/мл).
      2. ТАЙМИНГИ: В шагах обязательно указывай время готовки в минутах.
      3. ОПЦИИ: Ингредиенты для подачи помечай "(по желанию)".
      4. ПОРЦИИ: Рассчитывай на 2 персоны (стандарт).

      Верни JSON:
      {
        "title": "Название",
        "description": "Описание",
        "time": "Время (мин)",
        "calories": "Ккал",
        "detailed_ingredients": [
          { "name": "Продукт", "amount": "Вес" }
        ],
        "missing_ingredients": ["Полный список покупок"],
        "steps": ["Шаг 1 с временем...", "Шаг 2..."]
      }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: systemPrompt }],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("Empty response");

    const recipe = JSON.parse(content);

    // СОХРАНЕНИЕ В ИСТОРИЮ
    if (sessionId) {
      await supabase.from('recipes').insert({
        session_id: sessionId,
        title: recipe.title,
        description: recipe.description,
        time: recipe.time,
        calories: recipe.calories,
        ingredients: recipe.detailed_ingredients?.map((i: any) => `${i.name} - ${i.amount}`) || [],
        detailed_ingredients: recipe.detailed_ingredients,
        steps: recipe.steps,
        is_favorite: false
      });
    }

    return NextResponse.json({ recipe });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}