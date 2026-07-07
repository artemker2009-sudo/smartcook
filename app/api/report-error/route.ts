import { NextResponse } from "next/server";
import { getVerifiedUserId, createRequestScopedClient } from "@/lib/auth";
import { checkAndConsumeReportRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGE_MAX = 2000;
const CONTACT_MAX = 200;

// Многострочное сообщение: оставляем таб (\x09) и перевод строки (\x0A),
// остальные управляющие символы вырезаем.
function sanitizeMultiline(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, max);
}

// Однострочные поля: любой управляющий символ заменяем пробелом и схлопываем.
function sanitizeSingleLine(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return cleaned.length ? cleaned : null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  const message = sanitizeMultiline(b.message, MESSAGE_MAX);
  if (!message) {
    return NextResponse.json({ error: "Опишите, что случилось." }, { status: 400 });
  }

  // Владельца берём из проверенной сессии (JWT), а не из тела запроса.
  const userRef = await getVerifiedUserId(req);

  const rate = await checkAndConsumeReportRateLimit(req, userRef);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Слишком много отправок. Попробуйте позже." },
      { status: 429 },
    );
  }

  const row = {
    message,
    contact: sanitizeSingleLine(b.contact, CONTACT_MAX),
    url: sanitizeSingleLine(b.url, 2000),
    user_agent: sanitizeSingleLine(req.headers.get("user-agent"), 1000),
    display_mode: sanitizeSingleLine(b.display_mode, 32),
    viewport: sanitizeSingleLine(b.viewport, 32),
    app_version: sanitizeSingleLine(b.app_version, 100),
    user_ref: userRef,
    status: "new",
  };

  // Вставляем через request-scoped anon/authenticated клиент — так реально
  // срабатывает RLS-политика error_reports_public_insert (доп. слой валидации
  // длин на уровне БД), а не сервисный ключ в обход RLS.
  const supabase = createRequestScopedClient(req);
  const { error } = await supabase.from("error_reports").insert(row);

  if (error) {
    console.error("[report-error] insert failed", error.message);
    return NextResponse.json({ error: "Не удалось отправить. Попробуйте позже." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
