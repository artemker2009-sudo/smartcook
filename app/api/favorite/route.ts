import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { id, isFavorite } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "No ID provided" }, { status: 400 });
    }

    // Обновляем статус в базе данных
    const { error } = await supabase
      .from('recipes')
      .update({ is_favorite: isFavorite })
      .eq('id', id);

    if (error) {
      console.error("Favorite update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}