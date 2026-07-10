// Окно времени витрины «Приготовили сегодня».
//
// Правило продукта: показываем фото за сегодня (по МСК). Если сегодняшних фото
// меньше FEED_TODAY_MIN — дозаполняем блок фотографиями за последние
// FEED_WINDOW_DAYS суток, и заголовок честно переключается на «на этой неделе».
// Пустое окно → витрина скрыта совсем (лучше ничего, чем врать про «сегодня»).
//
// Общий модуль (без клиентских зависимостей): одна и та же логика на СЕРВЕРЕ
// (app/page.tsx, SSR) и на КЛИЕНТЕ (components/HomeFeed.tsx, до-подгрузка лайков
// залогиненного) — чтобы заголовок и набор фото совпадали до и после гидрации.

export const FEED_TODAY_MIN = 6;
export const FEED_WINDOW_DAYS = 7;

// Europe/Moscow — фиксированный UTC+3 (перехода на летнее время в РФ нет с 2014),
// поэтому «начало суток по МСК» считаем без тяжёлой Intl-машинерии.
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Метка времени (ms, UTC) начала сегодняшних суток по московскому времени. */
export function feedTodayStartMs(now: Date = new Date()): number {
  const msk = new Date(now.getTime() + MSK_OFFSET_MS);
  const startOfMskDayAsUtc = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate());
  return startOfMskDayAsUtc - MSK_OFFSET_MS;
}

/** ISO нижней границы окна витрины (начало суток FEED_WINDOW_DAYS назад, по МСК). */
export function feedWindowStartISO(now: Date = new Date()): string {
  const weekStartMs = feedTodayStartMs(now) - (FEED_WINDOW_DAYS - 1) * 86400000;
  return new Date(weekStartMs).toISOString();
}

export type FeedMode = "today" | "week";

// Из списка за окно (created_at desc) выбираем, что реально показать:
//   * сегодняшних >= FEED_TODAY_MIN → режим 'today', только сегодняшние;
//   * иначе → режим 'week', весь недельный список (сегодняшние всё равно сверху).
// items пустой → витрину не рендерим.
export function partitionFeedWindow<T extends { created_at: string }>(
  windowItems: T[],
  now: Date = new Date(),
): { mode: FeedMode; items: T[] } {
  const todayStart = feedTodayStartMs(now);
  const todayItems = windowItems.filter((item) => Date.parse(item.created_at) >= todayStart);
  if (todayItems.length >= FEED_TODAY_MIN) return { mode: "today", items: todayItems };
  return { mode: "week", items: windowItems };
}
