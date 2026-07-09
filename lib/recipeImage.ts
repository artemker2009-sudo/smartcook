import "server-only";
import OpenAI from "openai";
import sharp from "sharp";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

// Серверная генерация картинки блюда (этап 1). Ключ OpenAI — только на сервере,
// в клиент не течёт. Запуск — исключительно из админ-роутов (см.
// app/api/admin/images). Здесь нет проверки прав: за неё отвечает роут.

export const STORAGE_BUCKET = "recipe-images";

// Примерная стоимость одной генерации (gpt-image-1, low, 1024×1024) в USD.
// Для оценки бюджета в админке — «примерная стоимость запуска». Число намеренно
// с запасом; точная цена зависит от модели/тарифа.
export const COST_PER_IMAGE_USD = 0.02;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  ingredients?: string[] | null;
}): string[] {
  const fromDetailed = (recipe.detailed_ingredients || [])
    .map((i) => (typeof i?.name === "string" ? i.name : ""))
    .filter(Boolean);
  const source = fromDetailed.length ? fromDetailed : recipe.ingredients || [];
  return source
    .map((i) => sanitizeTitle(i).slice(0, 40))
    .filter(Boolean)
    .slice(0, 5);
}

function buildPrompt(title: string, ingredients: string[]): string {
  const ingLine = ingredients.length ? ` Key ingredients: ${ingredients.join(", ")}.` : "";
  // Английский промт — надёжнее для image-моделей; название блюда как есть.
  return (
    `Appetizing professional food photography of the finished dish "${title}".${ingLine}` +
    " Plated and ready to eat, natural soft lighting, shallow depth of field, close-up 45-degree angle." +
    " Neutral solid background. No text, no captions, no watermark, no people, no hands, no logos, no brand names."
  );
}

async function generateImageBase64(prompt: string): Promise<string> {
  // gpt-image-1: минимально достаточное качество (low) и размер (1024).
  // Всегда возвращает b64_json.
  try {
    const res = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      quality: "low",
      n: 1,
    });
    const b64 = res.data?.[0]?.b64_json;
    if (b64) return b64;
    throw new Error("gpt-image-1 returned no image data");
  } catch (err: any) {
    // Если модель недоступна на ключе — падаем на dall-e-3 (standard, 1024).
    const msg = String(err?.message || err);
    const modelUnavailable =
      /model|not.*(found|available|exist|access)|403|404|permission/i.test(msg);
    if (!modelUnavailable) throw err;
    const res = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      size: "1024x1024",
      quality: "standard",
      response_format: "b64_json",
      n: 1,
    });
    const b64 = res.data?.[0]?.b64_json;
    if (b64) return b64;
    throw new Error("dall-e-3 returned no image data");
  }
}

// Конвертация в webp ~100–200 КБ, чтобы не просадить SSR. Подбираем качество
// вниз, если после первой попытки файл больше 200 КБ.
async function toWebp(pngBuffer: Buffer): Promise<Buffer> {
  const base = sharp(pngBuffer).resize(1024, 1024, { fit: "cover" });
  let quality = 72;
  let out = await base.clone().webp({ quality }).toBuffer();
  while (out.byteLength > 200 * 1024 && quality > 45) {
    quality -= 10;
    out = await base.clone().webp({ quality }).toBuffer();
  }
  return out;
}

type RecipeRow = {
  id: number;
  title: string;
  image_url: string | null;
  detailed_ingredients?: { name?: string }[] | null;
  ingredients?: string[] | null;
};

export type GenerateResult =
  | { ok: true; id: number; image_url: string; skipped?: boolean }
  | { ok: false; id: number; error: string };

// Основная функция. Идемпотентна: если у рецепта уже есть image_url и не задан
// force — ничего не делаем. Ошибка → лог в error_reports, но НЕ бросаем
// (батч в админке должен продолжаться на следующем рецепте).
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

    const prompt = buildPrompt(title, keyIngredients(data));
    const b64 = await generateImageBase64(prompt);
    const webp = await toWebp(Buffer.from(b64, "base64"));

    const path = `${recipeId}.webp`;
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, webp, { contentType: "image/webp", upsert: true });
    if (uploadError) throw new Error(`storage upload: ${uploadError.message}`);

    const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    // Кэш-бастер: при перегенерации файл по тому же пути заменяется, но CDN
    // отдаёт старый до истечения кэша. ?v=<ts> делает URL уникальным.
    const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("recipes")
      .update({ image_url: publicUrl })
      .eq("id", recipeId);
    if (updateError) throw new Error(`db update: ${updateError.message}`);

    return { ok: true, id: recipeId, image_url: publicUrl };
  } catch (err: any) {
    const message = `[image_generation_error] recipe #${recipeId}: ${String(
      err?.message || err,
    )}`.slice(0, 2000);
    // Пишем сервисным ключом (в обход RLS) — это серверный контекст админки.
    try {
      await supabase.from("error_reports").insert({
        message,
        url: "/admin (images)",
        status: "new",
      });
    } catch {
      // не даём сбою логирования уронить батч
    }
    return { ok: false, id: recipeId, error: String(err?.message || err) };
  }
}
