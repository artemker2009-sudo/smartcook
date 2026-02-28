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
    const { dish, ingredients, sessionId, allergies, dislikes } = await req.json();

    if (!dish) {
      return NextResponse.json({ error: "No dish provided" }, { status: 400 });
    }

    const productsList = ingredients && ingredients.length > 0 
      ? ingredients.join(", ") 
      : "продукты не указаны";

    let dietaryInstructions = "";
    if ((allergies && allergies.length > 0) || (dislikes && dislikes.length > 0)) {
      dietaryInstructions = `
      === ОГРАНИЧЕНИЯ И ПРЕДПОЧТЕНИЯ (КРИТИЧЕСКИ ВАЖНО) ===
      ${allergies && allergies.length > 0 ? `- АЛЛЕРГИЯ НА: ${allergies.join(", ")}. СТРОГО ИСКЛЮЧИТЬ ИЗ РЕЦЕПТА И ЗАМЕНИТЬ АЛЬТЕРНАТИВОЙ.` : ""}
      ${dislikes && dislikes.length > 0 ? `- НЕ ЛЮБИТ: ${dislikes.join(", ")}. НЕ ИСПОЛЬЗУЙ ИХ, найди альтернативу.` : ""}
      `;
    }

    const systemPrompt = `
      Ты — строгий шеф-повар и профессиональный технолог общепита. 
      Твоя задача — написать ИДЕАЛЬНУЮ ТЕХНОЛОГИЧЕСКУЮ КАРТУ для блюда "${dish}".

      У пользователя есть: ${productsList}.
      
      ${dietaryInstructions}

      === ЖЕЛЕЗНЫЕ ПРАВИЛА ТЕХНОЛОГА ===
      
      1. ПОРЦИЯ:
         - Расчет СТРОГО НА 1 (одну) ПЕРСОНУ. Пользователь сам умножит граммовки на сайте.

      2. ГРАММОВКИ (ТОЧНОСТЬ ДО ГРАММА):
         - Все основные ингредиенты должны иметь точный вес (г) или объем (мл).
         - ЗАПРЕЩЕНО писать "1 шт", "по вкусу" (кроме соли).
         - ПИШИ ТАК: "Морковь (1 шт, 120 г)", "Масло растительное (30 мл)".
      
      3. ВРЕМЯ И ТЕМПЕРАТУРА:
         - В шагах ВСЕГДА указывай точное время в минутах. 
         - НЕЛЬЗЯ писать: "Варите до готовности".
         - НУЖНО писать: "Варите ровно 20 минут", "Запекайте 25 минут при 180°C".

      4. ОФОРМЛЕНИЕ ШАГОВ (ЧИСТОТА И ПОДРОБНОСТЬ):
         - ЗАПРЕЩЕНО писать слова "Шаг 1", "Step 1", "1.", "2." в начале строки.
         - Возвращай просто текст действия.
         - Пиши шаги приготовления максимально подробно и сочно. Объясняй, до какого цвета жарить, как правильно нарезать, добавляй секреты от шефа.

      5. ОБЯЗАТЕЛЬНОЕ vs ПО ЖЕЛАНИЮ:
         - Основные продукты — пиши строго.
         - Дополнительные (хлеб, подача) — помечай "(по желанию)".
      
      6. ПОКУПКИ:
         - В 'missing_ingredients' добавь ВСЁ, чего нет в списке, но нужно для рецепта.

      Верни JSON:
      {
        "title": "Название",
        "description": "Описание",
        "time": "Время (мин)",
        "calories": "Ккал",
        "detailed_ingredients": [
          { "name": "Продукт", "amount": "Вес" }
        ],
        "missing_ingredients": ["Список покупок"],
        "steps": ["Текст шага 1", "Текст шага 2"]
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

    if (sessionId) {
      const dbPayload = {
        session_id: sessionId,
        title: recipe.title,
        description: recipe.description,
        time: recipe.time,
        calories: recipe.calories,
        ingredients: recipe.detailed_ingredients?.map((i: any) => `${i.name} - ${i.amount}`) || [],
        detailed_ingredients: recipe.detailed_ingredients, 
        steps: recipe.steps,
        missing_ingredients: recipe.missing_ingredients,
        is_favorite: false
      };

      const { error: dbError } = await supabase.from('recipes').insert(dbPayload);
      if (dbError) console.error("❌ ОШИБКА СОХРАНЕНИЯ В SUPABASE:", dbError);
    }

    return NextResponse.json({ recipe });
  } catch (error: any) {
    console.error("Recipe generation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}