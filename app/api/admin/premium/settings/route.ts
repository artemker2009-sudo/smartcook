import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import {
  clampFreePodbors,
  getFreePodborsPerWeek,
  MAX_FREE_PODBORS_PER_WEEK,
  MIN_FREE_PODBORS_PER_WEEK,
} from "@/lib/premiumSettings";

// Настройка «Бесплатных подборов в неделю». Только админ.
//
// Отдельная таблица premium_settings, а НЕ site_settings: у той когда-то была
// публичная запись, и класть рядом число, от которого зависят деньги, нельзя.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ freePodborsPerWeek: await getFreePodborsPerWeek() });
}

export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const raw = Number(body?.freePodborsPerWeek);
  if (!Number.isFinite(raw)) {
    return NextResponse.json({ error: "Нужно число" }, { status: 400 });
  }
  if (raw < MIN_FREE_PODBORS_PER_WEEK || raw > MAX_FREE_PODBORS_PER_WEEK) {
    return NextResponse.json(
      { error: `Допустимо от ${MIN_FREE_PODBORS_PER_WEEK} до ${MAX_FREE_PODBORS_PER_WEEK}` },
      { status: 400 },
    );
  }

  const value = clampFreePodbors(raw);
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("premium_settings")
    .update({ free_podbors_per_week: value, updated_at: new Date().toISOString() })
    .eq("id", 1);

  if (error) {
    console.error("[admin/premium] settings update failed:", error.message);
    return NextResponse.json({ error: "Не удалось сохранить" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, freePodborsPerWeek: value });
}
