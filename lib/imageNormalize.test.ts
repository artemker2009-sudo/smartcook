import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { UnsupportedImageError, normalizeToJpeg } from "./imageNormalize";

const SRC = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">
  <rect width="400" height="200" fill="#fdfbf3"/><text x="20" y="100" font-size="40">молоко</text></svg>`;

async function make(format: "png" | "webp" | "tiff" | "gif" | "jpeg"): Promise<Buffer> {
  return sharp(Buffer.from(SRC)).toFormat(format).toBuffer();
}

describe("normalizeToJpeg", () => {
  it("приводит к JPEG форматы, которые браузер не всегда осиливает", async () => {
    for (const format of ["png", "webp", "tiff", "gif", "jpeg"] as const) {
      const out = await normalizeToJpeg(await make(format));
      const meta = await sharp(out).metadata();
      expect(meta.format, format).toBe("jpeg");
    }
  });

  it("ужимает большой кадр — в модель уходит не оригинал", async () => {
    const big = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: "#eee" },
    })
      .jpeg()
      .toBuffer();
    const meta = await sharp(await normalizeToJpeg(big)).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1800);
  });

  it("применяет EXIF-поворот: снятое боком приходит ровным", async () => {
    // orientation 6 = повернуть на 90°: 400x200 должно стать 200x400.
    const sideways = await sharp(Buffer.from(SRC)).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const meta = await sharp(await normalizeToJpeg(sideways)).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(400);
  });

  it("срезает метаданные (EXIF/гео не уезжают в модель)", async () => {
    const withExif = await sharp(Buffer.from(SRC))
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: "тест" } } })
      .toBuffer();
    const meta = await sharp(await normalizeToJpeg(withExif)).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("не изображение → UnsupportedImageError, а не падение", async () => {
    await expect(normalizeToJpeg(Buffer.from("это просто текст, а не фото"))).rejects.toBeInstanceOf(
      UnsupportedImageError,
    );
    await expect(normalizeToJpeg(Buffer.alloc(0))).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  it("SVG отклоняем осознанно: это разметка, а не снимок", async () => {
    await expect(normalizeToJpeg(Buffer.from(SRC))).rejects.toBeInstanceOf(UnsupportedImageError);
  });
});
