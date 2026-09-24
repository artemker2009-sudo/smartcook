import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { extendPremiumByMonths, isPremiumActive } from "@/lib/premiumPeriod";
import { readPremiumState, writePremiumState } from "@/lib/premiumServer";

// Выдать или забрать Премиум руками. Только админ (requireAdminSession).
//
// Каждое действие пишется в premium_grants: кто, кому, что и когда. Это не
// украшение — выдача платного срока мимо оплаты должна быть видна в истории,
// иначе через месяц не разобрать, почему у человека Премиум без единого заказа.
//
// admin_id остаётся null: админка входит по общему паролю, отдельных админских
// аккаунтов в системе нет, и писать туда выдуманный uuid было бы враньём.
// Колонка заведена на будущее (supabase_premium.sql).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MONTHS = [1, 3, 6, 12];

export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const action = body?.action === "revoke" ? "revoke" : "grant";
  const comment = typeof body?.comment === "string" ? body.comment.trim().slice(0, 300) : null;

  if (!userId) return NextResponse.json({ error: "Не указан пользователь" }, { status: 400 });

  const supabase = createServiceRoleClient();
  const now = new Date();

  let planOrMonths: string;

  if (action === "revoke") {
    // Забрать — это обнулить срок, а не «поставить вчера»: следующая покупка
    // сложится с нулём, как у человека, который никогда ничего не покупал.
    if (!(await writePremiumState(userId, { premiumUntil: null, isForever: false }))) {
      return NextResponse.json({ error: "Не удалось забрать Премиум" }, { status: 500 });
    }
    planOrMonths = "revoke";
  } else {
    const forever = body?.months === "forever";
    const months = Number(body?.months);
    if (!forever && !ALLOWED_MONTHS.includes(months)) {
      return NextResponse.json({ error: "Срок: 1, 3, 6, 12 месяцев или навсегда" }, { status: 400 });
    }

    const current = await readPremiumState(userId);
    // Сроки складываются — то же правило, что при покупке (SPEC 0).
    const next = extendPremiumByMonths(current, forever ? "forever" : months, now);
    if (!(await writePremiumState(userId, next))) {
      return NextResponse.json({ error: "Не удалось выдать Премиум" }, { status: 500 });
    }
    planOrMonths = forever ? "навсегда" : `${months} мес.`;
  }

  const { error: logError } = await supabase.from("premium_grants").insert({
    user_id: userId,
    action,
    plan_or_months: planOrMonths,
    comment,
    admin_id: null,
  });
  // Срок уже изменён — из-за незаписанного лога отказывать поздно и незачем.
  if (logError) console.error("[admin/premium] grant log failed:", logError.message);

  const state = await readPremiumState(userId);
  return NextResponse.json({
    ok: true,
    isPremium: isPremiumActive(state, now),
    premiumUntil: state?.premiumUntil?.toISOString() ?? null,
    isForever: !!state?.isForever,
  });
}
