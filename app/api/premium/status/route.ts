import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";
import { readPremiumStatus } from "@/lib/premiumServer";
import { getFreePodborsPerWeek } from "@/lib/premiumSettings";
import { countPodborsThisWeek, resolvePodborOwner } from "@/lib/podbor";
import { moscowNextWeekStart } from "@/lib/premiumPeriod";
import { FEATURE_PREMIUM } from "@/lib/features";

// Состояние Премиума и счётчик подборов за неделю — всё, что нужно экранам:
// плашке на /premium, строке «осталось N подборов» под кнопками и блоку
// «Премиум» в профиле.
//
// POST, а не GET с параметрами, СОЗНАТЕЛЬНО: гостя опознаём по session_id, а
// это фактический токен владения (им уже воровали рецепты, см. историю
// инцидентов в CLAUDE.md). В query-строке он утёк бы в логи прокси, в
// Referer и в историю браузера. В теле запроса — нет.
//
// Кто спрашивает: залогиненный — по проверенному JWT, и никакой userId из тела
// на это не влияет. Чужой Премиум отсюда не посмотреть.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isTrustedOrigin(req)) return originBlockedResponse();

  const body = await req.json().catch(() => ({}));
  const now = new Date();

  const [userId, freePodborsPerWeek] = await Promise.all([
    getVerifiedUserId(req),
    getFreePodborsPerWeek(),
  ]);

  const premium = userId
    ? await readPremiumStatus(userId, now)
    : { isPremium: false, premiumUntil: null, isForever: false };

  // Счётчик Премиуму не нужен — у него лимита нет.
  let used: number | null = 0;
  if (!premium.isPremium) {
    const owner = await resolvePodborOwner(req, body?.sessionId);
    used = await countPodborsThisWeek(owner, now);
  }

  // Сбой подсчёта: отдаём null, а не ноль. Строка «осталось N» тогда просто не
  // показывается — соврать про остаток хуже, чем промолчать.
  const remaining =
    used === null ? null : Math.max(0, freePodborsPerWeek - used);

  return NextResponse.json({
    ...premium,
    featureEnabled: FEATURE_PREMIUM,
    freePodborsPerWeek,
    used,
    remaining,
    resetsAt: moscowNextWeekStart(now).toISOString(),
  });
}
