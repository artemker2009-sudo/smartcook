import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { recipeId, userId, action } = await req.json(); // action = 'like' | 'unlike'

    if (!recipeId || !userId) {
      return NextResponse.json({ error: "No data" }, { status: 400 });
    }

    if (action === 'like') {
      // 1. Добавляем запись в таблицу лайков
      const { error: likeError } = await supabase
        .from('recipe_likes')
        .insert({ user_id: userId, recipe_id: recipeId });
      
      if (likeError) throw likeError;

      // 2. Увеличиваем счетчик в рецепте (атомарно нельзя через JS, делаем RPC или просто update)
      // Для простоты делаем update через increment (эмуляция)
      // Сначала получаем текущий
      const { data: current } = await supabase.from('recipes').select('likes_count').eq('id', recipeId).single();
      const newCount = (current?.likes_count || 0) + 1;

      await supabase.from('recipes').update({ likes_count: newCount }).eq('id', recipeId);
      
      return NextResponse.json({ success: true, newCount });

    } else {
      // 1. Удаляем лайк
      const { error: unlikeError } = await supabase
        .from('recipe_likes')
        .delete()
        .eq('user_id', userId)
        .eq('recipe_id', recipeId);

      if (unlikeError) throw unlikeError;

      // 2. Уменьшаем счетчик
      const { data: current } = await supabase.from('recipes').select('likes_count').eq('id', recipeId).single();
      const newCount = Math.max(0, (current?.likes_count || 0) - 1);

      await supabase.from('recipes').update({ likes_count: newCount }).eq('id', recipeId);

      return NextResponse.json({ success: true, newCount });
    }

  } catch (error: any) {
    // Ошибка 23505 = уникальность (значит уже лайкнул), игнорируем
    if (error.code === '23505') return NextResponse.json({ success: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}