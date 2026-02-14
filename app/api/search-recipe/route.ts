import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { query, sessionId } = await req.json();

    const systemPrompt = `
      Ты — шеф-повар. Придумай рецепт по запросу: "${query}".
      Правила: строгие граммовки, тайминги, 1 персона.
      Верни JSON: { "title": "...", "time": "...", "calories": "...", "detailed_ingredients": [{"name":"", "amount":""}], "missing_ingredients": [], "steps": [] }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: systemPrompt }],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("Empty");
    const recipe = JSON.parse(content);

    // СОХРАНЯЕМ
    if (sessionId) {
      await supabase.from('recipes').insert({
        session_id: sessionId,
        title: recipe.title,
        description: recipe.description,
        time: recipe.time,
        calories: recipe.calories,
        ingredients: recipe.detailed_ingredients?.map((i: any) => `${i.name} ${i.amount}`) || [],
        detailed_ingredients: recipe.detailed_ingredients,
        steps: recipe.steps,
        is_favorite: false
      });
    }

    return NextResponse.json({ recipe });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}