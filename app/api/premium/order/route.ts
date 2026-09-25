import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { readPremiumStatus } from "@/lib/premiumServer";

// Статус одного заказа — для экрана /premium/success, который опрашивает его,
// пока Robokassa не сообщит об оплате на ResultURL.
//
// Премиум ЗДЕСЬ НЕ ВЫДАЁТСЯ. Этот роут только читает. Выдача — исключительно в
// ResultURL, куда приходит подписанное уведомление от сервера Robokassa:
// экран успеха человек открывает по обычной ссылке из браузера, и доверять
// ему выдачу платного срока — значит выдавать Премиум по адресу в строке.
//
// Чужой заказ отсюда не посмотреть: заказ ищется по id И user_id из
// проверенного JWT одновременно.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isTrustedOrigin(req)) return originBlockedResponse();

  const userId = await getVerifiedUserId(req);
  if (!userId) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const invId = Number(body?.invId);
  if (!Number.isInteger(invId) || invId <= 0) {
    return NextResponse.json({ error: "Неизвестный заказ" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data: order, error } = await supabase
    .from("premium_orders")
    .select("id, plan, amount_rub, status, premium_until_after")
    .eq("id", invId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[premium] order read failed:", error.message);
    return NextResponse.json({ error: "Не удалось прочитать заказ" }, { status: 500 });
  }
  if (!order) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });

  const premium = await readPremiumStatus(userId);
  return NextResponse.json({
    status: order.status,
    plan: order.plan,
    amountRub: Number(order.amount_rub),
    ...premium,
  });
}
