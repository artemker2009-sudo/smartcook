// Сроки Премиума и недельное окно бесплатных подборов. Чистые функции без
// обращений к базе и без глобалов — их можно прогнать тестами, и именно
// поэтому вся арифметика дат живёт здесь, а не внутри роутов.

import type { PremiumPlan } from "@/lib/premiumPlans";

/** Москва круглый год UTC+3, перехода на летнее время нет с 2014 года. */
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Начало недели по Москве: ближайший прошедший понедельник, 00:00 МСК.
 * Возвращается МОМЕНТ ВРЕМЕНИ (в UTC) — с ним и сравниваем created_at.
 *
 * Считаем в «московских миллисекундах»: сдвигаем метку на +3 часа, там
 * получаем обычный UTC-календарь, который совпадает с московскими стенными
 * часами, отрезаем до полуночи понедельника и сдвигаем обратно.
 */
export function moscowWeekStart(now: Date = new Date()): Date {
  const msk = new Date(now.getTime() + MSK_OFFSET_MS);
  const midnightMsk = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate());
  // getUTCDay(): 0 — воскресенье. Нам нужен понедельник, поэтому воскресенье
  // отстоит от начала недели на 6 дней, а не на −1.
  const daysSinceMonday = (msk.getUTCDay() + 6) % 7;
  return new Date(midnightMsk - daysSinceMonday * DAY_MS - MSK_OFFSET_MS);
}

/** Начало СЛЕДУЮЩЕЙ недели — когда лимит обнулится. */
export function moscowNextWeekStart(now: Date = new Date()): Date {
  return new Date(moscowWeekStart(now).getTime() + 7 * DAY_MS);
}

export type PremiumState = {
  /** До какого момента действует Премиум. null — срока нет. */
  premiumUntil: Date | null;
  isForever: boolean;
};

/** Активен ли Премиум прямо сейчас. */
export function isPremiumActive(state: PremiumState | null, now: Date = new Date()): boolean {
  if (!state) return false;
  if (state.isForever) return true;
  return !!state.premiumUntil && state.premiumUntil.getTime() > now.getTime();
}

/**
 * Новый срок после покупки. Правило SPEC 0: сроки СКЛАДЫВАЮТСЯ —
 * новый конец = max(сейчас, текущий конец) + срок тарифа.
 *
 * max(), а не «просто прибавить к текущему концу»: у человека с истёкшим
 * месяц назад Премиумом иначе сгорела бы часть только что оплаченного срока.
 * «Навсегда» поглощает всё: обратно в срочный Премиум не понижаем.
 */
export function extendPremium(
  current: PremiumState | null,
  plan: PremiumPlan,
  now: Date = new Date(),
): PremiumState {
  if (current?.isForever) return { premiumUntil: current.premiumUntil, isForever: true };
  if (plan.days === null) return { premiumUntil: null, isForever: true };

  const base = Math.max(now.getTime(), current?.premiumUntil?.getTime() ?? 0);
  return { premiumUntil: new Date(base + plan.days * DAY_MS), isForever: false };
}

/** Тот же расчёт для админской выдачи на N месяцев (месяц = 30 дней). */
export function extendPremiumByMonths(
  current: PremiumState | null,
  months: number | "forever",
  now: Date = new Date(),
): PremiumState {
  if (current?.isForever) return { premiumUntil: current.premiumUntil, isForever: true };
  if (months === "forever") return { premiumUntil: null, isForever: true };

  const base = Math.max(now.getTime(), current?.premiumUntil?.getTime() ?? 0);
  return { premiumUntil: new Date(base + months * 30 * DAY_MS), isForever: false };
}

const MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
] as const;

/**
 * «24 октября», а если год не текущий — «24 сентября 2027».
 * Дата показывается по МОСКВЕ: срок считается по московскому календарю, и
 * человек на Камчатке должен видеть ту же дату, что написана в оферте.
 */
export function formatPremiumDate(date: Date, now: Date = new Date()): string {
  const msk = new Date(date.getTime() + MSK_OFFSET_MS);
  const mskNow = new Date(now.getTime() + MSK_OFFSET_MS);
  const day = msk.getUTCDate();
  const month = MONTHS_GENITIVE[msk.getUTCMonth()];
  const year = msk.getUTCFullYear();
  return year === mskNow.getUTCFullYear()
    ? `${day} ${month}`
    : `${day} ${month} ${year}`;
}

/**
 * Подпись под кнопкой оплаты: до какого числа будет Премиум, если оплатить
 * этот тариф прямо сейчас. Тексты — из макета premium-page.dc.html.
 */
export function payUntilText(plan: PremiumPlan, now: Date = new Date()): string {
  if (plan.days === null) return "Премиум без срока. Платите один раз.";
  const until = new Date(now.getTime() + plan.days * DAY_MS);
  return `Премиум до ${formatPremiumDate(until, now)}. Автоплатежей нет.`;
}

/** «1 подбор», «3 подбора», «5 подборов». */
export function pluralPodbor(n: number): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return "подборов";
  if (mod10 === 1) return "подбор";
  if (mod10 >= 2 && mod10 <= 4) return "подбора";
  return "подборов";
}
