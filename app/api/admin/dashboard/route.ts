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
    // select("*"), а не поимённо: строка одна и крошечная, зато админка не
    // падает, если миграция supabase_site_settings_cache_switches.sql ещё не
    // прогнана — новые поля просто приедут пустыми.
    supabase.from("site_settings").select("*").eq("id", 1).single(),
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

  // Лента сообщества — очередь на модерацию (status='pending'). Явные колонки,
  // БЕЗ user_ref в пейлоаде. Мягко: если таблицы ещё нет (миграция не прогнана),
  // не роняем админку.
  const communityQueueResult = await supabase
    .from("community_posts")
    .select("id, created_at, user_name, recipe_title, recipe_id, photo_url, caption, status")
    .eq("status", "pending")
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

  // Заявки на восстановление доступа — мягко: если таблица ещё не создана
  // (supabase_password_reset_requests.sql не прогнан), админка не падает.
  const resetRequestsResult = await supabase
    .from("password_reset_requests")
    .select("id, created_at, username, telegram, status")
    .order("created_at", { ascending: false })
    .limit(200);

  // Советы (все, включая черновики — админ видит) — мягко: если таблицы ещё нет.
  const tipsResult = await supabase
    .from("tips")
    .select("id, created_at, published_at, body, emoji_icon, is_published")
    .order("created_at", { ascending: false })
    .limit(500);

  // Платформы: сколько заходов с сайта, из приложения App Store и из RuStore.
  //
  // Считаем СЧЁТЧИКАМИ (head: true, count: exact), а не выгрузкой строк:
  // двенадцать запросов уходят одной пачкой, каждый ложится на частичный
  // индекс по event_type='visit', и ответ не растёт вместе с числом заходов.
  // Выгрузка «последних N тысяч строк» дала бы тот же ответ ровно до того дня,
  // когда заходов станет больше N.
  //
  // Мягко: пока миграция supabase_analytics_platform.sql не прогнана, колонок
  // нет и запрос падает — тогда отдаём null, и админка честно скажет об этом,
  // а не сломается целиком.
  const platforms = await readPlatformStats(supabase);

  return NextResponse.json({
    platforms,
    isMaintenance: Boolean(maintenanceResult.data?.is_maintenance),
    // Аварийные рубильники кэша. До миграции оба приедут пустыми — админка
    // покажет их выключенными, а не сломается.
    cacheEpoch: (maintenanceResult.data?.cache_epoch as string | null) ?? null,
    purgeClientCache: Boolean(maintenanceResult.data?.purge_client_cache),
    parties: partiesResult.data ?? [],
    recentEvents: recentEventsResult.data ?? [],
    errorReports: errorReportsResult.data ?? [],
    resetRequests: resetRequestsResult.error ? [] : (resetRequestsResult.data ?? []),
    feedPhotos: feedResult.error ? [] : (feedResult.data ?? []),
    communityQueue: communityQueueResult.error ? [] : (communityQueueResult.data ?? []),
    news: newsResult.error ? [] : (newsResult.data ?? []),
    articles: articlesResult.error ? [] : (articlesResult.data ?? []),
    tips: tipsResult.error ? [] : (tipsResult.data ?? []),
  });
}

// --- Платформы --------------------------------------------------------------

const PLATFORM_KEYS = ["web", "ios_app", "android_twa"] as const;
const VISITOR_KEYS = ["new", "returning"] as const;

type PlatformRow = {
  platform: (typeof PLATFORM_KEYS)[number];
  visits: number;
  newVisitors: number;
  returning: number;
};

export type PlatformStats = {
  days7: PlatformRow[];
  days30: PlatformRow[];
};

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Заходы по платформам за 7 и 30 дней, отдельно новые и вернувшиеся.
 *
 * null означает «посчитать не удалось» — почти всегда это непрогнанная
 * миграция. Отличать этот случай от «нуля заходов» обязательно: пустой раздел
 * с нулями выглядит как «приложениями никто не пользуется», а это совсем
 * другой вывод, чем «данные ещё не собираются».
 */
async function readPlatformStats(
  supabase: ReturnType<typeof createServiceRoleClient>,
): Promise<PlatformStats | null> {
  const windows = [7, 30] as const;
  const queries = windows.flatMap((days) =>
    PLATFORM_KEYS.flatMap((platform) =>
      VISITOR_KEYS.map(async (visitor) => {
        const { count, error } = await supabase
          .from("analytics_events")
          .select("id", { count: "exact", head: true })
          .eq("event_type", "visit")
          .eq("platform", platform)
          .eq("visitor", visitor)
          .gte("created_at", daysAgo(days));
        return { days, platform, visitor, count: count ?? 0, error };
      }),
    ),
  );

  const results = await Promise.all(queries);
  if (results.some((r) => r.error)) return null;

  const build = (days: number): PlatformRow[] =>
    PLATFORM_KEYS.map((platform) => {
      const pick = (visitor: (typeof VISITOR_KEYS)[number]) =>
        results.find((r) => r.days === days && r.platform === platform && r.visitor === visitor)?.count ?? 0;
      const newVisitors = pick("new");
      const returning = pick("returning");
      return { platform, visits: newVisitors + returning, newVisitors, returning };
    });

  return { days7: build(7), days30: build(30) };
}
