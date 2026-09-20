import "server-only";
import OpenAI from "openai";
import sharp from "sharp";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { buildDishPrompt, pickDishware } from "@/lib/dishPrompt";

// Серверная генерация картинок блюд. Ключ OpenAI — только на сервере, в клиент
// не течёт. Запуск — исключительно из админ-роутов (app/api/admin/images,
// app/api/admin/ideas/images) и из фоновой генерации кэша блюд. Здесь нет
// проверки прав: за неё отвечает роут.
//
// ТРИ ПОТРЕБИТЕЛЯ, ОДНО ЯДРО:
//   • recipes      — картинка к рецепту из личной истории (этап 1);
//   • dish_cache   — картинка блюда из кэша текстового поиска (этап 2);
//   • idea_recipes — картинка рецепта каталога «Идеи».
// Раньше первые два были двумя почти одинаковыми функциями, и любая правка
// промпта требовала не забыть про вторую. Теперь общее — в renderDishImage и
// uploadDishImage, а обёртки отличаются только таблицей, путём и статусом.

export const STORAGE_BUCKET = "recipe-images";

// ── Модель ───────────────────────────────────────────────────────────────────
//
// ВАЖНО, ПОЧЕМУ ЭТО В ENV. Прошлая модель (gpt-image-1) отключается 23.10.2026,
// а фолбэк на dall-e-3, который тут был, отключён ещё 12.05.2026 — то есть
// «аварийная» ветка была мертва задолго до того, как понадобилась бы. Имя
// модели в переменной окружения означает, что следующее отключение — правка
// настройки, а не деплой.
//
// Фолбэка на другую модель больше НЕТ намеренно: он создавал ложное чувство
// надёжности. Сбой генерации виден в статусе (failed) и в error_reports.
export const IMAGE_MODEL = (process.env.OPENAI_IMAGE_MODEL || "gpt-image-2").trim();

// Качество: low | medium | high. Каталог «Идеи» принимают глазами по сетке
// картинок, на low это видно, поэтому по умолчанию medium.
export const IMAGE_QUALITY = (process.env.OPENAI_IMAGE_QUALITY || "medium").trim();

// Цены за миллион токенов (image output / text input). Из них считается
// фактическая стоимость КАЖДОЙ генерации по usage, который возвращает API, —
// не по оценке «примерно два цента», которая устаревает вместе с прайсом.
const USD_PER_M_IMAGE_OUTPUT = Number(process.env.OPENAI_IMAGE_OUTPUT_USD_PER_M || "30");
const USD_PER_M_TEXT_INPUT = Number(process.env.OPENAI_IMAGE_INPUT_USD_PER_M || "5");

// Запасная оценка стоимости одной картинки — для предупреждения «примерно
// столько будет стоить прогон» ДО запуска, когда фактических usage ещё нет.
//
// Замеры на gpt-image-2 / medium: вертикаль 1024x1536 — $0.042, квадрат
// 1024x1024 — $0.054. Берём БОЛЬШЕЕ: оценка расходов, которая занижает, —
// это не оценка, а сюрприз в счёте.
export const COST_PER_IMAGE_USD = Number(process.env.IMAGE_COST_ESTIMATE_USD || "0.054");

// Глобальный суточный лимит генераций («стоп-кран» расходов). Меняется через
// env; default 100. Резервирование слота — атомарно в БД
// (reserve_image_generation), см. supabase_dish_cache.sql.
export const IMAGE_DAILY_LIMIT = (() => {
  const raw = Number((process.env.IMAGE_DAILY_LIMIT || "").trim());
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 100;
})();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Размеры ──────────────────────────────────────────────────────────────────
//
// Квадрат и вертикаль. Вертикаль нужна ленте «Идей»: сетка в две колонки
// разной высоты собирается из РАЗНЫХ пропорций, а не из кропа — одна и та же
// картинка без обрезки показывается и в карточке, и на экране рецепта.
// Подтверждено пробным вызовом: gpt-image-2 принимает оба размера.
export type ImageAspect = "square" | "portrait";

