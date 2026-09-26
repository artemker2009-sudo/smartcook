import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth";
import { isTrustedOrigin, originBlockedResponse, returnOrigin } from "@/lib/originGuard";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { getPlan } from "@/lib/premiumPlans";
import { getRobokassaConfig } from "@/lib/robokassaConfig";
import { buildPaymentUrl } from "@/lib/robokassa";
import { FEATURE_PREMIUM } from "@/lib/features";

// Начало оплаты: заводим заказ и отдаём адрес Robokassa.
//
// ЦЕНА БЕРЁТСЯ ТОЛЬКО С СЕРВЕРА. Из тела запроса читается ровно один параметр —
// id тарифа, и он тут же сверяется со списком в lib/premiumPlans.ts. Сумму,
// присланную клиентом, мы не просто не используем — её здесь негде взять.
//
// Премиум привязан к аккаунту, поэтому роут только для залогиненных, и
// личность берётся из ПРОВЕРЕННОГО JWT (CLAUDE.md, правило 2). user_id из тела
// запроса не читается вовсе: иначе любой мог бы оплатить Премиум на чужой
// аккаунт — или, что хуже, завести заказ от чужого имени.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Один ответ на оба случая «пока не работает»: флаг выключен или нет ключей. */
function notReadyResponse() {
  return NextResponse.json(
    { error: "Оплата заработает в ближайшие дни", code: "PAYMENT_NOT_READY" },
    // 503, а не 500: это не поломка, а «ещё не включили». Клиент по этому коду
    // показывает спокойную подсказку, а не «что-то пошло не так».
    { status: 503 },
  );
}

export async function POST(req: Request) {
  if (!isTrustedOrigin(req)) return originBlockedResponse();

  const userId = await getVerifiedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Войдите в аккаунт, чтобы оплатить" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const plan = getPlan(body?.plan);
  if (!plan) {
    return NextResponse.json({ error: "Неизвестный тариф" }, { status: 400 });
  }

  if (!FEATURE_PREMIUM) return notReadyResponse();
  const config = getRobokassaConfig();
  if (!config) return notReadyResponse();

  // Платформа — только для статистики («откуда платят»). Ни на цену, ни на
  // срок она не влияет, поэтому принимаем как есть, но режем длину.
  const platform = typeof body?.platform === "string" ? body.platform.slice(0, 32) : null;

  const supabase = createServiceRoleClient();
  const { data: order, error } = await supabase
    .from("premium_orders")
    .insert({
      user_id: userId,
      plan: plan.id,
      amount_rub: plan.priceRub,
      status: "pending",
      platform,
    })
    .select("id")
    .single();

  if (error || !order) {
    console.error("[premium] checkout: order insert failed:", error?.message);
    return NextResponse.json({ error: "Не удалось создать заказ" }, { status: 500 });
  }

  // Вернуть человека надо на ТОТ ЖЕ домен, с которого он нажал «Оплатить».
  // В настройках Robokassa Success/Fail URL один (smartcook.pro), а доменов у
  // нас два: приложения (iOS-оболочка, Android-TWA) и часть людей живут на
  // старом smart-cook.pro. Сессия лежит в Web Storage, а он у каждого origin
  // свой — вернувшись на другой домен, человек оказывался гостем и вместо
  // своего Премиума видел «Создайте аккаунт». SuccessUrl2/FailUrl2 перебивают
  // адреса из настроек ровно на этот заказ.
  const origin = returnOrigin(req);
  const returnUrls = { success: `${origin}/premium/success`, fail: `${origin}/premium/fail` };

  // id заказа и есть InvId: Robokassa принимает только целое число, поэтому
  // таблица на identity bigint, а не на uuid (см. supabase_premium.sql).
  const paymentUrl = buildPaymentUrl(config, {
    invId: order.id,
    amountRub: plan.priceRub,
    description: plan.description,
    returnUrls,
  });

  return NextResponse.json({ paymentUrl, invId: order.id });
}
