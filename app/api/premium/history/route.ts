import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

// История покупок Премиума для профиля.
//
// Чужую историю отсюда не достать: строки фильтруются по user_id из
// ПРОВЕРЕННОГО JWT, и параметра, которым можно было бы назвать другого
// человека, у роута нет вовсе.
//
// Наружу отдаём ровно то, что рисует экран: дата, тариф, сумма, статус. Ни
// user_id, ни robokassa_payload, ни admin_id (CLAUDE.md: лишних полей в ответе
// не отдаём — на этом уже обжигались с session_id в /api/feed).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type PremiumHistoryItem = {
  id: string;
  date: string;
  /** "month" | "year" | "forever" — либо "gift" для подарка от админа. */
  kind: string;
  amountRub: number | null;
  status: "paid" | "refunded" | "gift";
  /** Для подарка: «3 месяца» / «навсегда». */
  label: string | null;
};

const MAX_ITEMS = 50;

export async function POST(req: Request) {
  if (!isTrustedOrigin(req)) return originBlockedResponse();

  const userId = await getVerifiedUserId(req);
  if (!userId) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const supabase = createServiceRoleClient();

  const [orders, grants] = await Promise.all([
    supabase
      .from("premium_orders")
      .select("id, plan, amount_rub, status, paid_at, created_at")
      // pending и failed в историю не показываем: незавершённая попытка оплаты
      // человеку ничего не говорит, а «висящий» заказ только пугает.
      .in("status", ["paid", "refunded"])
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_ITEMS),
    supabase
      .from("premium_grants")
      .select("id, action, plan_or_months, created_at")
      .eq("user_id", userId)
      .eq("action", "grant")
      .order("created_at", { ascending: false })
      .limit(MAX_ITEMS),
  ]);

  if (orders.error || grants.error) {
    console.error("[premium] history failed:", orders.error?.message || grants.error?.message);
    return NextResponse.json({ error: "Не удалось прочитать историю" }, { status: 500 });
  }

  const items: PremiumHistoryItem[] = [
    ...(orders.data ?? []).map((o) => ({
      id: `order-${o.id}`,
      date: o.paid_at || o.created_at,
      kind: o.plan,
      amountRub: Number(o.amount_rub),
      status: o.status as "paid" | "refunded",
      label: null,
    })),
    ...(grants.data ?? []).map((g) => ({
      id: `grant-${g.id}`,
      date: g.created_at,
      kind: "gift",
      amountRub: null,
      status: "gift" as const,
      label: g.plan_or_months,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json({ items: items.slice(0, MAX_ITEMS) });
}
