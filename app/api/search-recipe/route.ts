import { NextResponse } from "next/server";
import OpenAI from "openai";
import { unstable_cache } from "next/cache";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Заставляем маршрут быть динамическим, чтобы проверять дату
export const dynamic = 'force-dynamic';

const getDailyRecipe = unstable_cache(
  async (dateStr: string) => {
    console.log(`Generating Seasonal & Strict Daily Recipe for ${dateStr}...`); 

    const systemPrompt = `
      Ты — элитный шеф-повар и педантичный технолог ресторана.
      Твоя задача — создать "Блюдо дня" на сегодня: ${dateStr}.

      === ЭТАП 1: ТВОРЧЕСТВО (СЕЗОН И ПРАЗДНИКИ) ===
      1. Проанализируй дату (${dateStr}).
      2. ЕСТЬ ЛИ ПРАЗДНИК? 
         - Если сегодня (или скоро) праздник (14 февраля, 23 февраля, 8 марта, Масленица, Пасха, Новый год) — предложи ТЕМАТИЧЕСКОЕ блюдо.
         - Например: 14 февраля — что-то изысканное/романтичное; Масленица — блины.
      3. ЕСЛИ ПРАЗДНИКА НЕТ:
         - Предложи СЕЗОННОЕ блюдо.
         - Весна: свежая зелень, ранние овощи, легкие и витаминные блюда.
         - Лето: легкое, свежее, ягодное.
         - Зима: сытное, горячее, согревающее.
         - Осень: тыква, грибы, корнеплоды.

      === ЭТАП 2: ТЕХНОЛОГИЯ (СТРОГОСТЬ) ===
      Когда блюдо выбрано, составь идеальный рецепт, соблюдая правила:
      
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
         - ЗАПРЕЩЕНО писать граммовки и миллилитры внутри самих шагов. Все цифры веса должны быть ТОЛЬКО в списке ингредиентов. В шагах пиши просто действия (например: "добавьте муку", а не "добавьте 100 г муки").
         - Пиши шаги приготовления максимально подробно и сочно. Объясняй, до какого цвета жарить, как правильно нарезать, добавляй секреты от шефа, чтобы даже новичок приготовил ресторанное блюдо.
      
      5. ОПЦИИ И ПОКУПКИ: 
         - Ингредиенты для подачи (сметана, хлеб, зелень) помечай: "(по желанию)" или "(для подачи)".
         - В missing_ingredients добавь ПОЛНЫЙ список всего, что нужно (считаем, что кухня пустая).

      Верни JSON:
      {
        "title": "Название (Например: Романтическое ризотто)",
        "description": "Почему это блюдо идеально именно сегодня (праздник/сезон)...",
        "time": "Время (мин)",
        "calories": "Ккал",
        "ingredients": ["Краткий список"],
        "missing_ingredients": ["Полный список покупок"],
        "detailed_ingredients": [
           { "name": "Продукт", "amount": "Вес" }
        ],
        "steps": ["Текст шага 1...", "Текст шага 2..."]
      }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Придумай рецепт дня на ${dateStr} с учетом праздников.` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7, // Чуть выше креативность для праздников
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("Empty response");

    return JSON.parse(content);
  },
  ['daily-seasonal-v4'], // Новый ключ кэша, чтобы сбросить старый рецепт
  { 
    revalidate: 3600 * 24 
  }
);

export async function GET() {
  try {
    const date = new Date().toLocaleDateString("ru-RU", {
      timeZone: "Europe/Moscow",
    });

    const recipeData = await getDailyRecipe(date);

    return NextResponse.json({ ...recipeData, date });

  } catch (error: any) {
    console.error("Daily recipe error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}