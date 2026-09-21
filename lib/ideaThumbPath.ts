// Пути миниатюр «Идей» — БЕЗ sharp.
//
// Отдельно от lib/ideaThumb.ts, потому что эти функции нужны ленте
// (lib/ideasFeed.ts уходит в клиентский бандл), а sharp в браузер тянуть
// нельзя.
//
// Путь: ideas/<slug>-<метка>.webp → ideas/thumb/<slug>-<та же метка>.webp.
// Метка остаётся в конце имени, и файл сам попадает под immutable на год
// (IMMUTABLE_PATH_PATTERN в lib/imageUrl.ts). Подпапка, а не суффикс «-540»:
// суффикс после метки сломал бы шаблон immutable.

import { BUCKET_PATH } from "./imageUrl";

export const THUMB_WIDTH = 540;

/** Высота по пропорциям карточки: квадрат 1:1, вертикаль 2:3. */
export const THUMB_SIZES = {
  square: { width: THUMB_WIDTH, height: 540 },
  portrait: { width: THUMB_WIDTH, height: 810 },
} as const;

const ORIGINAL_RE = /^ideas\/([a-z0-9-]+-\d{13})\.webp$/;

/** Путь миниатюры по пути оригинала. null — путь не наш (не трогаем). */
export function thumbPathFor(originalPath: string | null | undefined): string | null {
  if (!originalPath) return null;
  const match = ORIGINAL_RE.exec(originalPath);
  return match ? `ideas/thumb/${match[1]}.webp` : null;
}

/** Путь внутри бакета из публичного адреса Supabase. null — адрес чужой. */
export function bucketPathFromUrl(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null;
  try {
    const url = new URL(publicUrl);
    if (!url.pathname.startsWith(BUCKET_PATH)) return null;
    return url.pathname.slice(BUCKET_PATH.length);
  } catch {
    return null;
  }
}

/**
 * Миниатюра соответствует ИМЕННО этой картинке?
 *
 * Не формальность. Пока картинки генерирует старый код, он перезаписывает
 * image_url и не трогает thumb_url — и миниатюра остаётся от прежней
 * картинки. Лента показала бы одно блюдо, обложка рецепта — другое.
 * Сверяем метку времени в путях: не совпала — карточка берёт оригинал, а
 * скрипт досоздания считает строку несделанной.
 */
export function thumbMatchesImage(
  imageUrl: string | null | undefined,
  thumbUrl: string | null | undefined,
): boolean {
  const expected = thumbPathFor(bucketPathFromUrl(imageUrl));
  return expected !== null && expected === bucketPathFromUrl(thumbUrl);
}
