import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { query, sessionId } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "Введите название блюда" }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `
            Я хочу приготовить: "${query}".
            
            Напиши мне подробный рецепт.
            Верни ответ строго в формате JSON:
            {
              "title": "Полное название блюда",
              "time": "Время готовки",
              "calories": "Калорийность",
              "detailed_ingredients": [
                 {"name": "Продукт", "amount": "Количество"}
              ],
              "steps": ["шаг 1", "шаг 2", "шаг 3"],
              "ingredients": ["список продуктов просто строками"]
            }
          `
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) return NextResponse.json({ error: "Пустой ответ" }, { status: 500 });

    const recipe = JSON.parse(content);

    // ВАЖНОЕ ИЗМЕНЕНИЕ: Добавили .select()
    const { data, error } = await supabase
      .from('recipes')
      .insert([
        { 
          title: recipe.title,
          time: recipe.time,
          calories: recipe.calories,
          steps: recipe.steps,
          ingredients: recipe.ingredients, 
          detailed_ingredients: recipe.detailed_ingredients,
          session_id: sessionId 
        }
      ])
      .select(); 

    if (error) console.error("Ошибка БД:", error);

    // Добавляем ID к ответу
    if (data && data.length > 0) {
      recipe.id = data[0].id;
    }

    return NextResponse.json({ ok: true, recipe });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}