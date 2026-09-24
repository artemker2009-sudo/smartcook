import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { moscowWeekStart, isPremiumActive } from "@/lib/premiumPeriod";

// Раздел админки «Пользователи»: логин, дата регистрации, подборов на этой
// неделе, Премиум, оплачено всего, история выдач.
//
// Доступ — requireAdminSession, как у всей админки.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

export async function GET(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const query = (url.searchParams.get("q") || "").trim().toLowerCase().slice(0, 60);

  const supabase = createServiceRoleClient();

  // 1. Пользователи. Листаем страницами — «получить по логину» в supabase-js
  //    нет (тот же приём, что в lib/recovery.ts).
  type Row = { id: string; username: string; createdAt: string };
  const users: Row[] = [];
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error || !data) break;
    for (const u of data.users) {
      const meta = (u.user_metadata || {}) as Record<string, unknown>;
      const username =
        (typeof meta.username === "string" && meta.username) ||
        (u.email || "").split("@")[0] ||
        u.id.slice(0, 8);
      if (query && !username.toLowerCase().includes(query)) continue;
      users.push({ id: u.id, username, createdAt: u.created_at });
    }
    if (data.users.length < perPage) break;
  }

  users.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const page = users.slice(0, PAGE_SIZE);
  const ids = page.map((u) => u.id);

  if (ids.length === 0) {
    return NextResponse.json({ users: [], total: users.length });
  }

  const weekStart = moscowWeekStart().toISOString();
  const [premiumRes, usageRes, ordersRes, grantsRes] = await Promise.all([
    supabase.from("user_premium").select("user_id, premium_until, is_forever").in("user_id", ids),
    supabase.from("podbor_usage").select("user_id").in("user_id", ids).gte("created_at", weekStart),
    supabase
      .from("premium_orders")
      .select("user_id, amount_rub")
      .in("user_id", ids)
      .eq("status", "paid"),
    supabase
      .from("premium_grants")
      .select("id, user_id, action, plan_or_months, comment, created_at")
      .in("user_id", ids)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const premiumByUser = new Map(
    (premiumRes.data ?? []).map((r) => [
      r.user_id,
      { premiumUntil: r.premium_until as string | null, isForever: !!r.is_forever },
    ]),
  );

  const podborsByUser = new Map<string, number>();
  for (const r of usageRes.data ?? []) {
    if (!r.user_id) continue;
    podborsByUser.set(r.user_id, (podborsByUser.get(r.user_id) ?? 0) + 1);
  }

  const paidByUser = new Map<string, number>();
  for (const r of ordersRes.data ?? []) {
    paidByUser.set(r.user_id, (paidByUser.get(r.user_id) ?? 0) + (Number(r.amount_rub) || 0));
  }

  const grantsByUser = new Map<string, unknown[]>();
  for (const g of grantsRes.data ?? []) {
    const list = grantsByUser.get(g.user_id) ?? [];
    // admin_id наружу не отдаём: админке он ничего не даёт, а поле служебное.
    list.push({
      id: g.id,
      action: g.action,
      planOrMonths: g.plan_or_months,
      comment: g.comment,
      createdAt: g.created_at,
    });
    grantsByUser.set(g.user_id, list);
  }

  const now = new Date();

  return NextResponse.json({
    total: users.length,
    users: page.map((u) => {
      const p = premiumByUser.get(u.id) ?? null;
      const state = p
        ? { premiumUntil: p.premiumUntil ? new Date(p.premiumUntil) : null, isForever: p.isForever }
        : null;
      return {
        id: u.id,
        username: u.username,
        createdAt: u.createdAt,
        podborsThisWeek: podborsByUser.get(u.id) ?? 0,
        isPremium: isPremiumActive(state, now),
        premiumUntil: p?.premiumUntil ?? null,
        isForever: !!p?.isForever,
        paidTotalRub: Math.round((paidByUser.get(u.id) ?? 0) * 100) / 100,
        grants: grantsByUser.get(u.id) ?? [],
      };
    }),
  });
}
