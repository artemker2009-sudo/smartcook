import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

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

    const systemPrompt = `
      Ты — строгий шеф-повар и главный технолог ресторана. 
      Твоя задача — написать ИДЕАЛЬНУЮ ТЕХНОЛОГИЧЕСКУЮ КАРТУ для блюда "${dish}".

      У пользователя есть: ${productsList}.

      ЖЕЛЕЗНЫЕ ПРАВИЛА ТЕХНОЛОГА:
      
      1. ГРАММОВКИ (ТОЧНОСТЬ):
         - Все основные ингредиенты должны иметь точный вес (г) или объем (мл).
         - Не пиши "1 штука", пиши "Морковь (1 шт, ок. 100 г)".
      
      2. ВРЕМЯ И ТЕМПЕРАТУРА (КРИТИЧНО):
         - В шагах ВСЕГДА указывай точное время. 
         - НЕЛЬЗЯ писать: "Варите до готовности".
         - НУЖНО писать: "Варите ровно 20 минут на среднем огне".
         - Если духовка — указывай градусы (например, 180°C).

      3. ОБЯЗАТЕЛЬНОЕ vs ПО ЖЕЛАНИЮ:
         - Основные продукты (мясо, рыба, база супа, гарнир) — пиши строго.
         - Дополнительные (сметана для подачи, хлеб вприкуску, зелень для украшения) — помечай в названии как "(по желанию)" или "(для подачи)".
      
      4. СПИСОК ПОКУПОК:
         - В 'missing_ingredients' добавь ВСЁ, чего нет в списке '${productsList}', но что нужно для рецепта (включая соль, масло и опциональное).

      Формат ответа JSON:
      {
        "title": "Название блюда",
        "description": "Краткое описание",
        "time": "Общее время (например: 45 мин)",
        "calories": "Ккал на порцию",
        "detailed_ingredients": [
          { "name": "Картофель", "amount": "200 г" },
          { "name": "Сметана (для подачи)", "amount": "30 г" }
        ],
        "missing_ingredients": ["Сметана", "Укроп"],
        "steps": [
          "Нарежьте картофель кубиками 2х2 см.",
          "Обжаривайте на сильном огне ровно 5 минут до корочки."
        ]
      }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Составь полную техкарту для "${dish}".` },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("Empty response from OpenAI");

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
  } catch (error: any) {
    console.error("Recipe generation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}