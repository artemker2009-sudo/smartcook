import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const isMaintenance = body?.isMaintenance;

  if (typeof isMaintenance !== "boolean") {
    return NextResponse.json({ error: "Некорректное значение" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("site_settings").update({ is_maintenance: isMaintenance }).eq("id", 1);

  if (error) {
    return NextResponse.json({ error: "Не удалось обновить режим обслуживания" }, { status: 500 });
  }

  return NextResponse.json({ success: true, isMaintenance });
}
