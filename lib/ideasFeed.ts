// Лента «Идеи»: колонки для запроса, фильтры, порядок и раскладка.
//
// ЧИСТЫЙ модуль БЕЗ "server-only" и БЕЗ "use client": его импортируют и
// серверная страница (список колонок), и клиентская лента (порядок, фильтры),
// и тесты. Директива "use client" здесь была бы вредна — см. грабли с
// рантайм-константами в lib/articles.ts: строка колонок приезжала бы в
// серверный компонент заглушкой, и PostgREST отвечал бы 400.

import { hidesCard, type TasteMatcher } from "./ideasTaste";

/** Карточка ленты — ровно то, что нужно сетке и фильтрам, ни поля больше. */
export type IdeaCard = {
  slug: string;
  title: string;
  cookingTimeMinutes: number;
  meals: string[];
  mainProduct: string;
  allergens: string[];
  family: string | null;
  /**
   * Свободные теги. Нужны ТОЛЬКО блоку «Похожие идеи» на экране рецепта, и
   * лента их не запрашивает — в карточках ленты здесь пустой массив. Тащить
   * теги в пейлоад каждой из восьмидесяти карточек незачем: см.
   * IDEA_RECIPE_CATALOG_COLUMNS, экран рецепта просит их отдельно.
   */
  tags: string[];
  imageUrl: string;
  imageAspect: string;
  sortWeight: number;
  publishedAt: string | null;
  /**
   * ТОЛЬКО названия ингредиентов, без количеств. Количества нужны экрану
   * рецепта, а ленте — нет, и тащить их в пейлоад каждой из восьмидесяти
   * карточек незачем. Отрезаем на сервере, до отправки клиенту.
   */
  ingredientNames: string[];
};

/**
 * Явный список колонок для публичного запроса. Никаких select=*.
 *
 * `ingredients` берём целиком (в jsonb количества лежат в тех же объектах),
 * но на клиент уходят только имена — см. toIdeaCard.
 */
export const IDEA_FEED_COLUMNS = [
  "slug",
  "title",
  "cooking_time_minutes",
  "meals",
  "main_product",
  "allergens",
  "family",
  "image_url",
  "image_aspect",
  "sort_weight",
  "published_at",
  "ingredients",
].join(",");

/**
 * Колонки для каталога, который читает ЭКРАН РЕЦЕПТА: те же, что у ленты, плюс
 * теги — по ним считается блок «Похожие идеи». Лента их не просит, и её
 * пейлоад не меняется.
 */
export const IDEA_RECIPE_CATALOG_COLUMNS = `${IDEA_FEED_COLUMNS},tags`;

type RawRow = {
  slug: string;
  title: string;
  cooking_time_minutes: number;
  meals: string[] | null;
  main_product: string;
  allergens: string[] | null;
  family: string | null;
  tags?: string[] | null;
  image_url: string | null;
  image_aspect: string | null;
  sort_weight: number | null;
  published_at: string | null;
  ingredients: { name?: string }[] | null;
};

/** Строка базы → карточка. Здесь же отсекаются количества ингредиентов. */
export function toIdeaCard(row: RawRow): IdeaCard | null {
  // Гейт публикации не пускает рецепт без картинки, но лента не должна
  // рассыпаться, если строка всё же придёт без неё.
  if (!row.image_url) return null;
  return {
    slug: row.slug,
    title: row.title,
    cookingTimeMinutes: row.cooking_time_minutes,
    meals: row.meals ?? [],
    mainProduct: row.main_product,
    allergens: row.allergens ?? [],
    family: row.family,
    tags: row.tags ?? [],
    imageUrl: row.image_url,
    imageAspect: row.image_aspect === "portrait" ? "portrait" : "square",
    sortWeight: row.sort_weight ?? 0,
    publishedAt: row.published_at,
    ingredientNames: (row.ingredients ?? [])
      .map((i) => (typeof i?.name === "string" ? i.name : ""))
      .filter(Boolean),
  };
}

