import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { slugify } from "@/lib/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CRUD «Кухонных заметок» (articles) — ТОЛЬКО через этот админ-роут на
// service_role (у таблицы articles нет INSERT/UPDATE/DELETE-политик для
// anon/authenticated, см. supabase_articles_rls.sql). Операции: create /
// update / setPublished / delete. Публикация — отдельной операцией и вручную:
// директор публикует после вычитки. Лимиты длины совпадают с БД-констрейнтами.
const TITLE_MAX = 200;
const EXCERPT_MAX = 400;
const BODY_MAX = 20000;
const EMOJI_MAX = 16;
const SLUG_MAX = 200;

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, max);
}

// Подбираем свободный slug: базовый из заголовка (или заданный), при коллизии
// добавляем -2, -3… excludeId — id редактируемой статьи (её собственный slug
// коллизией не считаем).
async function uniqueSlug(
  supabase: ReturnType<typeof createServiceRoleClient>,
  base: string,
  excludeId?: string,
): Promise<string> {
  const root = base || "zametka";
  let candidate = root;
  for (let i = 2; i < 200; i++) {
    const { data } = await supabase
      .from("articles")
      .select("id")
      .eq("slug", candidate)
      .limit(1)
      .maybeSingle();
    if (!data || (excludeId && data.id === excludeId)) return candidate;
    candidate = `${root}-${i}`.slice(0, SLUG_MAX);
  }
  // Крайний случай — добавляем случайный суффикс.
  return `${root}-${Math.random().toString(36).slice(2, 7)}`.slice(0, SLUG_MAX);
}

export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const op = b.op;
  const supabase = createServiceRoleClient();

  if (op === "create" || op === "update") {
    const title = clean(b.title, TITLE_MAX);
    const excerpt = clean(b.excerpt, EXCERPT_MAX);
    const text = clean(b.body, BODY_MAX);
    const emoji = clean(b.emoji_icon, EMOJI_MAX) || null;
    if (!title || !excerpt || !text) {
      return NextResponse.json(
        { error: "Заголовок, краткое описание и текст обязательны" },
        { status: 400 },
      );
    }

    // slug: берём заданный (нормализуем) или из заголовка; гарантируем уникальность.
    const rawSlug = clean(b.slug, SLUG_MAX);
    const baseSlug = slugify(rawSlug || title);

    if (op === "create") {
      const slug = await uniqueSlug(supabase, baseSlug);
      // Всегда создаём НЕопубликованной — публикация только вручную.
      const row = { title, excerpt, body: text, emoji_icon: emoji, slug, is_published: false };
      const { data, error } = await supabase.from("articles").insert(row).select("*").single();
      if (error) return NextResponse.json({ error: "Не удалось создать заметку" }, { status: 500 });
      return NextResponse.json({ success: true, article: data });
    }

    const id = b.id;
    if (typeof id !== "string" || !id.trim()) {
      return NextResponse.json({ error: "Не хватает ID" }, { status: 400 });
    }
    const slug = await uniqueSlug(supabase, baseSlug, id);
    const row = { title, excerpt, body: text, emoji_icon: emoji, slug };
    const { data, error } = await supabase.from("articles").update(row).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: "Не удалось обновить заметку" }, { status: 500 });
    return NextResponse.json({ success: true, article: data });
  }

  if (op === "setPublished") {
    const id = b.id;
    const published = b.published === true;
    if (typeof id !== "string" || !id.trim()) {
      return NextResponse.json({ error: "Не хватает ID" }, { status: 400 });
    }
    // При первой публикации проставляем published_at (порядок ленты по нему).
    // При снятии с публикации published_at не трогаем — повторная публикация
    // сохранит исходную дату/позицию.
    const patch: Record<string, unknown> = { is_published: published };
    if (published) {
      const { data: existing } = await supabase
        .from("articles")
        .select("published_at")
        .eq("id", id)
        .maybeSingle();
      if (existing && !existing.published_at) patch.published_at = new Date().toISOString();
    }
    const { error } = await supabase.from("articles").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: "Не удалось обновить статус" }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (op === "delete") {
    const id = b.id;
    if (typeof id !== "string" || !id.trim()) {
      return NextResponse.json({ error: "Не хватает ID" }, { status: 400 });
    }
    const { error } = await supabase.from("articles").delete().eq("id", id);
    if (error) return NextResponse.json({ error: "Не удалось удалить" }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Неизвестная операция" }, { status: 400 });
}
