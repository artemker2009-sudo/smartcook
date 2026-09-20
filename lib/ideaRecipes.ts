// Общие типы, словари и списки колонок каталога «Идеи» (таблица idea_recipes).
//
// ВАЖНО: модуль БЕЗ "use client" и должен таким остаться. Те же грабли, что у
// lib/articles.ts: список колонок, экспортированный из клиентского модуля,
// приезжает в серверный компонент не строкой, а client-reference заглушкой —
// select-параметр ломается, PostgREST отвечает 400, и данные «пропадают».
//
// Словари продублированы в CHECK-констрейнтах миграции
// (supabase_idea_recipes.sql). Это не дублирование ради дублирования: роут
// проверяет, чтобы сказать человеку понятную причину отказа, а база — чтобы
// не пустить мимо роута. Меняя словарь здесь, меняйте и там.

export const IDEA_MEALS = ["завтрак", "обед", "ужин", "перекус"] as const;
export type IdeaMeal = (typeof IDEA_MEALS)[number];

export const IDEA_MAIN_PRODUCTS = ["курица", "мясо", "рыба", "без мяса"] as const;
export type IdeaMainProduct = (typeof IDEA_MAIN_PRODUCTS)[number];

export const IDEA_COOK_METHODS = ["плита", "духовка", "без готовки", "мультиварка"] as const;
export type IdeaCookMethod = (typeof IDEA_COOK_METHODS)[number];

// Закрытый словарь аллергенов. Свободный текст запрещён: фильтр «Подходит мне»
// сопоставляет профиль вкуса человека ИМЕННО с этими значениями, и «молочное»
// вместо «молоко» тихо выключило бы фильтр для всех рецептов с этой опечаткой.
export const IDEA_ALLERGENS = [
  "молоко", "яйца", "глютен", "орехи", "арахис",
  "рыба", "морепродукты", "соя", "кунжут", "мёд",
] as const;
export type IdeaAllergen = (typeof IDEA_ALLERGENS)[number];

export const IDEA_IMAGE_ASPECTS = ["square", "portrait"] as const;
export type IdeaImageAspect = (typeof IDEA_IMAGE_ASPECTS)[number];

export const IDEA_IMAGE_STATUSES = ["none", "generating", "ready", "failed"] as const;
export type IdeaImageStatus = (typeof IDEA_IMAGE_STATUSES)[number];

// Лимиты. Совпадают с констрейнтами таблицы — роут обязан отбивать раньше базы,
// иначе человек увидит не «description: 512 символов, максимум 400», а
// невнятное сообщение PostgREST про нарушение констрейнта.
export const IDEA_LIMITS = {
  slug: 200,
  title: 200,
  description: 400,
  servingsMin: 1,
  servingsMax: 20,
  timeMin: 1,
  timeMax: 1440,
  ingredientsMax: 40,
  ingredientNameMax: 100,
  ingredientAmountMax: 100,
  stepsMax: 40,
  stepMax: 600,
  tagsMax: 12,
  tagMax: 40,
  imageUrlMax: 2000,
  familyMax: 60,
} as const;

// Сколько ждём генерацию картинки, прежде чем считать её сорванной.
// Одна картинка у gpt-image-2 на medium занимает около минуты, поэтому пять —
// это с запасом, но заметно меньше, чем «висит вечно».
export const IDEA_IMAGE_STUCK_MS = 5 * 60 * 1000;

/** Латиница, цифры и дефисы — как у articles.slug и как в CHECK миграции. */
export const IDEA_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type IdeaIngredient = { name: string; amount: string };

/** Рецепт каталога в том виде, в каком его правит и видит админка. */
export type IdeaRecipeAdmin = {
  id: string;
  slug: string;
  /** Семейство блюда: у «Сырников классических» и «Сырников с бананом» оно одно. */
  family: string | null;
  title: string;
  description: string;
  servings: number;
  cooking_time_minutes: number;
  ingredients: IdeaIngredient[];
  steps: string[];
  meals: string[];
  main_product: string;
  cook_method: string | null;
  tags: string[];
  allergens: string[];
  image_url: string | null;
  image_status: string;
  image_aspect: string;
  is_published: boolean;
  published_at: string | null;
  sort_weight: number;
  created_at: string;
  updated_at: string;
};

/**
 * Явный список колонок для админки. Никаких select=* (чек-лист CLAUDE.md):
 * звёздочка приносит в пейлоад всё, что однажды появится в таблице, и об этом
 * узнаёшь уже после утечки.
 *
 * Чувствительных полей в каталоге нет вовсе, но правило одно на все таблицы —
 * исключений «тут же ничего секретного» не делаем.
 */
export const IDEA_ADMIN_COLUMNS = [
  "id",
  "slug",
  "family",
  "title",
  "description",
  "servings",
  "cooking_time_minutes",
  "ingredients",
  "steps",
  "meals",
  "main_product",
  "cook_method",
  "tags",
  "allergens",
  "image_url",
  "image_status",
  "image_aspect",
  "is_published",
  "published_at",
  "sort_weight",
  "created_at",
  "updated_at",
].join(",");

/**
 * Статус картинки с поправкой на зависшую генерацию.
 *
 * Генерация идёт в одном запросе и статус ставится прямо перед вызовом модели.
 * Если функцию убили по таймауту или упал процесс, в базе навсегда остаётся
 * `generating`, и рецепт становится неремонтируемым: кнопки «Сгенерировать»
 * у него уже нет, а «Опубликовать» не пускает гейт по ready.
 *
 * Поэтому старый `generating` читаем как `failed` — и в админке, и на сервере,
 * одной и той же функцией, чтобы кнопка и проверка не разошлись.
 *
 * Время берём из updated_at: отдельной колонки «начало генерации» нет, а
 * заводить её ради этого — лишняя миграция. Плата за это: правка рецепта в
 * момент генерации обновит updated_at и «омолодит» зависший статус. На
 * практике не совпадает (правят и генерят не одновременно), а цена ошибки —
 * лишние пять минут ожидания.
 */
export function effectiveImageStatus(
  status: string | null | undefined,
  updatedAt: string | null | undefined,
  now: number = Date.now(),
): IdeaImageStatus {
  const known = (IDEA_IMAGE_STATUSES as readonly string[]).includes(status ?? "")
    ? (status as IdeaImageStatus)
    : "none";
  if (known !== "generating") return known;

  const started = updatedAt ? Date.parse(updatedAt) : NaN;
  // Дата не разобралась — считаем генерацию живой: лучше подождать лишнего,
  // чем запустить вторую генерацию поверх идущей и заплатить дважды.
  if (!Number.isFinite(started)) return "generating";

  return now - started > IDEA_IMAGE_STUCK_MS ? "failed" : "generating";
}