// ── Фильтры ──────────────────────────────────────────────────────────────────
//
// Значения в адресе — ЛАТИНИЦЕЙ. В базе приёмы пищи и главный продукт лежат
// по-русски, но кириллица в query превращается в процентную кашу, а ссылку на
// отфильтрованную ленту люди отправляют друг другу.

export const MEAL_BY_PARAM: Record<string, string> = {
  breakfast: "завтрак",
  lunch: "обед",
  dinner: "ужин",
  snack: "перекус",
};

export const MAIN_BY_PARAM: Record<string, string> = {
  chicken: "курица",
  meat: "мясо",
  fish: "рыба",
  veg: "без мяса",
};

const PARAM_BY_MEAL = Object.fromEntries(Object.entries(MEAL_BY_PARAM).map(([k, v]) => [v, k]));
const PARAM_BY_MAIN = Object.fromEntries(Object.entries(MAIN_BY_PARAM).map(([k, v]) => [v, k]));

/** «До 30 минут». Порог один на интерфейс и на фильтрацию. */
export const QUICK_MAX_MINUTES = 30;

export type IdeaFilters = {
  /** Русское значение из словаря или null = «Все». */
  meal: string | null;
  mainProduct: string | null;
  quick: boolean;
  fit: boolean;
};

export const EMPTY_FILTERS: IdeaFilters = {
  meal: null,
  mainProduct: null,
  quick: false,
  fit: false,
};

export function parseFilters(params: {
  get(name: string): string | null;
}): IdeaFilters {
  const meal = MEAL_BY_PARAM[params.get("meal") ?? ""] ?? null;
  const mainProduct = MAIN_BY_PARAM[params.get("main") ?? ""] ?? null;
  return {
    meal,
    mainProduct,
    quick: params.get("max") === String(QUICK_MAX_MINUTES),
    fit: params.get("fit") === "1",
  };
}

/** Фильтры → строка запроса. Пустой фильтр не попадает в адрес вовсе. */
export function filtersToQuery(filters: IdeaFilters): string {
  const parts: string[] = [];
  if (filters.meal && PARAM_BY_MEAL[filters.meal]) parts.push(`meal=${PARAM_BY_MEAL[filters.meal]}`);
  if (filters.mainProduct && PARAM_BY_MAIN[filters.mainProduct]) {
    parts.push(`main=${PARAM_BY_MAIN[filters.mainProduct]}`);
  }
  if (filters.quick) parts.push(`max=${QUICK_MAX_MINUTES}`);
  if (filters.fit) parts.push("fit=1");
  return parts.join("&");
}

export function hasAnyFilter(filters: IdeaFilters): boolean {
  return !!filters.meal || !!filters.mainProduct || filters.quick || filters.fit;
}

export function applyFilters(
  cards: IdeaCard[],
  filters: IdeaFilters,
  taste: TasteMatcher | null,
): IdeaCard[] {
  return cards.filter((card) => {
    if (filters.meal && !card.meals.includes(filters.meal)) return false;
    if (filters.mainProduct && card.mainProduct !== filters.mainProduct) return false;
    if (filters.quick && card.cookingTimeMinutes > QUICK_MAX_MINUTES) return false;
    if (filters.fit && taste && hidesCard(card, taste)) return false;
    return true;
  });
}

// ── Порядок ──────────────────────────────────────────────────────────────────

/**
 * Детерминированный ГПСЧ (mulberry32). Именно детерминированный: порядок
 * обязан воспроизводиться по сиду, иначе возврат из рецепта показывал бы
 * другую ленту и скролл вставал бы в чужое место.
 */
export function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** На сколько карточек минимум разводим рецепты одного семейства. */
export const FAMILY_GAP = 6;

/**
 * Разводит рецепты одного семейства.
 *
 * Жадно: если семейство встречалось в последних FAMILY_GAP карточках, элемент
 * откладывается и вставляется при первой возможности. Если развести не
 * удаётся (три сырника на десять рецептов — наш нынешний каталог), правило
 * ОСЛАБЛЯЕТСЯ, а не роняет ленту: лучше два сырника рядом, чем пустой экран.
 */
