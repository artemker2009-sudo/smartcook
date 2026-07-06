import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkAndConsumeReadRateLimit, readRateLimitResponse } from "@/lib/rateLimit";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// session_id в recipes — это фактически "гостевой токен" (см. lib/auth.ts,
// RLS-политики), поэтому в публичной ленте его отдавать нельзя: кто угодно
// смог бы забрать чужой session_id и дальше действовать от его имени в
// /api/favorite. Явно перечисляем только то, что реально нужно ленте.
const FEED_COLUMNS =
  "id, title, description, time, calories, ingredients, detailed_ingredients, missing_ingredients, steps, likes_count, created_at, recipe_likes(user_id)";

export async function POST(req: Request) {
  try {
    const rateLimit = await checkAndConsumeReadRateLimit(req, "feed");
    if (!rateLimit.ok) return readRateLimitResponse(rateLimit);

    const { sort, userId } = await req.json();

    let query = supabase.from('recipes').select(FEED_COLUMNS).limit(50);

    if (sort === 'top') {
      query = query.order('likes_count', { ascending: false }).order('created_at', { ascending: false });
    } else if (sort === 'old') {
      query = query.order('created_at', { ascending: true });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;

    const feed = data.map((item: any) => ({
      ...item,
      is_liked: item.recipe_likes && item.recipe_likes.some((l: any) => l.user_id === userId),
      recipe_likes: undefined
    }));

    return NextResponse.json({ feed });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
