import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

// Раздел админки «Платежи»: плитки сумм, график по дням и последние оплаты.
//
// Доступ — той же проверкой, что у всей остальной админки (requireAdminSession,
// подписанная кука). Никакого «а вдруг это админ» по параметру запроса.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_LIMIT = 50;
const CHART_DAYS = 30;

type PaidOrder = {
  id: number;
  user_id: string;
  plan: string;
  amount_rub: number | string;
  status: string;
  paid_at: string | null;
  created_at: string;
};

/** Логин по user_id. Одним проходом по auth.users — их пока сотни, не миллионы. */
async function loadUsernames(
  admin: ReturnType<typeof createServiceRoleClient>,
  ids: Set<string>,
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (ids.size === 0) return map;

  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data) break;
    for (const u of data.users) {
      if (!ids.has(u.id)) continue;
      const meta = (u.user_metadata || {}) as Record<string, unknown>;
      map[u.id] =
        (typeof meta.username === "string" && meta.username) ||
        (typeof meta.full_name === "string" && meta.full_name) ||
        (u.email || "").split("@")[0] ||
        u.id.slice(0, 8);
    }
    if (data.users.length < perPage) break;
  }
  return map;
}

export async function GET(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("premium_orders")
    .select("id, user_id, plan, amount_rub, status, paid_at, created_at")
    .eq("status", "paid")
    .order("paid_at", { ascending: false })
    .limit(5000);

  if (error) {
    console.error("[admin/premium] payments read failed:", error.message);
    return NextResponse.json({ error: "Не удалось загрузить платежи" }, { status: 500 });
  }

  const orders = (data ?? []) as PaidOrder[];
  const now = Date.now();
  const paidAt = (o: PaidOrder) => new Date(o.paid_at || o.created_at).getTime();
  const amount = (o: PaidOrder) => Number(o.amount_rub) || 0;

  const within = (days: number) => orders.filter((o) => now - paidAt(o) <= days * DAY_MS);
  const tile = (list: PaidOrder[]) => ({
    count: list.length,
    sum: Math.round(list.reduce((acc, o) => acc + amount(o), 0) * 100) / 100,
  });

  // «Сегодня» — по календарному дню, а не «за последние 24 часа»: админ
  // сверяет цифру с выпиской, а не со скользящим окном.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const tiles = {
    today: tile(orders.filter((o) => paidAt(o) >= startOfToday.getTime())),
    week: tile(within(7)),
    month: tile(within(30)),
    all: tile(orders),
  };

  // График по дням за 30 дней. Дни без оплат остаются в списке нулями —
  // иначе столбики «слипаются» и график врёт про плотность.
  const buckets = new Map<string, { sum: number; count: number }>();
  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    const d = new Date(now - i * DAY_MS);
    buckets.set(d.toISOString().slice(0, 10), { sum: 0, count: 0 });
  }
  for (const o of within(CHART_DAYS)) {
    const key = new Date(paidAt(o)).toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (b) {
      b.sum += amount(o);
      b.count += 1;
    }
  }
  const chart = [...buckets.entries()].map(([date, b]) => ({
    date,
    sum: Math.round(b.sum * 100) / 100,
    count: b.count,
  }));

  const recent = orders.slice(0, RECENT_LIMIT);
  const usernames = await loadUsernames(supabase, new Set(recent.map((o) => o.user_id)));

  return NextResponse.json({
    tiles,
    chart,
    recent: recent.map((o) => ({
      invId: o.id,
      date: o.paid_at || o.created_at,
      // Логин, а не user_id: админке нужен человек, а uuid ей ни о чём не говорит.
      username: usernames[o.user_id] || o.user_id.slice(0, 8),
      plan: o.plan,
      amountRub: amount(o),
      status: o.status,
    })),
  });
}
