import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CRUD «Советов дня» (tips) — ТОЛЬКО через этот админ-роут на service_role
// (у таблицы tips нет INSERT/UPDATE/DELETE-политик для anon/authenticated,
// см. supabase_tips_rls.sql). Операции: create / update / setPublished / delete.
// Публикация — вручную директором после вычитки.
const BODY_MAX = 400;
const EMOJI_MAX = 16;

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, max);
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
    const text = clean(b.body, BODY_MAX);
    const emoji = clean(b.emoji_icon, EMOJI_MAX) || null;
    if (!text) {
      return NextResponse.json({ error: "Текст совета обязателен" }, { status: 400 });
    }
    const row = { body: text, emoji_icon: emoji };

    if (op === "create") {
      // Всегда создаём НЕопубликованным — публикация только вручную.
      const { data, error } = await supabase
        .from("tips")
        .insert({ ...row, is_published: false })
        .select("*")
        .single();
      if (error) return NextResponse.json({ error: "Не удалось создать совет" }, { status: 500 });
      return NextResponse.json({ success: true, tip: data });
    }

    const id = b.id;
    if (typeof id !== "string" || !id.trim()) {
      return NextResponse.json({ error: "Не хватает ID" }, { status: 400 });
    }
    const { data, error } = await supabase.from("tips").update(row).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: "Не удалось обновить совет" }, { status: 500 });
    return NextResponse.json({ success: true, tip: data });
  }

  if (op === "setPublished") {
    const id = b.id;
    const published = b.published === true;
    if (typeof id !== "string" || !id.trim()) {
      return NextResponse.json({ error: "Не хватает ID" }, { status: 400 });
    }
    const patch: Record<string, unknown> = { is_published: published };
    if (published) {
      const { data: existing } = await supabase.from("tips").select("published_at").eq("id", id).maybeSingle();
      if (existing && !existing.published_at) patch.published_at = new Date().toISOString();
    }
    const { error } = await supabase.from("tips").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: "Не удалось обновить статус" }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (op === "delete") {
    const id = b.id;
    if (typeof id !== "string" || !id.trim()) {
      return NextResponse.json({ error: "Не хватает ID" }, { status: 400 });
    }
    const { error } = await supabase.from("tips").delete().eq("id", id);
    if (error) return NextResponse.json({ error: "Не удалось удалить" }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Неизвестная операция" }, { status: 400 });
}
