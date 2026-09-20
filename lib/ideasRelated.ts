// «Другие варианты» и «Похожие идеи» под рецептом каталога.
//
// Считается ЧИСТОЙ функцией из уже загруженного каталога — отдельных запросов
// к базе нет. Каталог маленький (сотня-две строк), страница рецепта всё равно
// читает его целиком для этих блоков, и один запрос дешевле двух-трёх
// фильтрованных.
//
// Порядок обязан быть ДЕТЕРМИНИРОВАННЫМ: страница отдаётся с сервера (SSR),
// и если бы порядок зависел от чего-то случайного, клиент отрисовал бы другой
// и React выбросил бы серверную разметку. Поэтому в конце сортировки всегда
// стоит slug — он уникален, и ничьей быть не может.

import type { IdeaCard } from "./ideasFeed";

/** Всего карточек под рецептом — на оба блока вместе. */
export const RELATED_LIMIT = 6;

/** Вес за совпадение главного продукта. Тег весит 1, продукт — заметно больше. */
const MAIN_PRODUCT_WEIGHT = 3;

export type RelatedIdeas = {
  /** Тот же family. Пусто, если семейства нет или в нём один рецепт. */
  family: IdeaCard[];
  /** Похожие по главному продукту и тегам, без уже показанных. */
  similar: IdeaCard[];
};

function byWeightThenFresh(a: IdeaCard, b: IdeaCard): number {
  if (b.sortWeight !== a.sortWeight) return b.sortWeight - a.sortWeight;
  const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
  const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
  if (bTime !== aTime) return bTime - aTime;
  return a.slug.localeCompare(b.slug);
}

function tagOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const set = new Set(b);
  return a.reduce((count, tag) => (set.has(tag) ? count + 1 : count), 0);
}

export function relatedIdeas(
  current: { slug: string; family: string | null; mainProduct: string; tags: string[] },
  all: IdeaCard[],
  limit = RELATED_LIMIT,
): RelatedIdeas {
  const pool = all.filter((card) => card.slug !== current.slug);

  // Семейство — это «то же блюдо другим способом», самая сильная связь.
  const family = current.family
    ? pool.filter((card) => card.family === current.family).sort(byWeightThenFresh).slice(0, limit)
    : [];

  const shown = new Set(family.map((card) => card.slug));
  const room = limit - family.length;
  if (room <= 0) return { family, similar: [] };

  const similar = pool
    .filter((card) => !shown.has(card.slug))
    .map((card) => ({
      card,
      weight:
        (card.mainProduct === current.mainProduct ? MAIN_PRODUCT_WEIGHT : 0) +
        tagOverlap(current.tags, card.tags),
    }))
    // Ноль общего — не «похожее». Лучше показать три карточки, чем добить
    // шестёрку случайными блюдами: тогда блок перестаёт что-либо значить.
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => (b.weight !== a.weight ? b.weight - a.weight : byWeightThenFresh(a.card, b.card)))
    .slice(0, room)
    .map((entry) => entry.card);

  return { family, similar };
}
