import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Инициализация (используем сервисный ключ, чтобы писать в базу)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // ВАЖНО: Нужен Service Role Key (не Anon)
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. Проверяем, есть ли рецепт на сегодня
    const { data: existingRecipe } = await supabase
      .from('daily_recipes')
      .select('*')
      .eq('date', today)
      .single();

    if (existingRecipe) {
      return NextResponse.json(existingRecipe);
    }

    // 2. Если нет — Генерируем новый
    // Определяем день недели для контекста
    const dayOfWeek = new Date().toLocaleDateString('ru-RU', { weekday: 'long' });
    
    const prompt = `Ты шеф-повар. Придумай "Рецепт дня" на сегодня (${dayOfWeek}).
    - Если понедельник: что-то быстрое и легкое.
    - Если пятница/суббота: что-то праздничное или стрит-фуд.
    - В остальные дни: сезонное блюдо.
    Верни ТОЛЬКО JSON:
    {
      "title": "Название блюда",
      "description": "Краткое вкусное описание (1 предложение)",
      "time": "Время (напр. 20 мин)",
      "calories": "Калории (напр. 450 ккал)",
      "ingredients": ["ингредиент 1", "ингредиент 2"],
      "steps": ["шаг 1", "шаг 2"]
    }`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Дешевая и быстрая модель
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const aiContent = JSON.parse(completion.choices[0].message.content || "{}");

    // 3. Сохраняем в базу (чтобы следующий юзер не генерировал заново)
    const { data: newRecipe, error } = await supabase
      .from('daily_recipes')
      .insert([{
        date: today,
        ...aiContent
      }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(newRecipe);

  } catch (error: any) {
    console.error('Daily Recipe Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}