import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Модерация ленты: скрыть фото (is_hidden=true) — оно пропадает из витрины.
// Менять is_hidden может ТОЛЬКО этот админ-роут на service_role: у таблицы
// feed_photos нет UPDATE-политики для anon/authenticated, поэтому клиент скрыть
// фото не может. Можно и вернуть в ленту (hidden=false) — параметр hidden.
export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = body?.id;
  const hidden = body?.hidden === false ? false : true; // по умолчанию скрыть

  if (typeof id !== "string" || !id.trim()) {
    return NextResponse.json({ error: "Не хватает ID фото" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("feed_photos").update({ is_hidden: hidden }).eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Не удалось обновить фото" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
