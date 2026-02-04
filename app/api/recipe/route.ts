import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { dish, ingredients, sessionId } = await req.json();

    if (!dish || !ingredients) {
      return NextResponse.json({ error: "Нет данных" }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `
            Я хочу приготовить блюдо: "${dish}".
            У меня есть продукты: ${ingredients.join(", ")}.
            
            Напиши подробный рецепт.
            Верни ответ строго в формате JSON:
            {
              "title": "Название блюда",
              "time": "Время приготовления",
              "calories": "Калорийность на 1 порцию",
              "detailed_ingredients": [
                 {"name": "Продукт", "amount": "Количество"}
              ],
              "steps": ["шаг 1", "шаг 2"],
              "missing_ingredients": ["чего не хватает"]
            }
          `
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) return NextResponse.json({ error: "Пустой ответ" }, { status: 500 });

    const recipe = JSON.parse(content);

    // ВАЖНОЕ ИЗМЕНЕНИЕ: Добавили .select() в конце, чтобы получить ID
    const { data, error } = await supabase
      .from('recipes')
      .insert([
        { 
          title: recipe.title,
          time: recipe.time,
          calories: recipe.calories,
          ingredients: ingredients,
          detailed_ingredients: recipe.detailed_ingredients,
          steps: recipe.steps,
          session_id: sessionId 
        }
      ])
      .select(); // <--- ВОТ ЭТО ВОЗВРАЩАЕТ НАМ СОЗДАННУЮ ЗАПИСЬ

    if (error) {
      console.error("Ошибка БД:", error);
    }

    // Если запись создалась, добавляем ID к ответу для фронтенда
    if (data && data.length > 0) {
      recipe.id = data[0].id;
    }

    return NextResponse.json({ ok: true, recipe });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}