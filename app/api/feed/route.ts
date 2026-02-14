import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { sort, userId } = await req.json(); // sort = 'new' | 'top'

    let query = supabase
      .from('recipes')
      .select(`
        *,
        recipe_likes (
          user_id
        )
      `)
      .limit(50); // Грузим 50 штук, чтобы не грузить базу

    // Сортировка
    if (sort === 'top') {
      // Сначала самые залайканные
      query = query.order('likes_count', { ascending: false });
    } else {
      // Сначала новые
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;

    if (error) throw error;

    // Обрабатываем данные: проверяем, лайкнул ли этот юзер
    const feed = data.map((item: any) => ({
      ...item,
      // Если в массиве recipe_likes есть мой ID, значит я лайкнул
      is_liked: item.recipe_likes && item.recipe_likes.some((l: any) => l.user_id === userId),
      // Убираем лишний массив, чтобы не тащить мусор на фронт
      recipe_likes: undefined 
    }));

    return NextResponse.json({ feed });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}