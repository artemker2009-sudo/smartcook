import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Модерация ленты сообщества, путь «а» (админка). Меняет тот же статус в БД, что
// и Telegram-путь. Статус community_posts может менять ТОЛЬКО service_role: у
// таблицы нет UPDATE-политики для anon/authenticated, поэтому клиент одобрить/
// отклонить пост не может.
export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const action = body?.action;

  if (!id) {
    return NextResponse.json({ error: "Не хватает ID поста" }, { status: 400 });
  }
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Некорректное действие" }, { status: 400 });
  }

  const status = action === "approve" ? "approved" : "rejected";
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("community_posts")
    .update({ status, moderated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("[admin/feed-moderate] update failed", error.message);
    return NextResponse.json({ error: "Не удалось обновить пост" }, { status: 500 });
  }

  return NextResponse.json({ success: true, status });
}
