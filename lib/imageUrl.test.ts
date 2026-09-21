import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  IMG_PATH_PATTERN,
  IMMUTABLE_PATH_PATTERN,
  absoluteImageUrl,
  displayImageUrl,
  ownImagePath,
} from "./imageUrl";

const SB = "https://yjfqwwiqwoighjdlkodg.supabase.co/storage/v1/object/public";

describe("адреса бакета recipe-images переводятся на наш домен", () => {
  it("картинка «Идей» — путь с меткой времени в имени", () => {
    expect(ownImagePath(`${SB}/recipe-images/ideas/tefteli-v-tomatnom-souse-1789918526569.webp`)).toBe(
      "/img/ideas/tefteli-v-tomatnom-souse-1789918526569.webp",
    );
  });

  it("перезаписываемый файл сохраняет версию ?v= — иначе кэш покажет старую картинку", () => {
    expect(ownImagePath(`${SB}/recipe-images/dish-cache/2.webp?v=1789381953855`)).toBe(
      "/img/dish-cache/2.webp?v=1789381953855",
    );
    expect(ownImagePath(`${SB}/recipe-images/1543.webp?v=1783599794690`)).toBe(
      "/img/1543.webp?v=1783599794690",
    );
  });

  it("из query переносится только v, и только цифрами", () => {
    expect(ownImagePath(`${SB}/recipe-images/1543.webp?v=1&download=evil.html`)).toBe("/img/1543.webp?v=1");
    expect(ownImagePath(`${SB}/recipe-images/1543.webp?v=abc`)).toBe("/img/1543.webp");
  });
});

describe("всё остальное остаётся как было — никакого открытого прокси", () => {
  const untouched = [
    // витрина: другой бакет, фото пользователей
    `${SB}/feed_photos/abc.jpg`,
    // чужой проект Supabase
    "https://evil.supabase.co/storage/v1/object/public/recipe-images/1.webp",
    // не https
    "http://yjfqwwiqwoighjdlkodg.supabase.co/storage/v1/object/public/recipe-images/1.webp",
    // выход из бакета через «..» — URL нормализует путь, и префикс бакета теряется
    `${SB}/recipe-images/../feed_photos/x.webp`,
    `${SB}/recipe-images/%2e%2e/feed_photos/x.webp`,
    // не картинка, заглавные, пробелы, кодирование, пустые сегменты
    `${SB}/recipe-images/page.html`,
    `${SB}/recipe-images/Ideas/X.webp`,
    `${SB}/recipe-images/a%20b.webp`,
    `${SB}/recipe-images/a//b.webp`,
    `${SB}/recipe-images/.hidden.webp`,
    // превью до загрузки
    "blob:https://smartcook.pro/123",
    "data:image/png;base64,AAAA",
    "",
  ];
  for (const raw of untouched) {
    it(`не трогает: ${raw.slice(0, 70) || "(пусто)"}`, () => {
      expect(ownImagePath(raw)).toBeNull();
      expect(displayImageUrl(raw)).toBe(raw);
    });
  }

  it("null и undefined дают пустую строку, а не падение", () => {
    expect(displayImageUrl(null)).toBe("");
    expect(displayImageUrl(undefined)).toBe("");
  });
});

describe("og:image и JSON-LD — абсолютный адрес через наш домен", () => {
  it("картинка бакета — через SITE_URL", () => {
    expect(absoluteImageUrl(`${SB}/recipe-images/1543.webp?v=7`, "https://smartcook.pro")).toBe(
      "https://smartcook.pro/img/1543.webp?v=7",
    );
  });

  it("лишний слэш в origin не удваивается", () => {
    expect(absoluteImageUrl(`${SB}/recipe-images/1.webp`, "https://smartcook.pro/")).toBe(
      "https://smartcook.pro/img/1.webp",
    );
  });

  it("чужая картинка остаётся абсолютной как есть", () => {
    expect(absoluteImageUrl(`${SB}/feed_photos/a.jpg`, "https://smartcook.pro")).toBe(`${SB}/feed_photos/a.jpg`);
  });
});

// Шаблон проверяется ТЕМ ЖЕ движком, которым Next сопоставляет rewrite. Регулярка
// в JS и path-to-regexp могли бы понять один шаблон по-разному, и тогда функция
// выдавала бы адреса, которые rewrite не обслуживает.
describe("шаблон rewrite в движке Next (path-to-regexp)", () => {
  const require = createRequire(import.meta.url);
  const { match } = require("next/dist/compiled/path-to-regexp") as {
    match: (p: string) => (path: string) => false | { params: { path: string } };
  };
  const rewrite = match(`/img/:path(${IMG_PATH_PATTERN})`);
  const immutable = match(`/img/:path(${IMMUTABLE_PATH_PATTERN})`);

  it("реальные пути бакета обслуживаются, путь передаётся целиком", () => {
    for (const path of ["ideas/tefteli-v-tomatnom-souse-1789918526569.webp", "dish-cache/2.webp", "1543.webp"]) {
      const result = rewrite(`/img/${path}`);
      expect(result && result.params.path).toBe(path);
    }
  });

  it("всё подозрительное под /img/ не обслуживается", () => {
    for (const bad of ["/img/../x.webp", "/img/a/../../b.webp", "/img/x.html", "/img/x.webp.html", "/img/", "/img/a//b.webp"]) {
      expect(rewrite(bad)).toBe(false);
    }
  });

  it("регистр Next НЕ различает — и это безопасно", () => {
    // Next сопоставляет rewrite без учёта регистра (sensitive: false), поэтому
    // /img/X.webp пройдёт. Уйдёт он в тот же бакет с расширением картинки, а
    // Supabase пути различает по регистру — все наши файлы в нижнем, ответ 404.
    // Фиксируем фактическое поведение, чтобы не обещать строгости, которой нет.
    expect(rewrite("/img/X.webp")).not.toBe(false);
  });

  it("immutable — только файлы с меткой времени в имени", () => {
    expect(immutable("/img/ideas/tefteli-v-tomatnom-souse-1789918526569.webp")).not.toBe(false);
    expect(immutable("/img/dish-cache/2.webp")).toBe(false);
    expect(immutable("/img/1543.webp")).toBe(false);
  });
});

describe("next.config.ts берёт шаблоны отсюда, а не держит свою копию", () => {
  const config = readFileSync(join(__dirname, "..", "next.config.ts"), "utf8");

  it("rewrite и заголовки построены на общих константах", () => {
    expect(config).toContain("`/img/:path(${IMG_PATH_PATTERN})`");
    expect(config).toContain("`${SUPABASE_ORIGIN}${BUCKET_PATH}:path`");
    expect(config).toContain("`/img/:path(${IMMUTABLE_PATH_PATTERN})`");
  });

  it("других rewrite на /img/ нет", () => {
    expect(config.match(/source: `\/img\//g)?.length).toBe(2); // rewrite + immutable-заголовки
  });
});
