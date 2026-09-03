import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { readGuestRef, newGuestRef, setGuestCookie } from "@/lib/guestSession";
import { sendReportCard } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Жалоба на публикацию в ленте сообщества (App Store 1.2 — механизм для
// пользователей флагировать нежелательный контент; разработчик обязан
// реагировать в течение 24 часов).
//
// Модель:
//   * Жаловаться можно и без регистрации (личность — проверенный JWT либо
//     гостевая httpOnly-cookie, как у лайков). Одна жалоба на пост от одной
//     личности (unique в БД).
//   * Каждая новая жалоба уведомляет основателя в Telegram (ручная модерация в
//     админке — этого достаточно для 1.2).
//   * При достижении 3 жалоб пост автоматически скрывается (status='rejected' →
//     пропадает из публичного view community_posts_public).
//
// Устойчивость к отсутствию миграции: если таблицы community_post_reports ещё
// нет (SQL не прогнан), подсчёт/дедуп/авто-скрытие недоступны, но жалоба всё
// равно уходит в Telegram — модерация остаётся ручной и App Store-совместимой.
// Как только миграция прогнана, включается авто-скрытие без изменения кода.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_MAX = 300;
const HIDE_THRESHOLD = 3;
// Postgres «relation does not exist» — таблицы отчётов ещё нет (миграция не прогнана).
const UNDEFINED_TABLE = "42P01";
const UNIQUE_VIOLATION = "23505";

function cleanReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, REASON_MAX);
  return cleaned || null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const postId = typeof body?.postId === "string" ? body.postId.trim() : "";
  if (!body || !UUID_RE.test(postId)) {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const reason = cleanReason(body.reason);

  // Личность: проверенный JWT либо гостевая cookie (выдаём лениво в момент действия).
  const userId = await getVerifiedUserId(req);
  let guestRef = readGuestRef(req);
  let issueCookie = false;
  if (!userId && !guestRef) {
    guestRef = newGuestRef();
    issueCookie = true;
  }
  const reporterRef = userId ? `user:${userId}` : `guest:${guestRef}`;

  const admin = createServiceRoleClient();

  // Жаловаться можно только на существующий ОДОБРЕННЫЙ пост.
  const { data: post } = await admin
    .from("community_posts")
    .select("id,recipe_title,user_name,status")
    .eq("id", postId)
    .maybeSingle();
  if (!post || (post as { status?: string }).status !== "approved") {
    return NextResponse.json({ error: "Пост не найден" }, { status: 404 });
  }

  const respondOk = (payload: Record<string, unknown>) => {
    const res = NextResponse.json({ ok: true, ...payload });
    if (issueCookie && guestRef) setGuestCookie(res, guestRef);
    return res;
  };

  let reportsCount = 1;
  let hidden = false;
  let tableMissing = false;

  // Регистрируем жалобу (дедуп по unique(post_id, reporter_ref)).
  const { error: insErr } = await admin
    .from("community_post_reports")
    .insert({ post_id: postId, reporter_ref: reporterRef, reason });

  if (insErr) {
    if (insErr.code === UNIQUE_VIOLATION) {
      // Уже жаловался — не считаем повторно и не спамим Telegram.
      return respondOk({ already: true });
    }
    if (insErr.code === UNDEFINED_TABLE) {
      // Миграция не прогнана: подсчёт недоступен, но уведомим основателя.
      tableMissing = true;
    } else {
      console.error("[feed/report] insert failed", insErr.message);
      return NextResponse.json({ error: "Не удалось отправить жалобу" }, { status: 500 });
    }
  }

  if (!tableMissing) {
    const { count } = await admin
      .from("community_post_reports")
      .select("id", { count: "exact", head: true })
      .eq("post_id", postId);
    reportsCount = count ?? 1;

    if (reportsCount >= HIDE_THRESHOLD) {
      const { error: updErr } = await admin
        .from("community_posts")
        .update({ status: "rejected", moderated_at: new Date().toISOString() })
        .eq("id", postId)
        .eq("status", "approved");
      if (!updErr) hidden = true;
    }
  }

  // Уведомление основателю — best-effort, не влияет на ответ пользователю.
  await sendReportCard({
    postId,
    recipeTitle: (post as { recipe_title?: string | null }).recipe_title ?? null,
    userName: (post as { user_name?: string | null }).user_name ?? null,
    reason,
    reportsCount,
    hidden,
  });

  return respondOk({ hidden });
}
