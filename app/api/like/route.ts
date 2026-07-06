import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { getVerifiedUserId } from "@/lib/auth";

const supabaseAdmin = createServiceRoleClient();

export async function POST(req: Request) {
  try {
    const { recipeId, userId, action } = await req.json(); // action = 'like' | 'unlike'

    if (!recipeId || !userId) {
      return NextResponse.json({ error: "No data" }, { status: 400 });
    }

    // recipe_likes.user_id всегда должен быть реальным аккаунтом — сверяем
    // с проверенным на сервере токеном, а не доверяем userId из тела запроса.
    const verifiedUserId = await getVerifiedUserId(req);
    if (!verifiedUserId || verifiedUserId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (action === 'like') {
      const { error: likeError } = await supabaseAdmin
        .from('recipe_likes')
        .insert({ user_id: userId, recipe_id: recipeId });

      if (likeError) throw likeError;

      const { data: current } = await supabaseAdmin.from('recipes').select('likes_count').eq('id', recipeId).single();
      const newCount = (current?.likes_count || 0) + 1;

      await supabaseAdmin.from('recipes').update({ likes_count: newCount }).eq('id', recipeId);

      return NextResponse.json({ success: true, newCount });

    } else {
      const { error: unlikeError } = await supabaseAdmin
        .from('recipe_likes')
        .delete()
        .eq('user_id', userId)
        .eq('recipe_id', recipeId);

      if (unlikeError) throw unlikeError;

      const { data: current } = await supabaseAdmin.from('recipes').select('likes_count').eq('id', recipeId).single();
      const newCount = Math.max(0, (current?.likes_count || 0) - 1);

      await supabaseAdmin.from('recipes').update({ likes_count: newCount }).eq('id', recipeId);

      return NextResponse.json({ success: true, newCount });
    }

  } catch (error: any) {
    // Ошибка 23505 = уникальность (значит уже лайкнул), игнорируем
    if (error.code === '23505') return NextResponse.json({ success: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
