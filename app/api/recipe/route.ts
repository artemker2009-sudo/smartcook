import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// Инициализация клиентов
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

    // Формируем список продуктов для промпта
    const productsList = ingredients && ingredients.length > 0 
      ? ingredients.join(", ") 
      : "продукты не указаны";

    const systemPrompt = `
      Ты — строгий шеф-повар и профессиональный технолог общепита. 
      Твоя задача — написать ИДЕАЛЬНУЮ ТЕХНОЛОГИЧЕСКУЮ КАРТУ для блюда "${dish}".

      У пользователя есть: ${productsList}.

      === ЖЕЛЕЗНЫЕ ПРАВИЛА ТЕХНОЛОГА ===
      
      1. ГРАММОВКИ (ТОЧНОСТЬ ДО ГРАММА):
         - Все основные ингредиенты должны иметь точный вес (г) или объем (мл).
         - ЗАПРЕЩЕНО писать "1 шт", "по вкусу" (кроме соли) или "на глаз".
         - ПИШИ ТАК: "Морковь (1 шт, 120 г)", "Масло растительное (30 мл)".
      
      2. ВРЕМЯ И ТЕМПЕРАТУРА (КРИТИЧНО):
         - В шагах ВСЕГДА указывай точное время в минутах. 
         - НЕЛЬЗЯ писать: "Варите до готовности" или "Пока не загустеет".
         - НУЖНО писать: "Варите ровно 20 минут на среднем огне", "Запекайте 25 минут при 180°C".

      3. ОФОРМЛЕНИЕ ШАГОВ (ВАЖНО!):
         - ЗАПРЕЩЕНО писать слова "Шаг 1", "Step 1", "1.", "2.".
         - Возвращай просто чистый текст инструкции. Наш интерфейс сам расставит цифры.
         - Пример правильного шага: "Нарежьте лук мелким кубиком и обжарьте 5 минут."
         - Пример НЕПРАВИЛЬНОГО: "Шаг 1. Нарежьте лук..."

      4. ОБЯЗАТЕЛЬНОЕ vs ПО ЖЕЛАНИЮ:
         - Основные продукты (мясо, гарнир, соус) — пиши строго.
         - Дополнительные (хлеб, сметана для подачи, украшение) — помечай в названии: "Зелень (по желанию)", "Багет (для подачи)".
      
      5. СПИСОК ПОКУПОК:
         - В 'missing_ingredients' добавь АБСОЛЮТНО ВСЕ, чего нет в списке '${productsList}', но что нужно для рецепта.

      Верни ответ ТОЛЬКО в формате JSON:
      {
        "title": "Полное название блюда",
        "description": "Аппетитное описание (2-3 предложения)",
        "time": "Общее время (например: 45 мин)",
        "calories": "Ккал на порцию",
        "detailed_ingredients": [
          { "name": "Картофель", "amount": "200 г" },
          { "name": "Сметана (для подачи)", "amount": "30 г" }
        ],
        "missing_ingredients": ["Сметана", "Укроп", "Соль"],
        "steps": [
          "Нарежьте картофель кубиками.",
          "Обжаривайте 15 минут..."
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

    // --- СОХРАНЕНИЕ В БАЗУ ДАННЫХ (ИСТОРИЯ) ---
    if (sessionId) {
      console.log("Saving recipe to DB for session:", sessionId);
      
      const { error: dbError } = await supabase.from('recipes').insert({
        session_id: sessionId,
        title: recipe.title,
        description: recipe.description,
        time: recipe.time,
        calories: recipe.calories,
        // Сохраняем упрощенный список для старых версий и подробный для новых
        ingredients: recipe.detailed_ingredients?.map((i: any) => `${i.name} - ${i.amount}`) || [],
        detailed_ingredients: recipe.detailed_ingredients, 
        steps: recipe.steps,
        is_favorite: false
      });

      if (dbError) {
        console.error("Supabase Save Error:", dbError);
      } else {
        console.log("Recipe saved successfully.");
      }
    }

    return NextResponse.json({ recipe });
  } catch (error: any) {
    console.error("Recipe generation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}