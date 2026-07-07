import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CRUD новостей — ТОЛЬКО через этот админ-роут на service_role (у таблицы news
// нет INSERT/UPDATE/DELETE-политик для anon/authenticated). Операции: create /
// update / setVisible / delete. Лимиты длины совпадают с БД-констрейнтами.
const TITLE_MAX = 200;
const BODY_MAX = 1000;
const DATE_MAX = 50;

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // Убираем управляющие символы (кроме перевода строки/таба), обрезаем длину.
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

  const op = (body as Record<string, unknown>).op;
  const supabase = createServiceRoleClient();

  if (op === "create" || op === "update") {
    const title = clean((body as Record<string, unknown>).title, TITLE_MAX);
    const text = clean((body as Record<string, unknown>).body, BODY_MAX);
    const date = clean((body as Record<string, unknown>).date, DATE_MAX);
    if (!title || !text) {
      return NextResponse.json({ error: "Заголовок и текст обязательны" }, { status: 400 });
    }
    const row = { title, body: text, date: date || null };

    if (op === "create") {
      const { data, error } = await supabase.from("news").insert(row).select("*").single();
      if (error) return NextResponse.json({ error: "Не удалось создать новость" }, { status: 500 });
      return NextResponse.json({ success: true, news: data });
    }

    const id = (body as Record<string, unknown>).id;
    if (typeof id !== "string" || !id.trim()) {
      return NextResponse.json({ error: "Не хватает ID" }, { status: 400 });
    }
    const { data, error } = await supabase.from("news").update(row).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: "Не удалось обновить новость" }, { status: 500 });
    return NextResponse.json({ success: true, news: data });
  }

  if (op === "setVisible") {
    const id = (body as Record<string, unknown>).id;
    const visible = (body as Record<string, unknown>).visible === true;
    if (typeof id !== "string" || !id.trim()) {
      return NextResponse.json({ error: "Не хватает ID" }, { status: 400 });
    }
    const { error } = await supabase.from("news").update({ is_visible: visible }).eq("id", id);
    if (error) return NextResponse.json({ error: "Не удалось обновить" }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (op === "delete") {
    const id = (body as Record<string, unknown>).id;
    if (typeof id !== "string" || !id.trim()) {
      return NextResponse.json({ error: "Не хватает ID" }, { status: 400 });
    }
    const { error } = await supabase.from("news").delete().eq("id", id);
    if (error) return NextResponse.json({ error: "Не удалось удалить" }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Неизвестная операция" }, { status: 400 });
}
