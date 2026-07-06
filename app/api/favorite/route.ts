import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { getVerifiedUserId } from "@/lib/auth";

const supabaseAdmin = createServiceRoleClient();

export async function POST(req: Request) {
  try {
    const { id, isFavorite, sessionId } = await req.json();

    if (!id || typeof isFavorite !== "boolean" || !sessionId) {
      return NextResponse.json({ error: "No data" }, { status: 400 });
    }

    // Если пришёл настоящий Supabase-токен — доверяем только ему, а не
    // sessionId из тела (его легко подделать). Для гостей (без токена)
    // sessionId — единственный доступный идентификатор владельца.
    const verifiedUserId = await getVerifiedUserId(req);
    const ownerSessionId = verifiedUserId ?? sessionId;

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('recipes')
      .select('session_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    if (existing.session_id !== ownerSessionId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from('recipes')
      .update({ is_favorite: isFavorite })
      .eq('id', id)
      .eq('session_id', ownerSessionId);

    if (error) {
      console.error("Ошибка при обновлении избранного:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Favorite route error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
