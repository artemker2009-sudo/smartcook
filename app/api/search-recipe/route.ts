import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// ИСПРАВЛЕНИЕ: Добавлен .trim() для защиты от невидимых пробелов и переносов строк в ключах
const openai = new OpenAI({ 
  apiKey: (process.env.OPENAI_API_KEY || "").trim() 
});

const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
  (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim()
);

export async function POST(req: Request) {
  try {
    const { query, sessionId } = await req.json();

    // Базовая проверка на пустоту
    if (!query || query.trim().length < 2) {
       return NextResponse.json({ error: "Введите название блюда" }, { status: 400 });
    }

    // 2. Промпт с "Фейс-контролем" и правилом на 1 персону
    const systemPrompt = `
      Ты — строгий профессиональный шеф-повар и технолог.
      Пользователь просит рецепт: "${query}".

      === ЭТАП 1: ПРОВЕРКА НА АДЕКВАТНОСТЬ (ФИЛЬТР) ===
      Проанализируй запрос.
      ЕСЛИ ЭТО:
      - Бессмысленный набор букв (пример: "ываыва", "gjhkjkl").
      - Несуществующее слово или выдуманное название.
      - Несъедобный предмет (пример: "жареные гвозди", "бетон").
      - Оскорбление или спам.
      
      ТОГДА ВЕРНИ СТРОГО JSON С ОШИБКОЙ:
      {
        "error": "Такого блюда не существует. Проверьте название."
      }

      === ЭТАП 2: ЕСЛИ ЭТО РЕАЛЬНАЯ ЕДА — ПИШИ ТЕХКАРТУ ===
      Составь идеальный рецепт, соблюдая правила:
      
      1. ПОРЦИЯ:
         - Расчет СТРОГО НА 1 (одну) ПЕРСОНУ. Пользователь сам умножит граммовки на сайте.
      
      2. ГРАММОВКИ: 
         - Все ингредиенты указывай СТРОГО с весом (г) или объемом (мл).
         - Не пиши "по вкусу" (кроме соли/перца) или "на глаз".
         - Пример: "Лук репчатый (1 шт., 80 г)".
      
      3. ТАЙМИНГИ И ТЕМПЕРАТУРА: 
         - В шагах ОБЯЗАТЕЛЬНО указывай время готовки в минутах.
         - Если запекание — указывай температуру (градусы).
      
      4. ОФОРМЛЕНИЕ ШАГОВ (ЧИСТОТА И ПОДРОБНОСТЬ): 
         - НЕ пиши "Шаг 1", "1.". Пиши только чистый текст действия.
         - Пиши шаги приготовления максимально подробно и сочно. Объясняй, до какого цвета жарить, как правильно нарезать, добавляй секреты от шефа, чтобы даже новичок приготовил ресторанное блюдо.
      
      5. ОПЦИИ: 
         - Ингредиенты для подачи (сметана, хлеб, зелень) помечай: "(по желанию)" или "(для подачи)".

      Верни JSON (если блюдо реальное):
      {
        "title": "Правильное название блюда",
        "description": "Краткое описание",
        "time": "Общее время (например: 30 мин)",
        "calories": "Ккал на порцию",
        "detailed_ingredients": [
          { "name": "Продукт", "amount": "Вес (г/мл)" }
        ],
        "missing_ingredients": ["Полный список покупок"],
        "steps": ["Текст первого действия...", "Текст второго действия..."]
      }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: systemPrompt }],
      response_format: { type: "json_object" },
      temperature: 0.3, // Низкая температура, чтобы он не выдумывал несуществующие блюда
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("Empty response");

    const result = JSON.parse(content);

    // 3. Если ИИ сказал, что это бред — возвращаем ошибку клиенту
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const recipe = result;

    // 4. Сохраняем в историю (только если рецепт настоящий)
    if (sessionId) {
      const { error } = await supabase.from('recipes').insert({
        session_id: sessionId,
        title: recipe.title,
        description: recipe.description,
        time: recipe.time,
        calories: recipe.calories,
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