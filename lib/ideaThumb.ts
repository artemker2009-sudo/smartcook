// Миниатюры картинок «Идей» для ленты.
//
// ЗАЧЕМ. Карточка ленты шириной ~180 css px, а грузилась картинка 1024 px
// (в среднем 121 КБ). Vercel /img/ не кэширует (Set-Cookie от Cloudflare
// перед Supabase), так что каждый байт идёт в лимит трафика. Миниатюра
// 540 px — это 180 css px × 3 на iPhone в две колонки.
//
// ГДЕ ЧТО. Лента и блоки «Другие варианты» / «Похожие идеи» — ТОЛЬКО
// миниатюра. Обложка рецепта, og:image, JSON-LD — ТОЛЬКО оригинал. Одна и та
// же картинка в двух размерах на одном экране не грузится никогда, поэтому
// число запросов не удваивается.
//
// ПУТИ — в lib/ideaThumbPath.ts (без sharp, его импортирует и лента).
//
// Модуль без "use client" и без server-only: его используют генерация
// (lib/recipeImage.ts), скрипт досоздания (scripts/backfill-idea-thumbs.ts)
// и тесты.

import sharp from "sharp";
import { THUMB_SIZES } from "./ideaThumbPath";

export { THUMB_SIZES, THUMB_WIDTH, bucketPathFromUrl, thumbPathFor } from "./ideaThumbPath";

/**
 * Качество подобрано на 23 реальных картинках каталога (21.09.2026):
 * q75 — в среднем 42 КБ (квадрат 37, вертикаль 48, максимум 63), внутри
 * целевого коридора 40–50 КБ. q80 — уже 53 КБ, q70 — 40 КБ, на нижней
 * границе коридора.
 */
export const THUMB_QUALITY = 75;
/** Страховка для особо детальных кадров: тяжелее — снижаем качество… */
export const THUMB_MAX_BYTES = 80 * 1024;
/** …но не ниже этого. */
export const THUMB_MIN_QUALITY = 55;

export type ThumbResult = { buffer: Buffer; quality: number; width: number; height: number };

/**
 * Миниатюра из картинки любого размера. cover — пропорции те же, что у
 * оригинала, поэтому обрезки на деле нет; cover лишь гарантирует точный
 * размер, если оригинал вдруг на пиксель отличается.
 */
export async function makeThumb(
  input: Buffer,
  aspect: "square" | "portrait",
): Promise<ThumbResult> {
  const { width, height } = THUMB_SIZES[aspect];
  const base = sharp(input).resize(width, height, { fit: "cover" });
  let quality = THUMB_QUALITY;
  let buffer = await base.clone().webp({ quality }).toBuffer();
  while (buffer.byteLength > THUMB_MAX_BYTES && quality > THUMB_MIN_QUALITY) {
    quality -= 5;
    buffer = await base.clone().webp({ quality }).toBuffer();
  }
  return { buffer, quality, width, height };
}
