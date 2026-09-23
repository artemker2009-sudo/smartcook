// Поиск по подборке «Идеи»: название, продукты, теги.
//
// ПОЧЕМУ НА КЛИЕНТЕ И БЕЗ pg_trgm. Страница /ideas отдаёт браузеру ВЕСЬ
// опубликованный каталог (сотня строк) и фильтрует его на месте — так уже
// работают чипы. Поиск в базе означал бы для каждой буквы сетевой запрос,
// расширение pg_trgm, миграцию и индекс — ради сотни записей, которые уже
// лежат в памяти. Здесь же поиск работает мгновенно, вместе с чипами и без
// сети (в том числе в установленном приложении в офлайне).
//
// ПОЧЕМУ ОСНОВЫ, А НЕ ПОДСТРОКИ. «Руккола», «рукколой», «рукколу» — одно и то
// же слово, и человек вправе написать любое. Морфология у нас уже есть:
// lib/productWords.ts срезает окончания («руккол»), и ей же пользуется словарь
// отделов в «Покупках». Второй механизм разбора русских слов в проекте
// заводить незачем — он неминуемо разъехался бы с первым.
//
// Trigram-поиск (pg_trgm) дал бы вдобавок устойчивость к опечаткам, но стоит
// он запроса в базу на каждую букву и мигрировать его надо ради ста строк.
// Когда каталог вырастет до тысяч, это будет другой разговор.
//
// Импорты внутри lib/ — относительные: vitest не знает алиаса @/.

import { stem } from "./productWords";
import { normalizeQueryKey } from "./queryNormalize";
import type { IdeaCard } from "./ideasFeed";

/** Предел длины запроса. Столько же принимает поле в шапке ленты. */
export const MAX_IDEAS_QUERY_LENGTH = 50;

/** Больше слов человек в такое поле не вводит, а работы прибавляют. */
const MAX_TOKENS = 5;

/** Слово короче — ищем только по точному совпадению основы. */
const MIN_PREFIX_LENGTH = 3;

/**
 * Запрос из адреса или из поля → безопасная строка.
 * Пустая строка означает «поиска нет».
 */
export function sanitizeIdeasQuery(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_IDEAS_QUERY_LENGTH)
    .trim();
}

/** Запрос → основы слов. Пустой массив = искать нечего. */
export function queryStems(query: string): string[] {
  const normalized = normalizeQueryKey(sanitizeIdeasQuery(query));
  if (!normalized) return [];
  const out: string[] = [];
  for (const word of normalized.split(" ")) {
    if (word.length < 2) continue;
    const s = stem(word);
    if (!s || out.includes(s)) continue;
    out.push(s);
    if (out.length >= MAX_TOKENS) break;
  }
  return out;
}

/** Основы всех слов строки. */
function stemsOf(text: string): string[] {
  const normalized = normalizeQueryKey(text);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .filter((w) => w.length >= 2)
    .map(stem);
}

/**
 * Разобранная карточка: основы названия отдельно от остального.
 *
 * Название отдельно, потому что совпадение в нём весит больше: по запросу
 * «сырники» сверху должны стоять сырники, а не блюдо, где творог затесался в
 * составе.
 */
export type IdeaSearchEntry = {
  card: IdeaCard;
  titleStems: string[];
  otherStems: string[];
};

/**
 * Готовит каталог к поиску. Считается один раз на набор карточек, а не на
 * каждую букву.
 *
 * Главный продукт входит в «остальное» намеренно. Стеммер срезает окончания,
 * но не связывает «курицу» с «куриными крылышками» — разные корни, и никакая
 * морфология без словаря их не сведёт. Зато у каждого такого рецепта в
 * каталоге проставлен главный продукт «курица», и запрос «курица» находит их
 * все. Это и есть та связка, которой не хватает стеммеру.
 */
export function buildSearchEntries(cards: IdeaCard[]): IdeaSearchEntry[] {
  return cards.map((card) => ({
    card,
    titleStems: stemsOf(card.title),
    otherStems: [
      ...stemsOf(card.mainProduct),
      ...card.ingredientNames.flatMap(stemsOf),
      ...card.tags.flatMap(stemsOf),
    ],
  }));
}

/**
 * Совпала ли основа запроса с одной из основ карточки.
 *
 * Годится и начало слова: человек ищет на ходу, и «рукк» обязано находить
 * рукколу ещё до того, как он допишет слово. От трёх букв — ниже начинается
 * ловля половины языка.
 */
function hits(stems: string[], token: string): boolean {
  for (const s of stems) {
    if (s === token) return true;
    if (token.length >= MIN_PREFIX_LENGTH && s.startsWith(token)) return true;
  }
  return false;
}

/**
 * Насколько карточка отвечает запросу. null — не отвечает вовсе.
 *
 * Слова запроса складываются по И: «куриный суп» — это суп с курицей, а не всё
 * подряд, где встретилось хоть одно из двух слов.
 */
export function scoreEntry(entry: IdeaSearchEntry, tokens: string[]): number | null {
  if (tokens.length === 0) return null;
  let score = 0;
  for (const token of tokens) {
    if (hits(entry.titleStems, token)) score += 3;
    else if (hits(entry.otherStems, token)) score += 1;
    else return null;
  }
  return score;
}

/**
 * Карточки, отвечающие запросу, — сначала самые близкие.
 *
 * Сортировка стабильная: карточки с одинаковым весом остаются в том порядке, в
 * каком пришли, то есть в порядке ленты.
 */
export function searchCards(entries: IdeaSearchEntry[], query: string): IdeaCard[] {
  const tokens = queryStems(query);
  if (tokens.length === 0) return entries.map((e) => e.card);

  const scored: Array<{ card: IdeaCard; score: number; index: number }> = [];
  entries.forEach((entry, index) => {
    const score = scoreEntry(entry, tokens);
    if (score !== null) scored.push({ card: entry.card, score, index });
  });

  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((s) => s.card);
}
