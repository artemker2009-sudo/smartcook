import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Используем ключ Администратора (SERVICE_ROLE_KEY), чтобы обходить блокировки базы данных и менять счетчик лайков
const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim()
);

export async function POST(req: Request) {
  try {
    const { postId, sessionId, action } = await req.json();

    if (action === 'like') {
      // 1. Добавляем запись, что человек лайкнул
      const { error } = await supabase.from('photo_likes').insert({ post_id: postId, session_id: sessionId });
      if (!error) {
        // 2. Увеличиваем счетчик у самого поста (теперь база это разрешит!)
        const { data } = await supabase.from('feed_posts').select('likes_count').eq('id', postId).single();
        await supabase.from('feed_posts').update({ likes_count: (data?.likes_count || 0) + 1 }).eq('id', postId);
      }
    } else {
      // Убираем лайк
      const { error } = await supabase.from('photo_likes').delete().match({ post_id: postId, session_id: sessionId });
      if (!error) {
        const { data } = await supabase.from('feed_posts').select('likes_count').eq('id', postId).single();
        await supabase.from('feed_posts').update({ likes_count: Math.max(0, (data?.likes_count || 0) - 1) }).eq('id', postId);
      }
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}