import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { deletePartyWithChildren } from "@/lib/partyDelete";

export const runtime = "nodejs";

// Удаление банкета из админки. Право — сессия админки (пароль → подписанная
// cookie), запись — service_role прямо здесь. Публичного server action для
// удаления больше нет: раньше этот роут звал deletePartyAction, который был
// открыт любому вызывающему.
export async function DELETE(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id.trim() : "";

  if (!id) {
    return NextResponse.json({ error: "Не хватает ID банкета" }, { status: 400 });
  }

  const result = await deletePartyWithChildren(createServiceRoleClient(), id);

  if (!result.ok) {
    console.error("[admin/parties] delete failed", result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
