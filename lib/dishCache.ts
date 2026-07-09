import "server-only";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { sanitizeRecipeForStorage } from "@/lib/recipeValidation";

// Кэш блюд для текстового поиска типа B (этап 2). Всё чтение/запись — только
// через service_role (RLS запрещает запись anon/authenticated; чтение публично,
// но серверу удобнее один клиент). Любая ошибка кэша НЕ должна ронять генерацию:
// функции чтения возвращают null при сбое, функции записи логируют и глотают.

// ── Фиче-флаг ────────────────────────────────────────────────────────────────
// RECIPE_CACHE (env, default off). off = поведение как раньше, всё новое за
// флагом. Принимаем on|1|true (без регистра).
export function isRecipeCacheEnabled(): boolean {
  const raw = (process.env.RECIPE_CACHE || "").trim().toLowerCase();
  return raw === "on" || raw === "1" || raw === "true";
}

// Профиль вкуса «непустой», если есть хоть одна аллергия или нелюбимое.
// Персональные рецепты в общий кэш не попадают (см. миграцию/CLAUDE-план).
export function hasTasteProfile(allergies?: unknown, dislikes?: unknown): boolean {
  const a = Array.isArray(allergies) && allergies.length > 0;
  const d = Array.isArray(dislikes) && dislikes.length > 0;
  return a || d;
}

// ── Типы ─────────────────────────────────────────────────────────────────────
export interface DishCacheRow {
  id: number;
  query_key: string;
  display_title: string | null;
  image_url: string | null;
  image_status: "none" | "generating" | "ready" | "failed";
}

export interface CachedRecipe {
  title: string;
  description: string;
  time: string;
  cooking_time_minutes: number | null;
  calories: string;
  steps: string[];
  missing_ingredients: string[];
  detailed_ingredients: { name: string; amount: string }[];
  ingredients: string[];
  estimated_cost: number | null;
  delivery_cost: number | null;
  budget_tier: number | null;
  // Метаданные кэша для клиента (картинка + прогресс вариантов).
  image_url: string | null;
  image_status: DishCacheRow["image_status"];
  dish_cache_id: number;
  variant_index: number;
}

function toNumberOrNull(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[^\d.,-]/g, "").replace(",", "."))
        : NaN;
  return Number.isFinite(n) ? n : null;
}

// Санитизированные поля рецепта для записи в dish_cache_recipes.
function recipeToCacheColumns(recipe: any) {
  const sanitized = sanitizeRecipeForStorage(recipe);
  if (!sanitized) return null;
  return {
    ...sanitized,
    estimated_cost: toNumberOrNull(recipe?.estimated_cost),
    delivery_cost: toNumberOrNull(recipe?.delivery_cost),
    budget_tier: toNumberOrNull(recipe?.budget_tier),
  };
}

// Строка варианта из БД + метаданные кэша → объект рецепта для клиента.
function rowToCachedRecipe(cache: DishCacheRow, row: any): CachedRecipe {
  return {
    title: row.title,
    description: row.description || "",
    time: row.time || "",
    cooking_time_minutes: row.cooking_time_minutes ?? null,
    calories: row.calories || "",
    steps: Array.isArray(row.steps) ? row.steps : [],
    missing_ingredients: Array.isArray(row.missing_ingredients) ? row.missing_ingredients : [],
    detailed_ingredients: Array.isArray(row.detailed_ingredients) ? row.detailed_ingredients : [],
    ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
    estimated_cost: row.estimated_cost ?? null,
    delivery_cost: row.delivery_cost ?? null,
    budget_tier: row.budget_tier ?? null,
    image_url: cache.image_url,
    image_status: cache.image_status,
    dish_cache_id: cache.id,
    variant_index: row.variant_index,
  };
}

const CACHE_SELECT = "id, query_key, display_title, image_url, image_status";
const VARIANT_SELECT =
  "variant_index, title, description, time, cooking_time_minutes, calories, steps, " +
  "missing_ingredients, detailed_ingredients, ingredients, estimated_cost, delivery_cost, budget_tier";

