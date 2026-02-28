import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { sort, userId } = await req.json();

    let query = supabase.from('recipes').select(`*, recipe_likes(user_id)`).limit(50);

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