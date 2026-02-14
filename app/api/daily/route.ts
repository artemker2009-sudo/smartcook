import { NextResponse } from "next/server";
import OpenAI from "openai";

// Инициализация OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const revalidate = 0; // Отключаем кэширование, чтобы рецепт обновлялся

export async function GET() {
  try {
    // Получаем текущую дату, чтобы рецепт менялся раз в день
    const date = new Date().toLocaleDateString("ru-RU");

    const systemPrompt = `
      Ты — ведущий шеф-повар и технолог ресторана.
      Твоя задача — предложить "Блюдо дня" на сегодня (${date}).
      
      Критерии выбора:
      - Блюдо должно быть интересным, но доступным для приготовления дома.
      - Желательно учитывать сезонность.
      
      ЖЕЛЕЗНЫЕ ПРАВИЛА СОСТАВЛЕНИЯ (как для техкарты):
      1. ПОРЦИИ: Расчет СТРОГО на 1 персону.
      2. ГРАММОВКИ: 
         - Никаких "по вкусу" (кроме соли/перца). 
         - ТОЛЬКО точные граммы (г) или миллилитры (мл).
         - Пример: "Куриное филе (150 г)", "Сливки 20% (100 мл)".
      3. ШАГИ: 
         - Максимально подробно.
         - ОБЯЗАТЕЛЬНО указывай время для жарки/варки/запекания.
         - Пример: "Обжаривайте 5 минут до золотистой корочки".
      4. ПОКУПКИ:
         - Считаем, что у пользователя пустой холодильник (кроме соли, масла, воды).
         - ВСЕ ингредиенты добавь в список missing_ingredients.

      Верни ответ ТОЛЬКО валидный JSON:
      {
        "title": "Красивое название блюда",
        "description": "Аппетитное описание из 2 предложений, почему это стоит приготовить сегодня.",
        "time": "Время (мин)",
        "calories": "Ккал",
        "ingredients": ["Список для отображения (краткий)"],
        "missing_ingredients": ["Продукт 1", "Продукт 2"],
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
        { role: "user", content: `Придумай рецепт дня на ${date}.` },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("Empty response");

    const recipeData = JSON.parse(content);

    return NextResponse.json({ ...recipeData, date });

  } catch (error: any) {
    console.error("Daily recipe error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}