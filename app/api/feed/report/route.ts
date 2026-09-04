import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { readGuestRef, newGuestRef, setGuestCookie } from "@/lib/guestSession";
import { sendReportCard } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Жалоба на пользовательский контент (App Store 1.2 — механизм для
// пользователей флагировать нежелательный контент; разработчик обязан
// реагировать в течение 24 часов).
//
// Роут обслуживает ДВА раздела с UGC, потому что модель жалобы у них одна и та
// же и расходиться ей незачем:
//   * { postId }  — пост ленты сообщества (community_posts). Скрытие =
//                   status 'rejected' → пост уходит из community_posts_public.
//   * { photoId } — фото витрины «Приготовили сегодня» на Главной
//                   (feed_photos). Скрытие = is_hidden = true → строка уходит
//                   из feed_photos_public.
// Ровно одно из двух полей обязано быть в теле запроса.
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
// Устойчивость к отсутствию миграции: если таблицы жалоб ещё нет (SQL не
// прогнан — community_post_reports для ленты, feed_photo_reports для витрины),
// подсчёт/дедуп/авто-скрытие недоступны, но жалоба всё равно уходит в Telegram
// — модерация остаётся ручной и App Store-совместимой. Как только миграция
// прогнана, включается авто-скрытие без изменения кода.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_MAX = 300;
const HIDE_THRESHOLD = 3;
// Таблицы отчётов ещё нет (миграция не прогнана). Кодов ДВА, и это проверено
// руками: сырой Postgres отдаёт «relation does not exist» = 42P01, но supabase-js
// ходит через PostgREST, а тот до самой БД не доходит — не находит таблицу в
// своём schema cache и отвечает PGRST205. Пока здесь стоял только 42P01,
// заявленная ниже мягкая деградация не работала вовсе: отсутствие миграции
// давало пользователю 500 «Не удалось отправить жалобу».
const UNDEFINED_TABLE_CODES = new Set(["42P01", "PGRST205"]);
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
  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const postId = typeof raw?.postId === "string" ? raw.postId.trim() : "";
  const photoId = typeof raw?.photoId === "string" ? raw.photoId.trim() : "";

  // Ровно одна цель. Оба поля сразу — это уже не «жалоба», а попытка что-то
  // нащупать: отказываем, не угадывая.
  const isPhoto = !!photoId && !postId;
  const targetId = isPhoto ? photoId : postId;
  if (!raw || !!photoId === !!postId || !UUID_RE.test(targetId)) {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const reason = cleanReason(raw.reason);

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

  // Всё, чем ветки отличаются: таблицы, имя колонки-ссылки и признак «скрыто».
  // Дальше код общий — это и есть смысл одного роута на два раздела.
  const target = isPhoto
    ? {
        contentTable: "feed_photos",
        // Явные колонки (не select=*): в feed_photos лежит user_ref, а он
        // наружу не выходит даже в логи.
        contentColumns: "id,recipe_title,user_name,is_public,is_hidden",
        reportsTable: "feed_photo_reports",
        refColumn: "photo_id",
      }
    : {
        contentTable: "community_posts",
        contentColumns: "id,recipe_title,user_name,status",
        reportsTable: "community_post_reports",
        refColumn: "post_id",
      };

  // Жаловаться можно только на существующий и ВИДИМЫЙ сейчас контент.
  const { data: content } = await admin
    .from(target.contentTable)
    .select(target.contentColumns)
    .eq("id", targetId)
    .maybeSingle();
  const row = content as
    | {
        recipe_title?: string | null;
        user_name?: string | null;
        status?: string;
        is_public?: boolean;
        is_hidden?: boolean;
      }
    | null;
  // «Видимый» = ровно то, что отдаёт публичный источник раздела:
  // feed_photos_public (is_public && !is_hidden) либо community_posts_public (approved).
  const visible = isPhoto
    ? row?.is_public === true && row?.is_hidden === false
    : row?.status === "approved";
  if (!row || !visible) {
    return NextResponse.json({ error: isPhoto ? "Фото не найдено" : "Пост не найден" }, { status: 404 });
  }

  const respondOk = (payload: Record<string, unknown>) => {
    const res = NextResponse.json({ ok: true, ...payload });
    if (issueCookie && guestRef) setGuestCookie(res, guestRef);
    return res;
  };

  let reportsCount = 1;
  let hidden = false;
  let tableMissing = false;

  // Регистрируем жалобу (дедуп по unique(<ref>, reporter_ref)).
  const { error: insErr } = await admin
    .from(target.reportsTable)
    .insert({ [target.refColumn]: targetId, reporter_ref: reporterRef, reason });

  if (insErr) {
    if (insErr.code === UNIQUE_VIOLATION) {
      // Уже жаловался — не считаем повторно и не спамим Telegram.
      return respondOk({ already: true });
    }
    if (UNDEFINED_TABLE_CODES.has(insErr.code)) {
      // Миграция не прогнана: подсчёт недоступен, но уведомим основателя.
      tableMissing = true;
    } else {
      console.error("[feed/report] insert failed", insErr.message);
      return NextResponse.json({ error: "Не удалось отправить жалобу" }, { status: 500 });
    }
  }

  if (!tableMissing) {
    const { count } = await admin
      .from(target.reportsTable)
      .select("id", { count: "exact", head: true })
      .eq(target.refColumn, targetId);
    reportsCount = count ?? 1;

    if (reportsCount >= HIDE_THRESHOLD) {
      // Скрываем ТОЛЬКО ещё видимую строку (eq по текущему состоянию), чтобы
      // повторная жалоба не переписывала уже принятое решение модератора.
      const { error: updErr } = isPhoto
        ? await admin
            .from("feed_photos")
            .update({ is_hidden: true })
            .eq("id", targetId)
            .eq("is_hidden", false)
        : await admin
            .from("community_posts")
            .update({ status: "rejected", moderated_at: new Date().toISOString() })
            .eq("id", targetId)
            .eq("status", "approved");
      if (!updErr) hidden = true;
    }
  }

  // Уведомление основателю — best-effort, не влияет на ответ пользователю.
  await sendReportCard({
    postId: targetId,
    kind: isPhoto ? "photo" : "post",
    recipeTitle: row.recipe_title ?? null,
    userName: row.user_name ?? null,
    reason,
    reportsCount,
    hidden,
  });

  return respondOk({ hidden });
}
