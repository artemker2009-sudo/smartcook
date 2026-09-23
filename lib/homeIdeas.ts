// Блок «Идеи на сегодня» на Главной: какие четыре карточки показать.
//
// ПРАВИЛО ПРОДУКТА: набор меняется раз в сутки и у всех одинаковый. Отсюда два
// требования, которые и определили устройство модуля:
//
//   1. Выбор ДЕТЕРМИНИРОВАННЫЙ — зависит только от даты и от набора карточек.
//      Случайный выбор на клиенте разъехался бы с серверной разметкой: React
//      выбросил бы её целиком и перерисовал уже после гидрации, то есть четыре
//      картинки начали бы качаться позже, чем могли.
//   2. Сутки считаются по МСК — как и окно витрины (lib/feedWindow.ts).
//      Иначе «сегодня» у человека в Калининграде и на сервере в UTC — разные
//      дни, и набор менялся бы посреди вечера.
//
// ЧИСТЫЙ модуль без "use client" и без "server-only": его зовёт серверная
// Главная, а тесты — напрямую.

import { makeRandom, type IdeaCard } from "./ideasFeed";

/** Сколько карточек показываем на Главной. Ровно две строки сетки в две колонки. */
export const HOME_IDEAS_COUNT = 4;

// Europe/Moscow — фиксированный UTC+3 (перехода на летнее время в РФ нет с
// 2014), поэтому дату считаем сдвигом, без Intl.
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Сегодняшняя дата по МСК в виде YYYY-MM-DD. Это и есть сид набора. */
export function mskDateKey(now: Date = new Date()): string {
  const msk = new Date(now.getTime() + MSK_OFFSET_MS);
  const y = msk.getUTCFullYear();
  const m = String(msk.getUTCMonth() + 1).padStart(2, "0");
  const d = String(msk.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Дата → 32-битный сид. Обычный FNV-1a: нужна не криптостойкость, а то, чтобы
 * соседние дни давали непохожие наборы (2026-09-23 и 2026-09-24 отличаются
 * одним символом, и простая сумма кодов дала бы почти тот же порядок).
 */
export function seedFromDateKey(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Карточки, которые вообще можно показать на Главной: опубликованные (это уже
 * сделал фильтр запроса) и С МИНИАТЮРОЙ.
 *
 * Миниатюра обязательна: на Главной картинки маленькие, и тянуть ради них
 * оригиналы по 1024 px — это лишние сотни килобайт на первом экране, где
 * канал нужен фотографии hero (LCP-кадр). Рецепт без миниатюры просто ждёт
 * своей очереди — их досоздаёт скрипт (lib/ideaThumb.ts).
 */
export function homeIdeaCandidates(cards: IdeaCard[]): IdeaCard[] {
  return cards.filter((card) => !!card.thumbUrl);
}

/**
 * Набор дня. Тасуем детерминированным ГПСЧ по сиду даты и берём первые N.
 *
 * Частичная тасовка (только первые N позиций) — не оптимизация ради
 * оптимизации: каталог в сотню-две строк тасуется целиком за микросекунды, но
 * от полной тасовки набор зависел бы от ВСЕГО каталога, и публикация одного
 * нового рецепта меняла бы сегодняшнюю четвёрку. Здесь же новый рецепт влияет
 * только на то, попадёт ли он сам.
 */
export function pickDailyIdeas(
  cards: IdeaCard[],
  dateKey: string,
  count: number = HOME_IDEAS_COUNT,
): IdeaCard[] {
  const pool = homeIdeaCandidates(cards);
  if (pool.length <= count) return pool.slice(0, count);

  const random = makeRandom(seedFromDateKey(dateKey));
  const out = pool.slice();
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (out.length - i));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, count);
}