// Тип размера — литералами, а не string: иначе SDK не может выбрать перегрузку
// images.generate и считает, что ответ может оказаться стримом.
type ApiSize = "1024x1024" | "1024x1536";

const ASPECT_SIZES: Record<ImageAspect, { api: ApiSize; width: number; height: number }> = {
  square: { api: "1024x1024", width: 1024, height: 1024 },
  portrait: { api: "1024x1536", width: 1024, height: 1536 },
};

export function normalizeAspect(value: unknown): ImageAspect {
  return value === "portrait" ? "portrait" : "square";
}

// Санитизация названия блюда перед подстановкой в промт: убираем управляющие
// символы, схлопываем пробелы, режем длину. Название приходит из БД (могло быть
// сгенерировано ИИ или введено), в промт пускаем только «чистый» короткий текст.
function sanitizeTitle(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

// 3–5 ключевых ингредиентов для промта: берём названия, чистим и ограничиваем.
function keyIngredients(recipe: {
  detailed_ingredients?: { name?: string }[] | null;
  ingredients?: string[] | { name?: string }[] | null;
}): string[] {
  const fromDetailed = (recipe.detailed_ingredients || [])
    .map((i) => (typeof i?.name === "string" ? i.name : ""))
    .filter(Boolean);
  const plain = (recipe.ingredients || []).map((i) =>
    typeof i === "string" ? i : typeof i?.name === "string" ? i.name : "",
  );
  const source = fromDetailed.length ? fromDetailed : plain;
  return source
    .map((i) => sanitizeTitle(i).slice(0, 40))
    .filter(Boolean)
    .slice(0, 5);
}

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
} | null | undefined;

/** Фактическая стоимость генерации по usage из ответа API. */
export function usageCostUsd(usage: Usage): number {
  const out = Number(usage?.output_tokens ?? 0);
  const inp = Number(usage?.input_tokens ?? 0);
  const cost =
    (out * USD_PER_M_IMAGE_OUTPUT) / 1_000_000 + (inp * USD_PER_M_TEXT_INPUT) / 1_000_000;
  return Number.isFinite(cost) ? cost : 0;
}

async function generateImageBase64(
  prompt: string,
  aspect: ImageAspect,
): Promise<{ b64: string; costUsd: number }> {
  const res = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt,
    size: ASPECT_SIZES[aspect].api,
    // Качество приходит из env строкой; SDK ждёт литерал. Значение проверяется
    // самим API — неизвестное качество вернёт внятную ошибку, а не тихий сбой.
    quality: IMAGE_QUALITY as "low" | "medium" | "high",
    n: 1,
  });

  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error(`${IMAGE_MODEL} returned no image data`);
  return { b64, costUsd: usageCostUsd(res.usage as Usage) };
}

/**
 * Конвертация в webp. Размер берём ИЗ АСПЕКТА, а не фиксируем квадратом:
 * раньше здесь стояло resize(1024, 1024, { fit: "cover" }), и вертикальная
 * картинка молча обрезалась в квадрат — то есть весь смысл image_aspect
 * пропадал бы по дороге.
 *
 * Качество подбираем вниз, пока файл не влезет в потолок: вертикаль тяжелее
 * квадрата, потолок для неё соответственно выше.
 */
async function toWebp(pngBuffer: Buffer, aspect: ImageAspect): Promise<Buffer> {
  const { width, height } = ASPECT_SIZES[aspect];
  const maxBytes = (aspect === "portrait" ? 300 : 200) * 1024;
  const base = sharp(pngBuffer).resize(width, height, { fit: "cover" });
  let quality = 72;
  let out = await base.clone().webp({ quality }).toBuffer();
  while (out.byteLength > maxBytes && quality > 45) {
    quality -= 10;
    out = await base.clone().webp({ quality }).toBuffer();
  }
  return out;
}

