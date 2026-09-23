// Рецепт каталога «Идеи»: колонки запроса, тип и разбор строки базы.
//
// ЧИСТЫЙ модуль, без "server-only" и без "use client": колонки нужны
// серверной странице, тип — клиентскому экрану, разбор — тестам.

import { thumbMatchesImage } from "./ideaThumbPath";

/**
 * Явный список колонок. Никаких select=*.
 *
 * Чего здесь НЕТ и почему: cook_method и allergens в интерфейс не выводятся
 * (принцип «меньше, но понятнее»), sort_weight и published_at нужны только
 * ленте. Всё, что попадёт в проп клиентского компонента, уезжает в RSC-пейлоад
 * браузера — лишние поля возить незачем (чек-лист CLAUDE.md).
 */
export const IDEA_RECIPE_COLUMNS = [
  "slug",
  "title",
  "description",
  "servings",
  "cooking_time_minutes",
  "ingredients",
  "steps",
  "meals",
  "main_product",
  "tags",
  "family",
  "image_url",
  "thumb_url",
  "image_aspect",
].join(",");

export type IdeaIngredient = { name: string; amount: string };

export type IdeaRecipeData = {
  slug: string;
  title: string;
  description: string;
  /** На сколько порций написаны количества в ingredients. */
  servings: number;
  cookingTimeMinutes: number;
  ingredients: IdeaIngredient[];
  steps: string[];
  meals: string[];
  mainProduct: string;
  tags: string[];
  family: string | null;
  imageUrl: string;
  /**
   * Миниатюра 540 px (lib/ideaThumb.ts). Сам экран рецепта её НЕ показывает —
   * обложка и og берут только imageUrl. Нужна плашке «Вы собирались
   * приготовить» на Главной: она запоминается вместе с намерением, и на
   * Главной для картинки 60 px тянуть оригинал 1024 было бы расточительно.
   * null — миниатюра ещё не досоздана.
   */
  thumbUrl: string | null;
  imageAspect: "square" | "portrait";
};

type RawRecipeRow = {
  slug?: unknown;
  title?: unknown;
  description?: unknown;
  servings?: unknown;
  cooking_time_minutes?: unknown;
  ingredients?: unknown;
  steps?: unknown;
  meals?: unknown;
  main_product?: unknown;
  tags?: unknown;
  family?: unknown;
  image_url?: unknown;
  thumb_url?: unknown;
  image_aspect?: unknown;
};

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
}

/**
 * Строка базы → рецепт экрана. null означает «показывать нечего» → 404.
 *
 * Гейт публикации не пускает рецепт без картинки, без шагов и без продуктов,
 * но экран не должен падать, если строка всё же придёт битой.
 */
export function toIdeaRecipe(row: RawRecipeRow | null | undefined): IdeaRecipeData | null {
  if (!row || typeof row !== "object") return null;
  const slug = typeof row.slug === "string" ? row.slug : "";
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const imageUrl = typeof row.image_url === "string" ? row.image_url : "";
  if (!slug || !title || !imageUrl) return null;

  const ingredients = Array.isArray(row.ingredients)
    ? row.ingredients
        .map((item) => {
          const obj = (item || {}) as { name?: unknown; amount?: unknown };
          return {
            name: typeof obj.name === "string" ? obj.name.trim() : "",
            amount: typeof obj.amount === "string" ? obj.amount.trim() : "",
          };
        })
        .filter((ing) => ing.name.length > 0)
    : [];

  const steps = strings(row.steps);
  if (ingredients.length === 0 || steps.length === 0) return null;

  const servingsRaw = typeof row.servings === "number" ? row.servings : 1;
  const timeRaw = typeof row.cooking_time_minutes === "number" ? row.cooking_time_minutes : 0;

  return {
    slug,
    title,
    description: typeof row.description === "string" ? row.description.trim() : "",
    // Ноль или мусор в базе сделал бы множитель бесконечным — страхуемся здесь,
    // а не в каждом месте пересчёта.
    servings: servingsRaw > 0 ? Math.round(servingsRaw) : 1,
    cookingTimeMinutes: timeRaw > 0 ? Math.round(timeRaw) : 0,
    ingredients,
    steps,
    meals: strings(row.meals),
    mainProduct: typeof row.main_product === "string" ? row.main_product : "",
    tags: strings(row.tags),
    family: typeof row.family === "string" && row.family ? row.family : null,
    imageUrl,
    // Миниатюра только если она от ЭТОЙ картинки: старый код генерации
    // перезаписывал image_url, не трогая thumb_url, — см. thumbMatchesImage.
    thumbUrl:
      typeof row.thumb_url === "string" && thumbMatchesImage(imageUrl, row.thumb_url)
        ? row.thumb_url
        : null,
    imageAspect: row.image_aspect === "portrait" ? "portrait" : "square",
  };
}

/** Slug из адреса годен к запросу? Формат тот же, что в CHECK миграции. */
export function isValidIdeaSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 200;
}
