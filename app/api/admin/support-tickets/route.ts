import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = body?.id;

  if (typeof id !== "string" || !id.trim()) {
    return NextResponse.json({ error: "Не хватает ID обращения" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("support_tickets").update({ status: "closed" }).eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Не удалось закрыть обращение" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
