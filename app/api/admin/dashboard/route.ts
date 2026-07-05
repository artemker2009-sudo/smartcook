import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const [maintenanceResult, partiesResult, recentEventsResult, supportTicketsResult] = await Promise.all([
    supabase.from("site_settings").select("is_maintenance").eq("id", 1).single(),
    supabase.from("parties").select("*"),
    supabase
      .from("analytics_events")
      .select("party_id, user_name, event_type, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("support_tickets").select("*").order("created_at", { ascending: false }),
  ]);

  if (maintenanceResult.error || partiesResult.error || recentEventsResult.error || supportTicketsResult.error) {
    return NextResponse.json({ error: "Не удалось загрузить данные админки" }, { status: 500 });
  }

  return NextResponse.json({
    isMaintenance: Boolean(maintenanceResult.data?.is_maintenance),
    parties: partiesResult.data ?? [],
    recentEvents: recentEventsResult.data ?? [],
    supportTickets: supportTicketsResult.data ?? [],
  });
}
