import { getRobokassaConfig } from "@/lib/robokassaConfig";
import { isTestNotification, sameAmount, verifyResultSignature } from "@/lib/robokassa";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { getPlan } from "@/lib/premiumPlans";
import { extendPremium } from "@/lib/premiumPeriod";
import { readPremiumState, writePremiumState } from "@/lib/premiumServer";

// ResultURL — сюда СЕРВЕР Robokassa сообщает, что оплата прошла. Именно здесь
// и только здесь выдаётся Премиум.
//
// ORIGIN-ГАРД НЕ ПРИМЕНЯЕМ СОЗНАТЕЛЬНО. isTrustedOrigin стоит на всех наших
// роутах, потому что их зовёт наш же фронтенд. Этот зовёт чужой сервер, у
// которого нашего Origin нет и быть не может — гард отбивал бы ровно те
// запросы, ради которых роут существует. Защита здесь другая и более сильная:
// подпись, посчитанная Паролем #2. Пароль знают только Robokassa и мы.
//
// ЧТО ПРОВЕРЯЕТСЯ, ПО ПОРЯДКУ:
//   1. подпись (Пароль #2) — иначе кто угодно выдал бы себе Премиум POST'ом;
//   2. заказ существует;
//   3. сумма совпадает с суммой заказа — иначе Премиум за 1 ₽ вместо 490 ₽;
//   4. статус заказа pending.
//
// ИДЕМПОТЕНТНОСТЬ. Robokassa повторяет уведомление, пока не получит OK. Заказ
// со статусом paid второй раз срок НЕ продлевает, но отвечает OK — иначе
// повторы шли бы бесконечно, а один платёж давал бы два срока.
//
// Ответ — ровно `OK<InvId>` текстом. Любой другой ответ Robokassa считает
// неудачей и повторяет уведомление.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ok(invId: string) {
  return new Response(`OK${invId}`, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function bad(message: string) {
  // Тело сознательно без подробностей: этот роут открыт наружу, и рассказывать
  // тому, кто перебирает подписи, что именно у него не сошлось, незачем.
  console.warn("[premium] ResultURL rejected:", message);
  return new Response("bad sign", {
    status: 400,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/** Robokassa шлёт form-urlencoded (POST) или query (GET) — принимаем оба. */
async function readParams(req: Request): Promise<URLSearchParams> {
  if (req.method === "GET") return new URL(req.url).searchParams;
  const text = await req.text();
  return new URLSearchParams(text);
}

async function handle(req: Request): Promise<Response> {
  const config = getRobokassaConfig();
  if (!config) {
    console.error("[premium] ResultURL: ключи Robokassa не заданы");
    return bad("no config");
  }

  const params = await readParams(req);
  const outSum = params.get("OutSum") || params.get("out_summ") || "";
  const invIdRaw = params.get("InvId") || params.get("inv_id") || "";
  const signature = params.get("SignatureValue") || params.get("crc") || "";

  if (!outSum || !invIdRaw || !signature) return bad("missing params");
  if (!verifyResultSignature(config, { outSum, invId: invIdRaw, signature })) {
    return bad(`signature mismatch for InvId=${invIdRaw}`);
  }

  // Тестовое уведомление, когда магазин объявлен боевым, — отказ, даже если
  // подпись сошлась. Подробнее, почему одной подписи мало, — в
  // isTestNotification (lib/robokassa.ts). Коротко: если переключить
  // ROBOKASSA_IS_TEST в false, а пароли забыть тестовыми, тестовая оплата
  // выдала бы настоящий Премиум за ноль рублей.
  //
  // Проверка стоит ПОСЛЕ подписи сознательно: так в лог попадают только
  // уведомления, которые прошли проверку пароля, — то есть настоящая
  // рассогласованность настроек, а не чужие пробы наугад.
  if (!config.isTest && isTestNotification(params)) {
    console.error(
      `[premium] ОТКАЗ: тестовое уведомление в боевом режиме, InvId=${invIdRaw}. ` +
        `Проверьте, что ROBOKASSA_PASSWORD_1/2 боевые, а не тестовые.`,
    );
    return bad(`test notification while live for InvId=${invIdRaw}`);
  }

  const invId = Number(invIdRaw);
  if (!Number.isInteger(invId) || invId <= 0) return bad(`bad InvId=${invIdRaw}`);

  const supabase = createServiceRoleClient();
  const { data: order, error } = await supabase
    .from("premium_orders")
    .select("id, user_id, plan, amount_rub, status")
    .eq("id", invId)
    .maybeSingle();

  if (error) {
    console.error("[premium] ResultURL: order read failed:", error.message);
    // 500, а не OK: пусть Robokassa повторит, когда база оживёт. Ответить OK
    // здесь — значит потерять оплату навсегда.
    return new Response("db error", { status: 500 });
  }
  if (!order) return bad(`unknown InvId=${invId}`);

  if (!sameAmount(outSum, order.amount_rub)) {
    return bad(`amount mismatch for InvId=${invId}`);
  }

  const plan = getPlan(order.plan);
  if (!plan) return bad(`InvId=${invId} has unknown plan ${order.plan}`);

  const now = new Date();

  // ── Идемпотентность: сначала АТОМАРНЫЙ ЗАХВАТ заказа, потом зачисление ─────
  //
  // Robokassa повторяет уведомление, пока не получит OK, и два повтора могут
  // прийти одновременно. Если сначала продлевать срок, а потом менять статус,
  // оба повтора успеют продлить — один платёж, два срока.
  //
  // Поэтому статус меняется ПЕРВЫМ, условием `status = 'pending'`: захватить
  // заказ может ровно один запрос, остальным база вернёт ноль строк.
  const payload: Record<string, string> = {};
  for (const [k, v] of params.entries()) {
    // В robokassa_payload кладём ТОЛЬКО поля ответа и НИ ОДНОГО секрета: ни
    // паролей, ни SignatureValue — по нему вместе с суммой и номером заказа
    // пароль перебирается офлайн.
    if (/signature|password|crc/i.test(k)) continue;
    payload[k] = v.slice(0, 500);
  }

  const { data: claimedRows, error: claimError } = await supabase
    .from("premium_orders")
    .update({ status: "paid", paid_at: now.toISOString(), robokassa_payload: payload })
    .eq("id", invId)
    .eq("status", "pending")
    .select("id");

  if (claimError) {
    console.error("[premium] ResultURL: claim failed:", claimError.message);
    return new Response("db error", { status: 500 });
  }

  const claimedByUs = (claimedRows?.length ?? 0) > 0;
  const current = await readPremiumState(order.user_id);

  if (!claimedByUs) {
    // Захватить не смогли: заказ уже не pending. Два случая.
    const { data: fresh } = await supabase
      .from("premium_orders")
      .select("status, premium_until_after")
      .eq("id", invId)
      .maybeSingle();

    if (fresh?.status !== "paid") return bad(`InvId=${invId} has status ${fresh?.status}`);

    // Срок уже зачислён — просто отвечаем OK, второй раз не продлеваем.
    const granted = plan.days === null ? !!current?.isForever : !!fresh.premium_until_after;
    if (granted) return ok(invIdRaw);

    // Заказ помечен оплаченным, а срок не зачислён: процесс упал ровно между
    // захватом и зачислением. Не бросаем человека без Премиума — дозачисляем.
    console.warn(`[premium] InvId=${invId} paid but not granted — дозачисляем`);
  }

  const next = extendPremium(current, plan, now);

  if (!(await writePremiumState(order.user_id, next))) {
    // Срок не записался. Отпускаем захват обратно в pending, чтобы следующее
    // уведомление Robokassa попробовало снова: иначе деньги взяты, заказ
    // помечен оплаченным, а Премиума нет — и повтор уже ничего не исправит.
    if (claimedByUs) {
      await supabase
        .from("premium_orders")
        .update({ status: "pending", paid_at: null })
        .eq("id", invId)
        .eq("status", "paid");
    }
    return new Response("db error", { status: 500 });
  }

  // Метка «срок по этому заказу зачислён». По ней же повтор отличает
  // доведённый до конца заказ от оборванного (см. ветку выше).
  const { error: markError } = await supabase
    .from("premium_orders")
    .update({
      premium_until_after: next.isForever ? null : next.premiumUntil?.toISOString() ?? null,
    })
    .eq("id", invId);

  if (markError) {
    // Срок у человека уже есть — это главное. Метку не поставили: повтор
    // уведомления увидит «не зачислено» и зачислит ещё раз. Для «навсегда»
    // это безвредно, для срочного тарифа — лишние 30/365 дней, что заметно
    // дешевле, чем оставить оплатившего без Премиума.
    console.error("[premium] ResultURL: mark failed:", markError.message);
  }

  console.info(`[premium] paid InvId=${invId} plan=${plan.id}`);
  return ok(invIdRaw);
}

export async function POST(req: Request) {
  return handle(req);
}

// GET на случай, если магазин настроен на метод GET. Логика та же.
export async function GET(req: Request) {
  return handle(req);
}
