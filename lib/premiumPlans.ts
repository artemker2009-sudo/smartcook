// Тарифы Премиума. ЕДИНСТВЕННЫЙ источник цен.
//
// Файл без "use client" и без секретов: его импортируют и серверные роуты
// (checkout считает сумму отсюда), и серверные страницы (рендер карточек).
// В клиентский компонент цены приезжают ПРОПОМ из серверного рендера — клиент
// их только показывает. Присланный клиентом plan сервер сверяет с этим
// списком, а сумму берёт здесь же: цена, пришедшая из браузера, не значит
// ничего (правило «клиенту не доверять», SPEC 0).

export type PremiumPlanId = "month" | "year" | "forever";

export type PremiumPlan = {
  id: PremiumPlanId;
  /** Название в карточке. */
  name: string;
  /** Подпись под названием. */
  sub: string;
  /** Цена в рублях, целое число. */
  priceRub: number;
  /** Срок в днях. null — «навсегда». */
  days: number | null;
  /** Бейдж справа от названия. Пустая строка — бейджа нет. */
  badge: string;
  /** Описание для Robokassa (Description и позиция чека). */
  description: string;
};

export const PREMIUM_PLANS: readonly PremiumPlan[] = [
  {
    id: "month",
    name: "Месяц",
    sub: "30 дней",
    priceRub: 49,
    days: 30,
    badge: "",
    description: "Премиум SmartCook — 1 месяц",
  },
  {
    id: "year",
    name: "Год",
    sub: "32,50 ₽ в месяц",
    priceRub: 390,
    days: 365,
    badge: "Выгоднее на 34%",
    description: "Премиум SmartCook — 1 год",
  },
  {
    id: "forever",
    name: "Навсегда",
    sub: "Один платёж — и всё",
    priceRub: 990,
    days: null,
    badge: "",
    description: "Премиум SmartCook — навсегда",
  },
] as const;

export const DEFAULT_PLAN_ID: PremiumPlanId = "month";

/** План по id. null — id не из нашего списка (клиент прислал что-то своё). */
export function getPlan(id: unknown): PremiumPlan | null {
  if (typeof id !== "string") return null;
  return PREMIUM_PLANS.find((p) => p.id === id) ?? null;
}

/** «49 ₽» — неразрывный пробел перед рублём, чтобы не переносилось. */
export function formatPriceRub(priceRub: number): string {
  return `${priceRub} ₽`;
}
