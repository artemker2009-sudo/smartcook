import { NextResponse } from "next/server";
import { getVerifiedUserId, createRequestScopedClient } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { readGuestRef } from "@/lib/guestSession";
import { sendSuggestionCard, type SuggestionKind } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEXT_MAX = 500;
const PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const KINDS: readonly SuggestionKind[] = ["add", "remove", "bug"];

// Многострочный текст: перевод строки и таб оставляем (человек пишет списком),
// остальные управляющие символы вырезаем, хвост обрезаем до 500. Ровно та же
// граница стоит check-ограничением в БД — санитизация здесь для того, чтобы
// длинное сообщение обрезалось, а не отбивалось ошибкой.
function sanitize(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, TEXT_MAX);
}

// Сколько предложений эта личность оставила за последние сутки. Считаем по
// самой таблице suggestions — отдельная таблица лимитов не нужна: одна запись
// в ней и есть одно использование лимита, рассинхрону взяться неоткуда.
// Читаем на service_role: у гостя нет ни JWT, ни SELECT-политики.
async function countToday(
  admin: ReturnType<typeof createServiceRoleClient>,
  owner: { userId: string | null; guestRef: string | null },
): Promise<number | null> {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const query = admin
    .from("suggestions")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  const { count, error } = owner.userId
    ? await query.eq("user_id", owner.userId)
    : await query.eq("session_id", owner.guestRef as string);

  // null-count на HEAD-запросе Supabase отдаёт и при недоступной таблице —
  // отличаем сбой от честного нуля, чтобы не раздать безлимит при аварии.
  if (error || count === null) {
    console.error("[suggestions] count failed", error?.message ?? "count came back null");
    return null;
  }
  return count;
}

// Приём предложения «что добавить, а что убрать».
//
// Личность — ТОЛЬКО из проверенного JWT либо из httpOnly-cookie sc_guest.
// Ни session_id, ни user_id из тела запроса не читаются вовсе: подставленное
// поле просто игнорируется, запись всё равно ложится на личность вызывающего.
// Без личности (голый curl, cookie не выдана) — 401: гостевую cookie ставит
// GET /api/suggestions/session, который форма дёргает при открытии шторки.
export async function POST(req: Request) {
  const userId = await getVerifiedUserId(req);
  const guestRef = userId ? null : readGuestRef(req);
  if (!userId && !guestRef) {
    return NextResponse.json(
      { error: "Сессия не найдена. Обновите страницу и попробуйте ещё раз." },
      { status: 401 },
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });

  const kind = body.kind as SuggestionKind;
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: "Выберите, о чём предложение." }, { status: 400 });
  }

  const text = sanitize(body.text);
  if (!text) {
    return NextResponse.json({ error: "Напишите пару слов — что предлагаете." }, { status: 400 });
  }

  const admin = createServiceRoleClient();

  const used = await countToday(admin, { userId, guestRef });
  if (used === null) {
    return NextResponse.json(
      { error: "Не получилось отправить. Попробуйте позже." },
      { status: 500 },
    );
  }
  if (used >= PER_DAY) {
    return NextResponse.json(
      {
        error:
          "Сегодня вы уже отправили три предложения — спасибо, я всё прочитаю! " +
          "Продолжим завтра 🙏",
      },
      { status: 429 },
    );
  }

  const row = {
    user_id: userId,
    session_id: guestRef,
    kind,
    text,
    status: "new",
  };

  // Залогиненный пишет своим JWT — вставка проходит через RLS-политику
  // suggestions_insert_own (user_id = auth.uid()), то есть подделать владельца
  // не даст уже сама база. Гостю политики не положено (иначе таблицу засыпают
  // одним curl с anon-ключом), поэтому его запись идёт на service_role, а его
  // личность взята из httpOnly-cookie, а не из тела.
  const client = userId ? createRequestScopedClient(req) : admin;
  const { error } = await client.from("suggestions").insert(row);

  if (error) {
    console.error("[suggestions] insert failed", error.message);
    return NextResponse.json(
      { error: "Не получилось отправить. Попробуйте позже." },
      { status: 500 },
    );
  }

  // Копия основателю в Telegram — best-effort: предложение уже в БД и видно в
  // админке, недоступный бот не повод отдавать человеку ошибку.
  await sendSuggestionCard({ kind, text, fromAccount: !!userId });

  // В ответе — ничего, кроме факта успеха: ни id, ни личности.
  return NextResponse.json({ ok: true });
}
