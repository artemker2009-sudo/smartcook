import sharp from "sharp";
import heicConvert from "heic-convert";

// Приведение ЛЮБОГО присланного фото к JPEG для vision-модели.
//
// Зачем: OpenAI принимает только jpeg/png/webp/gif, а телефон и «Файлы» отдают
// что угодно — HEIC/HEIF с айфона, WebP из мессенджера, AVIF, TIFF со сканера,
// BMP. Браузер часть этого декодировать не умеет (canvas не знает TIFF и HEIC),
// поэтому клиентская подготовка может не справиться — последнее слово за
// сервером, где есть sharp и libheif.
//
// Побочные полезные эффекты:
//  - .rotate() применяет EXIF-ориентацию: снятое боком фото приходит к модели
//    ровным, а это прямо влияет на распознавание текста;
//  - sharp пересобирает файл и НЕ переносит метаданные — EXIF/гео отрезаются;
//  - ресайз до NORMALIZED_MAX_SIDE уменьшает то, что уходит в модель (в vision
//    цена считается по тайлам) — расход меньше, чем при отправке оригинала.

// Больше этого стороне не нужно: мелкий рукописный текст читается и так, а
// каждый лишний пиксель — деньги за тайлы.
const NORMALIZED_MAX_SIDE = 1800;
const JPEG_QUALITY = 85;

// Формат, который мы осознанно НЕ обрабатываем: это не фото, а разметка, и
// рендер SVG умеет тянуть внешние ссылки. Телефон такого не снимает.
const SVG_SIGNATURE = /^\s*(<\?xml|<svg)/i;

export class UnsupportedImageError extends Error {
  constructor(message = "Не удалось прочитать это фото") {
    super(message);
    this.name = "UnsupportedImageError";
  }
}

function looksLikeSvg(buffer: Buffer): boolean {
  return SVG_SIGNATURE.test(buffer.subarray(0, 256).toString("utf8"));
}

async function toJpeg(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate() // EXIF-ориентация до ресайза
    .resize({
      width: NORMALIZED_MAX_SIDE,
      height: NORMALIZED_MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/**
 * Любой растровый формат → JPEG, готовый к отправке в vision-модель.
 * Бросает UnsupportedImageError, если это не изображение (или SVG).
 */
export async function normalizeToJpeg(input: Buffer): Promise<Buffer> {
  if (input.length === 0) throw new UnsupportedImageError();
  if (looksLikeSvg(input)) throw new UnsupportedImageError();

  try {
    return await toJpeg(input);
  } catch {
    // Вторая попытка — HEIC/HEIF. Сборка sharp может оказаться без libheif (на
    // этой платформе он есть, но гарантий на другой нет), а heic-convert тянет
    // свой декодер и от сборки libvips не зависит.
    try {
      const decoded = await heicConvert({ buffer: input, format: "JPEG", quality: 0.92 });
      return await toJpeg(Buffer.from(decoded));
    } catch {
      throw new UnsupportedImageError();
    }
  }
}