// ── Чтение ───────────────────────────────────────────────────────────────────
// Строка кэша по нормализованному ключу (без вариантов). null — нет в кэше или сбой.
export async function getDishCacheByKey(queryKey: string): Promise<DishCacheRow | null> {
  if (!queryKey) return null;
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("dish_cache")
      .select(CACHE_SELECT)
      .eq("query_key", queryKey)
      .maybeSingle<DishCacheRow>();
    if (error) throw error;
    return data ?? null;
  } catch {
    return null;
  }
}

// Конкретный вариант блюда (по ключу) → объект рецепта для клиента, либо null.
export async function getCachedVariant(
  queryKey: string,
  variantIndex: number,
): Promise<CachedRecipe | null> {
  const cache = await getDishCacheByKey(queryKey);
  if (!cache) return null;
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("dish_cache_recipes")
      .select(VARIANT_SELECT)
      .eq("dish_cache_id", cache.id)
      .eq("variant_index", variantIndex)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return rowToCachedRecipe(cache, data);
  } catch {
    return null;
  }
}

// Максимальный variant_index у блюда (0, если вариантов нет).
export async function getMaxVariantIndex(dishCacheId: number): Promise<number> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("dish_cache_recipes")
      .select("variant_index")
      .eq("dish_cache_id", dishCacheId)
      .order("variant_index", { ascending: false })
      .limit(1)
      .maybeSingle<{ variant_index: number }>();
    if (error) throw error;
    return data?.variant_index ?? 0;
  } catch {
    return 0;
  }
}

// ── Запись ───────────────────────────────────────────────────────────────────
// Создаёт запись кэша для блюда (или возвращает существующую при гонке) и
// пишет вариант 1. Возвращает { dishCacheId } или null при сбое.
// imageStatus задаёт начальный статус картинки (обычно 'generating').
export async function createDishCacheEntry(
  queryKey: string,
  displayTitle: string,
  recipe: any,
  imageStatus: DishCacheRow["image_status"] = "generating",
): Promise<{ dishCacheId: number } | null> {
  if (!queryKey) return null;
  const columns = recipeToCacheColumns(recipe);
  if (!columns) return null;
  try {
    const supabase = createServiceRoleClient();

    // upsert по уникальному query_key — при гонке двух первых запросов не падаем.
    const { data: cacheRow, error: cacheError } = await supabase
      .from("dish_cache")
      .upsert(
        { query_key: queryKey, display_title: displayTitle.slice(0, 200), image_status: imageStatus },
        { onConflict: "query_key", ignoreDuplicates: false },
      )
      .select("id")
      .single<{ id: number }>();
    if (cacheError || !cacheRow) throw cacheError || new Error("no dish_cache id");

    // Вариант 1. ignoreDuplicates — если параллельный запрос уже вставил.
    const { error: variantError } = await supabase
      .from("dish_cache_recipes")
      .upsert(
        { dish_cache_id: cacheRow.id, variant_index: 1, ...columns },
        { onConflict: "dish_cache_id,variant_index", ignoreDuplicates: true },
      );
    if (variantError) throw variantError;

    return { dishCacheId: cacheRow.id };
  } catch (err) {
    await logCacheError(`createDishCacheEntry "${queryKey}": ${String((err as any)?.message || err)}`);
    return null;
  }
}

// Добавляет следующий вариант рецепта. Возвращает true при успехе.
export async function addDishCacheVariant(
  dishCacheId: number,
  variantIndex: number,
  recipe: any,
): Promise<boolean> {
  const columns = recipeToCacheColumns(recipe);
  if (!columns) return false;
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("dish_cache_recipes")
      .upsert(
        { dish_cache_id: dishCacheId, variant_index: variantIndex, ...columns },
        { onConflict: "dish_cache_id,variant_index", ignoreDuplicates: true },
      );
    if (error) throw error;
    return true;
  } catch (err) {
    await logCacheError(
      `addDishCacheVariant #${dishCacheId} v${variantIndex}: ${String((err as any)?.message || err)}`,
    );
    return false;
  }
}

async function logCacheError(message: string): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase.from("error_reports").insert({
      message: `[dish_cache] ${message}`.slice(0, 2000),
      url: "/dish-cache",
      status: "new",
    });
  } catch {
    // логирование не должно ронять запрос
  }
}
