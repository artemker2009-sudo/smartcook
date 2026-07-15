import { describe, expect, it } from "vitest";
import {
  addProduct,
  sanitizeProduct,
  sanitizeProductList,
  MAX_PRODUCTS,
  MAX_PRODUCT_LENGTH,
} from "./products";

describe("sanitizeProduct", () => {
  it("обрезает продукт до MAX_PRODUCT_LENGTH символов", () => {
    // Вход заведомо длиннее лимита — проверяем, что режется ровно до предела
    // (без привязки к конкретному числу, чтобы тест переживал смену лимита).
    const value = sanitizeProduct("я".repeat(MAX_PRODUCT_LENGTH + 20));
    expect(value).toHaveLength(MAX_PRODUCT_LENGTH);
  });

  it("вычищает управляющие символы и лишние пробелы", () => {
    expect(sanitizeProduct("  смет\u0000ана\n\tкислая  ")).toBe("смет ана кислая");
  });

  it("отбрасывает мусор", () => {
    expect(sanitizeProduct("   ")).toBe("");
    expect(sanitizeProduct(42)).toBe("");
    expect(sanitizeProduct(null)).toBe("");
  });
});

describe("addProduct", () => {
  it("добавляет продукт в конец списка", () => {
    const result = addProduct(["яйца"], "сметана");
    expect(result).toEqual({ ok: true, products: ["яйца", "сметана"] });
  });

  it("не добавляет 21-й продукт", () => {
    const full = Array.from({ length: MAX_PRODUCTS }, (_, i) => `продукт${i}`);
    expect(addProduct(full, "лишний")).toEqual({ ok: false, reason: "limit" });
  });

  it("не плодит дубли (регистр не важен)", () => {
    expect(addProduct(["Сметана"], "сметана")).toEqual({ ok: false, reason: "duplicate" });
  });

  it("не добавляет пустую строку", () => {
    expect(addProduct([], "   ")).toEqual({ ok: false, reason: "empty" });
  });
});

describe("sanitizeProductList", () => {
  it("режет список до 20 продуктов", () => {
    const raw = Array.from({ length: 50 }, (_, i) => `продукт${i}`);
    expect(sanitizeProductList(raw)).toHaveLength(MAX_PRODUCTS);
  });

  it("чистит элементы, выбрасывает пустые и дубли", () => {
    expect(sanitizeProductList(["яйца", " яйца ", "", "  ", "сыр", 7])).toEqual([
      "яйца",
      "сыр",
    ]);
  });

  it("возвращает пустой список на не-массиве", () => {
    expect(sanitizeProductList("яйца")).toEqual([]);
    expect(sanitizeProductList(undefined)).toEqual([]);
  });
});