export function spaceOutFamilies(cards: IdeaCard[], gap: number = FAMILY_GAP): IdeaCard[] {
  const out: IdeaCard[] = [];
  const pending: IdeaCard[] = [];
  const queue = cards.slice();

  const tooClose = (family: string | null): boolean => {
    if (!family) return false;
    const from = Math.max(0, out.length - gap);
    for (let i = from; i < out.length; i++) if (out[i].family === family) return true;
    return false;
  };

  while (queue.length > 0 || pending.length > 0) {
    // Сначала пробуем вернуть отложенное — оно ждёт дольше.
    const readyIndex = pending.findIndex((c) => !tooClose(c.family));
    if (readyIndex >= 0) {
      out.push(pending.splice(readyIndex, 1)[0]);
      continue;
    }

    const next = queue.shift();
    if (!next) {
      // Очередь пуста, а отложенное развести некуда — кладём как есть.
      out.push(pending.shift() as IdeaCard);
      continue;
    }

    if (tooClose(next.family)) pending.push(next);
    else out.push(next);
  }

  return out;
}

/**
 * Итоговый порядок ленты.
 *
 * Считается ОДИН РАЗ за заход и замораживается вызывающим. Множество открытых
 * рецептов — снимок на момент расчёта: если пересчитывать на каждом рендере,
 * возврат из только что открытого рецепта утаскивал бы его карточку вниз
 * прямо под пальцем, и позиция скролла ехала бы. Открытые сегодня влияют на
 * порядок следующего захода.
 */
export function orderCards(
  cards: IdeaCard[],
  opts: { seed: number; seen: string[]; gap?: number },
): IdeaCard[] {
  const seen = new Set(opts.seen);
  const mixed = shuffled(cards, makeRandom(opts.seed));

  // Не открытые вперёд, открытые в конец. Внутри каждой группы — вес, потом
  // порядок тасовки (сортировка стабильная, поэтому тасовка сохраняется).
  const fresh = mixed.filter((c) => !seen.has(c.slug));
  const old = mixed.filter((c) => seen.has(c.slug));
  const byWeight = (a: IdeaCard, b: IdeaCard) => b.sortWeight - a.sortWeight;

  return spaceOutFamilies([...fresh.sort(byWeight), ...old.sort(byWeight)], opts.gap);
}

// ── Раскладка по колонкам ────────────────────────────────────────────────────

/**
 * Высота текстового блока карточки в долях ШИРИНЫ КОЛОНКИ.
 *
 * Значение приблизительное — и это нормально: от него зависит только качество
 * балансировки колонок, а не корректность. Точное значение в пикселях зависит
 * от ширины экрана, и гнаться за ним значит измерять DOM, то есть вносить
 * зависимость от гидрации туда, где её быть не должно.
 */
export const TEXT_BLOCK_UNITS = 0.34;

export function cardHeightUnits(imageAspect: string): number {
  return (imageAspect === "portrait" ? 1.5 : 1) + TEXT_BLOCK_UNITS;
}

/**
 * Раскладка по колонкам по накопленной высоте: каждая следующая карточка
 * уходит в колонку, которая сейчас короче.
 *
 * Чистая арифметика — одинаково на сервере и на клиенте, без измерений DOM.
 * Дыр не бывает по построению: колонка это вертикальная стопка карточек.
 */
export function splitIntoColumns(cards: IdeaCard[], columns: number): IdeaCard[][] {
  const count = Math.max(1, Math.floor(columns));
  const result: IdeaCard[][] = Array.from({ length: count }, () => []);
  const heights = new Array<number>(count).fill(0);

  for (const card of cards) {
    let target = 0;
    for (let i = 1; i < count; i++) if (heights[i] < heights[target]) target = i;
    result[target].push(card);
    heights[target] += cardHeightUnits(card.imageAspect);
  }

  return result;
}

// ── Хранилище захода ─────────────────────────────────────────────────────────

