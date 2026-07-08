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

  const [maintenanceResult, partiesResult, recentEventsResult, errorReportsResult] = await Promise.all([
    supabase.from("site_settings").select("is_maintenance").eq("id", 1).single(),
    supabase.from("parties").select("*"),
    supabase
      .from("analytics_events")
      .select("party_id, user_name, event_type, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("error_reports")
      .select("id, created_at, message, contact, url, display_mode, viewport, app_version, status")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (maintenanceResult.error || partiesResult.error || recentEventsResult.error || errorReportsResult.error) {
    return NextResponse.json({ error: "Не удалось загрузить данные админки" }, { status: 500 });
  }

  // Лента (feed_photos) — отдельно и мягко: если таблицы ещё нет (миграция не
  // прогнана), не роняем всю админку, просто отдаём пустой список.
  const feedResult = await supabase
    .from("feed_photos")
    .select("id, created_at, user_name, recipe_title, photo_url, is_public, is_hidden")
    .order("created_at", { ascending: false })
    .limit(200);

  // Новости (все, включая скрытые — админ видит) — мягко: если таблицы ещё нет.
  const newsResult = await supabase
    .from("news")
    .select("id, created_at, date, title, body, is_visible")
    .order("created_at", { ascending: false })
    .limit(200);

  // Заметки (все, включая черновики — админ видит) — мягко: если таблицы ещё нет.
  const articlesResult = await supabase
    .from("articles")
    .select("id, created_at, published_at, title, slug, excerpt, body, emoji_icon, is_published")
    .order("created_at", { ascending: false })
    .limit(200);

  return NextResponse.json({
    isMaintenance: Boolean(maintenanceResult.data?.is_maintenance),
    parties: partiesResult.data ?? [],
    recentEvents: recentEventsResult.data ?? [],
    errorReports: errorReportsResult.data ?? [],
    feedPhotos: feedResult.error ? [] : (feedResult.data ?? []),
    news: newsResult.error ? [] : (newsResult.data ?? []),
    articles: articlesResult.error ? [] : (articlesResult.data ?? []),
  });
}
