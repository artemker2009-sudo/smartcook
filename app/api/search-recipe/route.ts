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
      Ты — строгий шеф-повар и профессиональный технолог.
      Твоя задача — написать ИДЕАЛЬНУЮ ТЕХНОЛОГИЧЕСКУЮ КАРТУ по запросу: "${query}".
      
      === ЖЕЛЕЗНЫЕ ПРАВИЛА ===
      1. ГРАММОВКИ: 
         - Все ингредиенты СТРОГО с весом (г) или объемом (мл). 
         - Никаких "на глаз" или "по вкусу" (кроме соли).
      
      2. ТАЙМИНГИ: 
         - В шагах ОБЯЗАТЕЛЬНО указывай время готовки в минутах (например, "варите ровно 10 минут").
      
      3. ОФОРМЛЕНИЕ ШАГОВ (ВАЖНО): 
         - НЕ пиши "Шаг 1", "1.", "Step 1". 
         - Пиши только чистое действие. Наш сайт сам поставит цифры.
         - Пример: "Нарежьте лук кубиком и обжарьте 5 минут."
      
      4. ОПЦИИ: 
         - Ингредиенты для подачи (сметана, зелень, хлеб) помечай в названии: "Сметана (для подачи)", "Хлеб (по желанию)".
      
      5. ПОРЦИИ: 
         - Рассчитывай на 2 персоны (стандарт).

      Верни JSON:
      {
        "title": "Название",
        "description": "Аппетитное описание",
        "time": "Время (мин)",
        "calories": "Ккал",
        "detailed_ingredients": [
          { "name": "Продукт (пометка если доп)", "amount": "Вес" }
        ],
        "missing_ingredients": ["Полный список покупок"],
        "steps": ["Текст шага 1", "Текст шага 2"]
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

    // --- СОХРАНЕНИЕ В ИСТОРИЮ (SUPABASE) ---
    if (sessionId) {
      const { error } = await supabase.from('recipes').insert({
        session_id: sessionId,
        title: recipe.title,
        description: recipe.description,
        time: recipe.time,
        calories: recipe.calories,
        // Сохраняем и простой список (для старых версий), и подробный JSON
        ingredients: recipe.detailed_ingredients?.map((i: any) => `${i.name} - ${i.amount}`) || [],
        detailed_ingredients: recipe.detailed_ingredients,
        missing_ingredients: recipe.missing_ingredients,
        steps: recipe.steps,
        is_favorite: false
      });
      
      if (error) {
        console.error("History save error:", error);
      }
    }

    return NextResponse.json({ recipe });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}