/**
 * Восстановить порядок захода из сохранённого списка slug'ов.
 *
 * ЗАЧЕМ ЭТО ВООБЩЕ НУЖНО — поймано живым прогоном. Возврат из рецепта
 * размонтирует ленту и монтирует заново, то есть порядок считается ЗАНОВО. А к
 * этому моменту открытый рецепт уже попал в список просмотренных — и его
 * карточка уезжала в конец прямо под пальцем у человека. Лента перестраивалась,
 * и скролл вставал в чужое место: в проверке было 900, после возврата 567.
 *
 * Поэтому замораживаем не «снимок просмотренных», а САМ ПОРЯДОК: список
 * slug'ов кладётся в sessionStorage и переживает перемонтирование.
 *
 * Возвращает null, если набор карточек изменился (опубликовали новый рецепт,
 * сняли старый) — тогда вызывающий считает порядок заново. Лучше один
 * перескок при смене каталога, чем карточки-призраки или потерянные.
 */
export function reuseOrder(cards: IdeaCard[], savedSlugs: string[] | null): IdeaCard[] | null {
  if (!savedSlugs || savedSlugs.length !== cards.length) return null;

  const bySlug = new Map(cards.map((c) => [c.slug, c]));
  const out: IdeaCard[] = [];
  for (const slug of savedSlugs) {
    const card = bySlug.get(slug);
    if (!card) return null;
    out.push(card);
  }
  // Длины совпали и все slug'и нашлись — значит наборы идентичны.
  return out;
}

export const SEEN_KEY = "sc_ideas_seen_v1";
export const SEED_KEY = "sc_ideas_seed_v1";
/** Готовый порядок захода: список slug'ов. См. reuseOrder. */
export const ORDER_KEY = "sc_ideas_order_v1";
export const SCROLLED_GOAL_KEY = "sc_ideas_scrolled_v1";

/** После какой карточки считаем, что человек «листал». */
export const SCROLLED_AFTER_CARD = 8;

/**
 * Сколько вкладка должна пробыть в фоне, чтобы возврат считался новым заходом.
 *
 * Пришло на смену правилу «сид живёт 6 часов», которое не работало: в
 * приложении человек не перезагружает документ, он сворачивает и разворачивает
 * его. Для sessionStorage это не «новый заход» вовсе, поэтому лента не
 * обновлялась никогда — что и поймала приёмка.
 */
export const BACKGROUND_RESET_MS = 30 * 60 * 1000;

/** Порог оттяжки, после которого отпускание обновляет ленту. */
export const PULL_THRESHOLD_PX = 70;

/** Новый сид. Отдельной функцией, чтобы тасовку можно было проверить тестом. */
export function newSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

/**
 * Начинать ли НОВЫЙ заход (новый сид и новый порядок) или продолжать прежний.
 *
 * Три входа, и каждый закрывает свой случай:
 *
 * `isFirstMountInDocument` — самый неочевидный. Тип навигации описывает
 * ЗАГРУЗКУ ДОКУМЕНТА и не меняется при мягких переходах: после обычного захода
 * (`navigate`) возврат из рецепта размонтирует и смонтирует ленту заново, а
 * тип так и останется `navigate`. Без этого флага каждый возврат считался бы
 * новым заходом и перемешивал ленту под пальцем — то есть мы бы сломали то,
 * что чинили прошлым PR.
 *
 * `navigationType` — `back_forward` значит «человек вернулся», порядок
 * сохраняем. Всё остальное (`navigate`, `reload`, неизвестное) — новый заход.
 *
 * `hiddenMs` — сколько вкладка пробыла в фоне. Свёрнутое приложение документ не
 * перезагружает, поэтому длинная пауза это единственный признак нового захода.
 */
export function shouldStartNewVisit(input: {
  isFirstMountInDocument: boolean;
  navigationType?: string | null;
  hiddenMs?: number | null;
}): boolean {
  if (typeof input.hiddenMs === "number" && input.hiddenMs >= BACKGROUND_RESET_MS) return true;
  if (!input.isFirstMountInDocument) return false;
  return input.navigationType !== "back_forward";
}