/**
 * Общее ядро: промт → генерация → webp. Ничего не знает про таблицы.
 *
 * Посуду выводим из названия, тегов и способа приготовления (lib/dishPrompt.ts):
 * суп в глубокой тарелке, каша в миске, запечённое — в форме. Новых полей в
 * БД для этого не заводили: тип посуды — следствие того, что уже написано в
 * рецепте, а не отдельное решение, которое кто-то будет принимать руками для
 * каждого из восьмидесяти блюд.
 */
async function renderDishImage(
  title: string,
  ingredients: string[],
  aspect: ImageAspect,
  hints: { tags?: string[] | null; cookMethod?: string | null } = {},
): Promise<{ webp: Buffer; costUsd: number }> {
  const prompt = buildDishPrompt({
    title,
    ingredients,
    aspect,
    dishware: pickDishware({ title, tags: hints.tags, cookMethod: hints.cookMethod }),
  });
  const { b64, costUsd } = await generateImageBase64(prompt, aspect);
  const webp = await toWebp(Buffer.from(b64, "base64"), aspect);
  return { webp, costUsd };
}

/** Общее ядро: загрузка в бакет и публичная ссылка. */
async function uploadDishImage(
  supabase: ReturnType<typeof createServiceRoleClient>,
  path: string,
  webp: Buffer,
  opts: { cacheBuster?: boolean } = {},
): Promise<string> {
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, webp, { contentType: "image/webp", upsert: true });
  if (error) throw new Error(`storage upload: ${error.message}`);

  const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  // Кэш-бастер нужен ТОЛЬКО там, где файл перезаписывается по тому же пути
  // (recipes, dish_cache): CDN иначе отдаёт старую картинку. У «Идей» путь
  // каждый раз новый, и параметр там лишний.
  return opts.cacheBuster ? `${pub.publicUrl}?v=${Date.now()}` : pub.publicUrl;
}

async function logImageWarning(message: string): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase.from("error_reports").insert({
      message: message.slice(0, 2000),
      url: "/admin (images)",
      status: "new",
    });
  } catch {
    // логирование не должно ронять вызывающий код
  }
}

/** Резервирование слота суточного лимита. false — лимит исчерпан. */
async function reserveDailySlot(
  supabase: ReturnType<typeof createServiceRoleClient>,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("reserve_image_generation", {
    p_limit: IMAGE_DAILY_LIMIT,
  });
  if (error) throw new Error(`reserve slot: ${error.message}`);
  return data === true;
}

// ── 1. Картинка к рецепту из истории (recipes) ───────────────────────────────

type RecipeRow = {
  id: number;
  title: string;
  image_url: string | null;
  detailed_ingredients?: { name?: string }[] | null;
  ingredients?: string[] | null;
};

export type GenerateResult =
  | { ok: true; id: number; image_url: string; skipped?: boolean; costUsd?: number }
  | { ok: false; id: number; error: string };

// Идемпотентна: если у рецепта уже есть image_url и не задан force — ничего не
// делаем. Ошибка → лог в error_reports, но НЕ бросаем (батч в админке должен
// продолжаться на следующем рецепте).
export async function generateRecipeImage(
  recipeId: number,
  opts: { force?: boolean } = {},
): Promise<GenerateResult> {
  const supabase = createServiceRoleClient();
  try {
    const { data, error } = await supabase
      .from("recipes")
      .select("id, title, image_url, detailed_ingredients, ingredients")
      .eq("id", recipeId)
      .single<RecipeRow>();

    if (error || !data) throw new Error(error?.message || "recipe not found");

    if (data.image_url && !opts.force) {
      return { ok: true, id: recipeId, image_url: data.image_url, skipped: true };
    }

    const title = sanitizeTitle(data.title);
    if (!title) throw new Error("empty recipe title");

    const { webp, costUsd } = await renderDishImage(title, keyIngredients(data), "square");
    const publicUrl = await uploadDishImage(supabase, `${recipeId}.webp`, webp, {
      cacheBuster: true,
    });

    const { error: updateError } = await supabase
      .from("recipes")
      .update({ image_url: publicUrl })
      .eq("id", recipeId);
    if (updateError) throw new Error(`db update: ${updateError.message}`);

    return { ok: true, id: recipeId, image_url: publicUrl, costUsd };
  } catch (err: any) {
    await logImageWarning(
      `[image_generation_error] recipe #${recipeId}: ${String(err?.message || err)}`,
    );
    return { ok: false, id: recipeId, error: String(err?.message || err) };
  }
}

