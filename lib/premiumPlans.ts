// Тарифы Премиума. ЕДИНСТВЕННЫЙ источник цен.
//
// Файл без "use client" и без секретов: его импортируют и серверные роуты
// (checkout считает сумму отсюда), и серверные страницы (рендер карточек).
// В клиентский компонент цены приезжают ПРОПОМ из серверного рендера — клиент
// их только показывает. Присланный клиентом plan сервер сверяет с этим
// списком, а сумму берёт здесь же: цена, пришедшая из браузера, не значит
// ничего (правило «клиенту не доверять», SPEC 0).

// Тарифов ДВА. «Месяц» за 49 ₽ убран 24.09.2026 решением основателя, до
// первой продажи: месячный тариф дешевле годового в пересчёте на неделю
// ничего не давал, а выбор из трёх строк только тормозил решение. Здесь он
// убран НАСОВСЕМ, а не спрятан флагом: id "month" больше не существует, и
// checkout на него отвечает 400 сам собой — getPlan() вернёт null.
export type PremiumPlanId = "year" | "forever";

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
    id: "year",
    name: "Год",
    sub: "Меньше 15 ₽ в месяц",
    priceRub: 169,
    days: 365,
    // Бейджа нет: сравнивать не с чем, тариф всего один срочный.
    badge: "",
    description: "Премиум SmartCook — 1 год",
  },
  {
    id: "forever",
    name: "Навсегда",
    sub: "Один платёж — и всё",
    priceRub: 490,
    days: null,
    badge: "",
    description: "Премиум SmartCook — навсегда",
  },
] as const;

// «Год» выбран сразу: он и дешевле в пересчёте, и это тот выбор, который мы
// предлагаем по умолчанию. Он же стоит первым в списке.
export const DEFAULT_PLAN_ID: PremiumPlanId = "year";

/** План по id. null — id не из нашего списка (клиент прислал что-то своё). */
export function getPlan(id: unknown): PremiumPlan | null {
  if (typeof id !== "string") return null;
  return PREMIUM_PLANS.find((p) => p.id === id) ?? null;
}

/** «49 ₽» — неразрывный пробел перед рублём, чтобы не переносилось. */
export function formatPriceRub(priceRub: number): string {
  return `${priceRub} ₽`;
}
