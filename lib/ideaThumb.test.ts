import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import sharp from "sharp";
import { THUMB_MAX_BYTES, THUMB_QUALITY, makeThumb } from "./ideaThumb";
import { bucketPathFromUrl, thumbMatchesImage, thumbPathFor } from "./ideaThumbPath";
import { IMG_PATH_PATTERN, IMMUTABLE_PATH_PATTERN } from "./imageUrl";

const SB = "https://yjfqwwiqwoighjdlkodg.supabase.co/storage/v1/object/public/recipe-images";
const ORIGINAL = "ideas/tefteli-v-tomatnom-souse-1789918526569.webp";
const THUMB = "ideas/thumb/tefteli-v-tomatnom-souse-1789918526569.webp";

describe("путь миниатюры", () => {
  it("та же метка, подпапка thumb", () => {
    expect(thumbPathFor(ORIGINAL)).toBe(THUMB);
  });

  it("чужие пути не трогаем", () => {
    for (const bad of ["dish-cache/2.webp", "1543.webp", "ideas/thumb/x-1789918526569.webp", "ideas/x.webp", "ideas/../x-1789918526569.webp", null, ""]) {
      expect(thumbPathFor(bad)).toBeNull();
    }
  });

  it("путь внутри бакета из публичного адреса", () => {
    expect(bucketPathFromUrl(`${SB}/${ORIGINAL}`)).toBe(ORIGINAL);
    expect(bucketPathFromUrl("https://example.test/x.webp")).toBeNull();
  });

  // Миниатюра обязана пройти ТЕ ЖЕ шаблоны, что и оригинал: иначе /img/ её не
  // отдаст или отдаст без immutable. Проверяем движком Next, как в imageUrl.test.
  it("миниатюра проходит rewrite /img/ и получает immutable", () => {
    const require = createRequire(import.meta.url);
    const { match } = require("next/dist/compiled/path-to-regexp") as {
      match: (p: string) => (path: string) => unknown;
    };
    expect(match(`/img/:path(${IMG_PATH_PATTERN})`)(`/img/${THUMB}`)).not.toBe(false);
    expect(match(`/img/:path(${IMMUTABLE_PATH_PATTERN})`)(`/img/${THUMB}`)).not.toBe(false);
  });
});

describe("миниатюра от ЭТОЙ картинки", () => {
  it("совпадающая метка — да", () => {
    expect(thumbMatchesImage(`${SB}/${ORIGINAL}`, `${SB}/${THUMB}`)).toBe(true);
  });

  // Старый код перегенерировал картинку и не тронул thumb_url: миниатюра
  // осталась от прежней. Лента не должна показать чужое блюдо.
  it("миниатюра от прежней картинки — нет", () => {
    const regenerated = `${SB}/ideas/tefteli-v-tomatnom-souse-1790000000000.webp`;
    expect(thumbMatchesImage(regenerated, `${SB}/${THUMB}`)).toBe(false);
  });

  it("нет миниатюры или нет картинки — нет", () => {
    expect(thumbMatchesImage(`${SB}/${ORIGINAL}`, null)).toBe(false);
    expect(thumbMatchesImage(null, `${SB}/${THUMB}`)).toBe(false);
  });
});

describe("пережатие", () => {
  // Шум в пикселях — худший для сжатия кадр: проверяет и размер, и потолок.
  async function noise(width: number, height: number): Promise<Buffer> {
    const raw = Buffer.alloc(width * height * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
    return sharp(raw, { raw: { width, height, channels: 3 } }).webp({ quality: 90 }).toBuffer();
  }

  it("квадрат 1024 → 540×540 WebP", async () => {
    const thumb = await makeThumb(await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#c84" } }).png().toBuffer(), "square");
    const meta = await sharp(thumb.buffer).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 540, 540]);
    expect(thumb.quality).toBe(THUMB_QUALITY);
  });

  it("вертикаль 1024×1536 → 540×810", async () => {
    const thumb = await makeThumb(await sharp({ create: { width: 1024, height: 1536, channels: 3, background: "#4a8" } }).png().toBuffer(), "portrait");
    const meta = await sharp(thumb.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([540, 810]);
  });

  it("тяжёлый кадр: качество снижается, пока не влезет в потолок (или до минимума)", async () => {
    const thumb = await makeThumb(await noise(1024, 1536), "portrait");
    expect(thumb.buffer.byteLength <= THUMB_MAX_BYTES || thumb.quality === 55).toBe(true);
    expect(thumb.quality).toBeLessThan(THUMB_QUALITY);
  });
});
