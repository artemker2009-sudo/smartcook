import { describe, it, expect } from "vitest";
import { normalizeQueryKey, MAX_QUERY_KEY_LENGTH } from "./queryNormalize";

describe("normalizeQueryKey", () => {
  it("приводит к нижнему регистру и убирает пунктуацию", () => {
    expect(normalizeQueryKey("Борщ!")).toBe("борщ");
    expect(normalizeQueryKey("БОРЩ")).toBe("борщ");
  });

  it("схлопывает пробелы и обрезает края", () => {
    expect(normalizeQueryKey("  борщ  ")).toBe("борщ");
    expect(normalizeQueryKey("паста   карбонара")).toBe("паста карбонара");
    expect(normalizeQueryKey("\tборщ\n")).toBe("борщ");
  });

  it("«Борщ!» и «борщ» дают один ключ", () => {
    expect(normalizeQueryKey("Борщ!")).toBe(normalizeQueryKey("борщ"));
    expect(normalizeQueryKey("  БОРЩ...  ")).toBe(normalizeQueryKey("борщ"));
  });

  it("удаляет эмодзи", () => {
    expect(normalizeQueryKey("борщ 🍲")).toBe("борщ");
    expect(normalizeQueryKey("🔥борщ🔥")).toBe("борщ");
  });

  it("разделители не склеивают слова", () => {
    expect(normalizeQueryKey("борщ,суп")).toBe("борщ суп");
    expect(normalizeQueryKey("яйца, хлеб, сыр")).toBe("яйца хлеб сыр");
  });

  it("сохраняет цифры", () => {
    expect(normalizeQueryKey("Торт Наполеон 2.0")).toBe("торт наполеон 2 0");
  });

  it("пустая строка и мусор → пустой ключ", () => {
    expect(normalizeQueryKey("")).toBe("");
    expect(normalizeQueryKey("   ")).toBe("");
    expect(normalizeQueryKey("!!!")).toBe("");
    expect(normalizeQueryKey("🎉🎉🎉")).toBe("");
  });

  it("нестроковый ввод → пустой ключ", () => {
    expect(normalizeQueryKey(undefined)).toBe("");
    expect(normalizeQueryKey(null)).toBe("");
    expect(normalizeQueryKey(42)).toBe("");
  });

  it("ограничивает длину", () => {
    const long = "борщ ".repeat(100);
    const key = normalizeQueryKey(long);
    expect(key.length).toBeLessThanOrEqual(MAX_QUERY_KEY_LENGTH);
    // Не заканчивается пробелом после обрезки.
    expect(key).toBe(key.trim());
  });
});
