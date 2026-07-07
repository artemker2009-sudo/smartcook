import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Пометить репорт «просмотренным». Чтение/изменение error_reports разрешено
// только через этот админ-роут с service_role (RLS у таблицы включён и не
// имеет SELECT/UPDATE-политик для anon/authenticated).
export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = body?.id;

  if (typeof id !== "string" || !id.trim()) {
    return NextResponse.json({ error: "Не хватает ID репорта" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("error_reports").update({ status: "viewed" }).eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Не удалось обновить статус" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
