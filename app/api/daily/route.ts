import { NextResponse } from "next/server";
import OpenAI from "openai";
import { unstable_cache } from "next/cache";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const dynamic = 'force-dynamic';

const getDailyRecipe = unstable_cache(
  async (dateStr: string) => {
    console.log(`Generating precise Daily Recipe for ${dateStr}...`); 

    const systemPrompt = `
      Ты — главный технолог сети ресторанов.
      Твоя задача — выдать "Блюдо дня" на сегодня (${dateStr}).
      
      ПРАВИЛА ТЕХНОЛОГИЧЕСКОЙ КАРТЫ:
      
      1. ПОРЦИЯ:
         - Строго на 1 персону.
      
      2. ТОЧНОСТЬ (ГРАММЫ И МИНУТЫ):
         - Ингредиенты: Только в граммах (г) или мл. Пример: "Рис (80 г)", а не "полчашки".
         - Шаги: В КАЖДОМ шаге, где есть термообработка, указывай точное время в минутах.
         - Пример: "Жарьте лук 3 минуты до прозрачности", "Запекайте 25 минут при 180°C".

      3. ОПЦИОНАЛЬНЫЕ ПРОДУКТЫ:
         - То, что не влияет на суть блюда (украшение, хлеб вприкуску), помечай: "Петрушка (для подачи)", "Хлеб (по желанию)".
      
      4. ПОКУПКИ:
         - Считаем, что холодильник пуст. В missing_ingredients пиши ВСЁ, что нужно купить.

      Верни JSON:
      {
        "title": "Название",
        "description": "Почему это вкусно...",
        "time": "Время (мин)",
        "calories": "Ккал",
        "ingredients": ["Краткий список"],
        "missing_ingredients": ["Всё необходимое"],
        "detailed_ingredients": [
           { "name": "Куриное филе", "amount": "150 г" },
           { "name": "Кинза (по желанию)", "amount": "5 г" }
        ],
        "steps": ["Шаг 1 с минутами...", "Шаг 2 с температурой..."]
      }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Придумай точный рецепт дня на ${dateStr}.` },
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