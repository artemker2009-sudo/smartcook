import { NextResponse } from "next/server";
import OpenAI from "openai";
import { unstable_cache } from "next/cache";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Заставляем маршрут быть динамическим
export const dynamic = 'force-dynamic';

// Кэшируемая функция
const getDailyRecipe = unstable_cache(
  async (dateStr: string) => {
    console.log(`Generating new Daily Recipe for ${dateStr}...`); 

    const systemPrompt = `
      Ты — ведущий шеф-повар и технолог ресторана.
      Твоя задача — предложить "Блюдо дня" на сегодня (${dateStr}).
      
      Критерии выбора:
      - Блюдо должно быть интересным, вкусным и доступным.
      - Если сегодня праздник, предложи тематическое блюдо.
      
      ЖЕЛЕЗНЫЕ ПРАВИЛА СОСТАВЛЕНИЯ:
      1. ПОРЦИИ: Расчет СТРОГО на 1 персону (одна порция).
      2. ГРАММОВКИ: 
         - Никаких "по вкусу". ТОЛЬКО точные граммы (г) или мл.
         - Пример: "Куриное филе (150 г)", "Рис (80 г)".
      3. ШАГИ: 
         - Максимально подробно.
         - Указывай время для всех процессов.
      4. ПОКУПКИ:
         - Считаем, что у пользователя пустой холодильник.
         - ВСЕ ингредиенты добавь в список missing_ingredients.

      Верни ответ ТОЛЬКО валидный JSON:
      {
        "title": "Красивое название",
        "description": "Аппетитное описание...",
        "time": "Время (мин)",
        "calories": "Ккал",
        "ingredients": ["Список ингредиентов"],
        "missing_ingredients": ["Ингредиент 1", "Ингредиент 2"],
        "detailed_ingredients": [
           { "name": "Продукт", "amount": "Вес/Объем" }
        ],
        "steps": ["Шаг 1...", "Шаг 2..."]
      }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Придумай рецепт дня на ${dateStr}.` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
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