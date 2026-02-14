import { NextResponse } from "next/server";
import OpenAI from "openai";
import { unstable_cache } from "next/cache";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Заставляем маршрут быть динамическим
export const dynamic = 'force-dynamic';

const getDailyRecipe = unstable_cache(
  async (dateStr: string) => {
    console.log(`Generating Seasonal Daily Recipe for ${dateStr}...`); 

    const systemPrompt = `
      Ты — ведущий шеф-повар и главный технолог ресторана.
      Твоя задача — предложить идеальное "Блюдо дня" на сегодня (${dateStr}).
      
      ЭТАП 1: ВЫБОР БЛЮДА (КРЕАТИВНОСТЬ)
      - Посмотри на дату.
      - ЕСЛИ СЕГОДНЯ ПРАЗДНИК (Новый год, 14 февраля, 8 марта, Масленица, Пасха и т.д.) — предложи ТЕМАТИЧЕСКОЕ праздничное блюдо.
      - Если праздника нет — предложи блюдо из СЕЗОННЫХ продуктов (летом — легкое/ягодное, зимой — сытное/согревающее).
      - Блюдо должно быть интересным, но реальным для приготовления дома.

      ЭТАП 2: ТЕХНОЛОГИЧЕСКАЯ КАРТА (СТРОГОСТЬ)
      1. ПОРЦИЯ:
         - Расчет СТРОГО на 1 персону.
      
      2. ТОЧНОСТЬ (ГРАММЫ И МИНУТЫ):
         - Ингредиенты: Только точные граммы (г) или мл. Пример: "Рис (80 г)", "Вода (150 мл)".
         - Шаги: В КАЖДОМ шаге, где есть жарка/варка/запекание, указывай ТОЧНОЕ время в минутах.
         - Пример: "Обжаривайте лук ровно 5 минут", "Запекайте 25 минут при 180°C".

      3. ОБЯЗАТЕЛЬНОЕ vs ПО ЖЕЛАНИЮ:
         - Основные продукты (мясо, овощи в рагу) — пиши строго.
         - То, что идет для подачи или украшения (зелень, сметана к супу, хлеб), помечай в названии: "Укроп (для подачи)", "Багет (по желанию)".
      
      4. СПИСОК ПОКУПОК:
         - Считаем, что холодильник пуст. В missing_ingredients добавь АБСОЛЮТНО ВСЕ ингредиенты (включая соль, масло и опциональные).

      Верни JSON:
      {
        "title": "Название (например: Романтическая паста с креветками)",
        "description": "Почему это блюдо идеально подходит именно сегодня (сезон/праздник)...",
        "time": "Время (мин)",
        "calories": "Ккал",
        "ingredients": ["Краткий список"],
        "missing_ingredients": ["Все продукты для покупки"],
        "detailed_ingredients": [
           { "name": "Креветки", "amount": "150 г" },
           { "name": "Пармезан (по желанию)", "amount": "10 г" }
        ],
        "steps": ["Шаг 1 (с минутами)...", "Шаг 2..."]
      }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Придумай рецепт дня на ${dateStr} с учетом праздников и сезона.` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.6, // Чуть выше температура, чтобы он лучше креативил с праздниками
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("Empty response");

    return JSON.parse(content);
  },
  ['daily-recipe-cache'], 
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