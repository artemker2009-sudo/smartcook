import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Предложения пользователей — вкладка «Предложения» в админке.
//
// Читать и менять suggestions можно ТОЛЬКО отсюда: у таблицы нет ни одной
// UPDATE/DELETE-политики, а SELECT отдаёт человеку лишь его собственные записи.
// Доступ к чужим — исключительно service_role из этого роута, закрытого
// админ-сессией.
//
// Личность автора наружу НЕ отдаём: в БД лежит user_id/session_id, в ответе —
// только тип («аккаунт»/«гость») и последние 4 символа, чтобы отличить
// «трое разных людей» от «один и тот же трижды», но не опознать человека.
// Везде явные колонки, select=* не используется.

const LIMIT = 300;
const NOTE_MAX = 2000;
// PostgREST на отсутствующей таблице отдаёт PGRST205 (не 42P01) — по нему и
// отличаем «миграция не прогнана» от настоящей поломки.
const MISSING_TABLE = "PGRST205";

const STATUSES = ["new", "in_progress", "done", "rejected"] as const;
type Status = (typeof STATUSES)[number];

type SuggestionRow = {
  id: string;
  created_at: string;
  session_id: string | null;
  user_id: string | null;
  kind: string;
  text: string;
  status: string;
  admin_note: string | null;
};

function safeAuthor(row: SuggestionRow): { kind: "user" | "guest"; short: string } {
  const value = row.user_id ?? row.session_id ?? "";
  return { kind: row.user_id ? "user" : "guest", short: value.slice(-4) || "????" };
}

export async function GET(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Фильтр по статусу приходит в query. Значение сверяем со списком — в
  // запрос к БД произвольная строка из URL не попадает.
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const status = STATUSES.includes(statusParam as Status) ? (statusParam as Status) : null;

  const supabase = createServiceRoleClient();
  let query = supabase
    .from("suggestions")
    .select("id,created_at,session_id,user_id,kind,text,status,admin_note")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    // Мягкая деградация: без прогнанной миграции вкладка открывается и честно
    // говорит, чего не хватает, вместо 500 на весь экран админки.
    if (error.code === MISSING_TABLE) {
      return NextResponse.json({ items: [], newCount: 0, tableReady: false });
    }
    console.error("[admin/suggestions] select failed", error.message);
    return NextResponse.json({ error: "Не удалось загрузить предложения" }, { status: 500 });
  }

  const rows = (data ?? []) as SuggestionRow[];
  const items = rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    kind: r.kind,
    text: r.text,
    status: r.status,
    adminNote: r.admin_note,
    author: safeAuthor(r),
  }));

  // Счётчик новых — для бейджа на вкладке. Считаем отдельным запросом, чтобы
  // цифра не зависела от текущего фильтра и от лимита выборки.
  const { count } = await supabase
    .from("suggestions")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");

  return NextResponse.json({ items, newCount: count ?? 0, tableReady: true });
}

// Смена статуса и заметка разбора. Оба поля необязательны по отдельности:
// можно поменять только статус, только заметку или оба сразу.
export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "Не хватает ID предложения" }, { status: 400 });

  const patch: { status?: Status; admin_note?: string | null } = {};

  if (body?.status !== undefined) {
    if (!STATUSES.includes(body.status as Status)) {
      return NextResponse.json({ error: "Неизвестный статус" }, { status: 400 });
    }
    patch.status = body.status as Status;
  }

  if (body?.adminNote !== undefined) {
    const note =
      typeof body.adminNote === "string"
        ? body.adminNote.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim().slice(0, NOTE_MAX)
        : "";
    patch.admin_note = note || null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Нечего менять" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("suggestions").update(patch).eq("id", id);
  if (error) {
    if (error.code === MISSING_TABLE) {
      return NextResponse.json(
        { error: "Нужна миграция supabase_suggestions.sql" },
        { status: 409 },
      );
    }
    console.error("[admin/suggestions] update failed", error.message);
    return NextResponse.json({ error: "Не удалось обновить предложение" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