// ── 2. Картинка блюда из кэша (dish_cache) ───────────────────────────────────
//
// Одна картинка на dish_cache (все варианты рецепта делят её). Отличия от
// рецептной: перед генерацией резервируем слот суточного лимита (вызов
// фоновый, из пользовательского сценария), статус пишем в image_status.

type DishCacheImageResult =
  | { ok: true; image_url: string; status: "ready" }
  | { ok: false; status: "failed" | "none"; error?: string };

export async function generateDishCacheImage(
  dishCacheId: number,
  opts: { force?: boolean } = {},
): Promise<DishCacheImageResult> {
  const supabase = createServiceRoleClient();
  try {
    const { data: cache, error: cacheError } = await supabase
      .from("dish_cache")
      .select("id, display_title, image_url, image_status")
      .eq("id", dishCacheId)
      .single<{
        id: number;
        display_title: string | null;
        image_url: string | null;
        image_status: string;
      }>();

    if (cacheError || !cache) throw new Error(cacheError?.message || "dish_cache not found");

    // Уже готова — ничего не делаем (идемпотентность фоновых вызовов). При force
    // (перегенерация из админ-галереи) проходим дальше и заменяем картинку.
    if (!opts.force && cache.image_url && cache.image_status === "ready") {
      return { ok: true, image_url: cache.image_url, status: "ready" };
    }

    // Стоп-кран расходов: не резервируется — отдаём рецепт без картинки.
    if (!(await reserveDailySlot(supabase))) {
      await supabase.from("dish_cache").update({ image_status: "none" }).eq("id", dishCacheId);
      await logImageWarning(
        `[image_daily_limit] dish_cache #${dishCacheId} ("${cache.display_title || ""}"): ` +
          `суточный лимит IMAGE_DAILY_LIMIT=${IMAGE_DAILY_LIMIT} исчерпан, рецепт отдан без картинки`,
      );
      return { ok: false, status: "none", error: "daily limit reached" };
    }

    const title = sanitizeTitle(cache.display_title);
    if (!title) throw new Error("empty dish title");

    // Ключевые ингредиенты берём из варианта 1 (если есть) — для точности промта.
    const { data: variant } = await supabase
      .from("dish_cache_recipes")
      .select("detailed_ingredients, ingredients")
      .eq("dish_cache_id", dishCacheId)
      .order("variant_index", { ascending: true })
      .limit(1)
      .maybeSingle<{
        detailed_ingredients?: { name?: string }[] | null;
        ingredients?: string[] | null;
      }>();

    const { webp } = await renderDishImage(title, keyIngredients(variant || {}), "square");
    const publicUrl = await uploadDishImage(supabase, `dish-cache/${dishCacheId}.webp`, webp, {
      cacheBuster: true,
    });

    const { error: updateError } = await supabase
      .from("dish_cache")
      .update({ image_url: publicUrl, image_status: "ready" })
      .eq("id", dishCacheId);
    if (updateError) throw new Error(`db update: ${updateError.message}`);

    return { ok: true, image_url: publicUrl, status: "ready" };
  } catch (err: any) {
    // Помечаем провал, чтобы клиент перестал поллить и не висел на плейсхолдере.
    try {
      await supabase.from("dish_cache").update({ image_status: "failed" }).eq("id", dishCacheId);
    } catch {
      // игнор
    }
    await logImageWarning(
      `[dish_image_generation_error] dish_cache #${dishCacheId}: ${String(err?.message || err)}`,
    );
    return { ok: false, status: "failed", error: String(err?.message || err) };
  }
}

