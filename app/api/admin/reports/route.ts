import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Жалобы на посты ленты сообщества — вкладка «Жалобы» в админке.
//
// Читать community_post_reports можно ТОЛЬКО отсюда: у таблицы RLS с нулём
// политик, доступ есть лишь у service_role, а роут закрыт админ-сессией.
//
// Личность жалобщика наружу НЕ отдаём. В БД лежит reporter_ref вида
// "user:<uuid>" / "guest:<uuid>"; в ответе — только тип (аккаунт/гость) и
// последние 4 символа идентификатора, чтобы модератор мог различить «трое
// разных людей» и «один и тот же трижды», но не опознать человека.
//
// FK между reports и posts намеренно нет (у ленты свой жизненный цикл), поэтому
// PostgREST-эмбеддинг недоступен — тянем посты вторым запросом по списку id.
// Везде явные колонки, select=* не используем.

const REPORTS_LIMIT = 300;
// Postgres «column does not exist» — миграция supabase_community_post_reports_status.sql
// ещё не прогнана. Тогда работаем без dismissed_at (без статуса «отклонена»).
const UNDEFINED_COLUMN = "42703";

type ReportRow = {
  id: string;
  created_at: string;
  post_id: string;
  reporter_ref: string;
  reason: string | null;
  dismissed_at?: string | null;
};

type PostRow = {
  id: string;
  created_at: string;
  recipe_title: string | null;
  recipe_id: number | null;
  user_name: string | null;
  photo_url: string;
  status: string;
};

// "user:9f2c…a1b2" → { kind: "user", short: "a1b2" }. Полный идентификатор не
// покидает сервер.
function safeReporter(ref: string): { kind: "user" | "guest"; short: string } {
  const isUser = ref.startsWith("user:");
  const value = ref.slice(ref.indexOf(":") + 1);
  return { kind: isUser ? "user" : "guest", short: value.slice(-4) || "????" };
}

export async function GET(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  // 1) Жалобы. Сначала пробуем с dismissed_at; если колонки ещё нет — повторяем
  //    запрос без неё, чтобы вкладка работала до прогона миграции.
  let statusColumnReady = true;
  let reports: ReportRow[] = [];

  const withDismissed = await supabase
    .from("community_post_reports")
    .select("id,created_at,post_id,reporter_ref,reason,dismissed_at")
    .order("created_at", { ascending: false })
    .limit(REPORTS_LIMIT);

  if (withDismissed.error) {
    if (withDismissed.error.code === UNDEFINED_COLUMN) {
      statusColumnReady = false;
      const fallback = await supabase
        .from("community_post_reports")
        .select("id,created_at,post_id,reporter_ref,reason")
        .order("created_at", { ascending: false })
        .limit(REPORTS_LIMIT);
      if (fallback.error) {
        console.error("[admin/reports] select failed", fallback.error.message);
        return NextResponse.json({ error: "Не удалось загрузить жалобы" }, { status: 500 });
      }
      reports = (fallback.data ?? []) as ReportRow[];
    } else {
      console.error("[admin/reports] select failed", withDismissed.error.message);
      return NextResponse.json({ error: "Не удалось загрузить жалобы" }, { status: 500 });
    }
  } else {
    reports = (withDismissed.data ?? []) as ReportRow[];
  }

  // 2) Посты, на которые жалуются (одним запросом по уникальным id).
  const postIds = Array.from(new Set(reports.map((r) => r.post_id)));
  const postsById = new Map<string, PostRow>();
  if (postIds.length > 0) {
    const { data: posts, error: postsError } = await supabase
      .from("community_posts")
      .select("id,created_at,recipe_title,recipe_id,user_name,photo_url,status")
      .in("id", postIds);
    if (postsError) {
      console.error("[admin/reports] posts select failed", postsError.message);
      return NextResponse.json({ error: "Не удалось загрузить посты" }, { status: 500 });
    }
    for (const p of (posts ?? []) as PostRow[]) postsById.set(p.id, p);
  }

  // 3) Сколько всего жалоб на каждый пост (в пределах выборки).
  const countByPost = new Map<string, number>();
  for (const r of reports) {
    countByPost.set(r.post_id, (countByPost.get(r.post_id) ?? 0) + 1);
  }

  const items = reports.map((r) => {
    const post = postsById.get(r.post_id);
    // «отклонена» → решение модератора; «пост скрыт» → пост уже не в ленте;
    // «пост удалён» → автор удалил его сам; иначе жалоба открыта.
    const state: "dismissed" | "hidden" | "post_deleted" | "open" = r.dismissed_at
      ? "dismissed"
      : !post
        ? "post_deleted"
        : post.status !== "approved"
          ? "hidden"
          : "open";

    return {
      id: r.id,
      createdAt: r.created_at,
      reason: r.reason,
      reporter: safeReporter(r.reporter_ref),
      state,
      reportsOnPost: countByPost.get(r.post_id) ?? 1,
      post: post
        ? {
            id: post.id,
            title: post.recipe_title,
            author: post.user_name,
            photoUrl: post.photo_url,
            recipeId: post.recipe_id,
            status: post.status,
          }
        : null,
    };
  });

  // Открытые выше закрытых, внутри группы — новые сверху.
  items.sort((a, b) => {
    const aOpen = a.state === "open" ? 0 : 1;
    const bOpen = b.state === "open" ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return NextResponse.json({
    items,
    openCount: items.filter((i) => i.state === "open").length,
    statusColumnReady,
  });
}

// Отклонить жалобу (оставить пост) или вернуть её в открытые.
export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "Не хватает ID жалобы" }, { status: 400 });
  }
  const dismissed = body?.dismissed !== false;

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("community_post_reports")
    .update({ dismissed_at: dismissed ? new Date().toISOString() : null })
    .eq("id", id);

  if (error) {
    if (error.code === UNDEFINED_COLUMN) {
      return NextResponse.json(
        { error: "Нужна миграция supabase_community_post_reports_status.sql" },
        { status: 409 },
      );
    }
    console.error("[admin/reports] update failed", error.message);
    return NextResponse.json({ error: "Не удалось обновить жалобу" }, { status: 500 });
  }

  return NextResponse.json({ success: true, dismissed });
}
