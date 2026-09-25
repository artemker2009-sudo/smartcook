import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Страж читаемости количества в списке покупок («2 шт», «500 г»).
 *
 * ЧТО БЫЛО СЛОМАНО. Количество красилось токеном --color-text-muted (#a1a1aa)
 * и давало контраст 2.56:1 с белой карточкой — вдвое ниже нормы 4.5:1. На
 * телефоне при дневном свете оно просто не читалось. А это ровно то число,
 * ради которого список и открывают у полки.
 *
 * ПОЧЕМУ ТЕСТ ЧИТАЕТ CSS, А НЕ СМОТРИТ НА ЭКРАН. Цвет — это одно значение в
 * одном правиле. Скриншот покажет, что «стало темнее», но не скажет, хватает
 * ли контраста; а формула WCAG скажет точно и не зависит от того, кто смотрит
 * на картинку.
 */

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

/** Относительная яркость по WCAG 2.1. */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Цвет из правила: ищем `color:` внутри блока селектора. */
function colorOf(selector: string): string {
  const block = css.slice(css.indexOf(selector));
  const body = block.slice(block.indexOf("{"), block.indexOf("}"));
  const match = body.match(/color:\s*([^;]+);/);
  if (!match) throw new Error(`не нашёл color у ${selector}`);
  return match[1].trim();
}

/** Значение CSS-переменной из :root. */
function tokenValue(name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`не нашёл токен ${name}`);
  return match[1];
}

// Фоны, на которых строка списка реально лежит.
const SURFACE = "#ffffff"; // карточка списка
const PAGE = "#faf9f7";    // фон страницы

/** Предел, заданный основателем: темнее или равно. */
const LIMIT = "#4a4a45";

describe("количество в списке покупок читается", () => {
  const qty = colorOf(".sh-row-qty").toLowerCase();

  it("цвет задан явным hex, а не светлым токеном", () => {
    expect(qty).toMatch(/^#[0-9a-f]{6}$/);
    // Именно тот токен, из-за которого всё и не читалось.
    expect(qty).not.toBe(tokenValue("--color-text-muted").toLowerCase());
  });

  it("не светлее #4A4A45", () => {
    expect(luminance(qty)).toBeLessThanOrEqual(luminance(LIMIT) + 1e-9);
  });

  it("контраст с карточкой и с фоном страницы не ниже 4.5:1", () => {
    expect(contrast(qty, SURFACE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(qty, PAGE)).toBeGreaterThanOrEqual(4.5);
  });

  it("у купленного количество светлее активного, но всё ещё читаемо", () => {
    const done = colorOf(".sh-row-done .sh-row-qty");
    // В правиле стоит токен — разворачиваем его в значение.
    const doneHex = done.startsWith("var(")
      ? tokenValue(done.slice(4, -1).trim())
      : done;

    expect(contrast(doneHex, SURFACE)).toBeGreaterThanOrEqual(4.5);
    // Светлее активного — это и есть сигнал «уже взяли».
    expect(luminance(doneHex)).toBeGreaterThan(luminance(qty));
  });

  it("название купленного тоже читается", () => {
    const name = colorOf(".sh-row-done .sh-row-name");
    const nameHex = name.startsWith("var(") ? tokenValue(name.slice(4, -1).trim()) : name;
    expect(contrast(nameHex, SURFACE)).toBeGreaterThanOrEqual(4.5);
  });
});
