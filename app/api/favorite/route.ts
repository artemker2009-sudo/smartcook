import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { id, isFavorite } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Нет ID рецепта" }, { status: 400 });
    }

    // Обновляем статус в базе
    const { error } = await supabase
      .from('recipes')
      .update({ is_favorite: isFavorite })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ ok: true });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}