// ── 3. Картинка рецепта каталога «Идеи» (idea_recipes) ───────────────────────

export type IdeaImageResult =
  | { ok: true; image_url: string; costUsd: number }
  | { ok: false; error: string; limited?: boolean };

/**
 * Путь в бакете: ideas/<slug>-<версия>.webp.
 *
 * Версия — метка времени генерации, и это НЕ косметика: прямой DELETE из
 * storage.objects у нас запрещён (42501), поэтому перегенерация не может
 * заменить файл «на месте» без риска, что CDN отдаст старый. Новый путь
 * решает и это, и вопрос кэша — параметр ?v= становится не нужен.
 *
 * Старые файлы остаются лежать. При восьмидесяти рецептах и паре переделок
 * это единицы мегабайт — осознанная плата за то, что мы ничего не удаляем.
 */
function ideaImagePath(slug: string, now: number = Date.now()): string {
  const safeSlug = (slug || "idea").replace(/[^a-z0-9-]/g, "").slice(0, 60) || "idea";
  return `ideas/${safeSlug}-${now}.webp`;
}

export async function generateIdeaImage(
  ideaId: string,
  opts: { force?: boolean } = {},
): Promise<IdeaImageResult> {
  const supabase = createServiceRoleClient();
  try {
    const { data: idea, error } = await supabase
      .from("idea_recipes")
      .select("id, slug, title, ingredients, tags, cook_method, image_url, image_status, image_aspect")
      .eq("id", ideaId)
      .single<{
        id: string;
        slug: string;
        title: string;
        ingredients: { name?: string }[] | null;
        tags: string[] | null;
        cook_method: string | null;
        image_url: string | null;
        image_status: string;
        image_aspect: string;
      }>();

    if (error || !idea) throw new Error(error?.message || "idea recipe not found");

    if (!opts.force && idea.image_url && idea.image_status === "ready") {
      return { ok: true, image_url: idea.image_url, costUsd: 0 };
    }

    // Стоп-кран расходов — тот же счётчик, что у кэша блюд: суточный лимит
    // один на весь проект, иначе батч каталога мог бы выесть дневной бюджет
    // пользовательских генераций.
    if (!(await reserveDailySlot(supabase))) {
      await logImageWarning(
        `[image_daily_limit] idea_recipes ${ideaId}: суточный лимит ` +
          `IMAGE_DAILY_LIMIT=${IMAGE_DAILY_LIMIT} исчерпан`,
      );
      return { ok: false, error: "Суточный лимит генераций исчерпан", limited: true };
    }

    // Статус ставим ДО вызова модели: по нему админка показывает «рисуется»,
    // а зависший (если функцию убьют по таймауту) через пять минут читается
    // как failed — см. effectiveImageStatus в lib/ideaRecipes.ts.
    await supabase.from("idea_recipes").update({ image_status: "generating" }).eq("id", ideaId);

    const title = sanitizeTitle(idea.title);
    if (!title) throw new Error("empty idea title");

    const aspect = normalizeAspect(idea.image_aspect);
    const { webp, costUsd } = await renderDishImage(
      title,
      keyIngredients({ detailed_ingredients: idea.ingredients }),
      aspect,
      { tags: idea.tags, cookMethod: idea.cook_method },
    );
    const publicUrl = await uploadDishImage(supabase, ideaImagePath(idea.slug), webp);

    const { error: updateError } = await supabase
      .from("idea_recipes")
      .update({ image_url: publicUrl, image_status: "ready" })
      .eq("id", ideaId);
    if (updateError) throw new Error(`db update: ${updateError.message}`);

    return { ok: true, image_url: publicUrl, costUsd };
  } catch (err: any) {
    try {
      await supabase.from("idea_recipes").update({ image_status: "failed" }).eq("id", ideaId);
    } catch {
      // игнор
    }
    await logImageWarning(
      `[idea_image_generation_error] idea_recipes ${ideaId}: ${String(err?.message || err)}`,
    );
    return { ok: false, error: String(err?.message || err) };
  }
}
