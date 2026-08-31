import { describe, it, expect } from "vitest";
import { parseRecognizedList } from "./shoppingPhoto";
import { MAX_SHOPPING_ITEMS } from "./shoppingList";

const ok = (obj: unknown) => JSON.stringify(obj);

describe("parseRecognizedList", () => {
  it("разбирает нормальный ответ модели", () => {
    const res = parseRecognizedList(ok({ no_list: false, items: ["молоко 2 л", "яйца 10 шт", "хлеб"] }));
    expect(res).toEqual({ noList: false, items: ["молоко 2 л", "яйца 10 шт", "хлеб"] });
  });

  it("прогоняет строки через parseNames: маркеры, слипшиеся количества", () => {
    const res = parseRecognizedList(ok({ no_list: false, items: ["- молоко 2л", "1. яйца10шт"] }));
    expect(res).toEqual({ noList: false, items: ["молоко 2 л", "яйца 10 шт"] });
  });

  it("строку с несколькими продуктами делит по словарю", () => {
    const res = parseRecognizedList(ok({ no_list: false, items: ["молоко яйца хлеб"] }));
    expect(res).toEqual({ noList: false, items: ["молоко", "яйца", "хлеб"] });
  });

  it("no_list от модели → честный отказ, без пустых чипов", () => {
    expect(parseRecognizedList(ok({ no_list: true, items: [] }))).toEqual({ noList: true, items: [] });
  });

  it("пустой список позиций → тоже отказ, а не пустые чипы", () => {
    expect(parseRecognizedList(ok({ no_list: false, items: [] }))).toEqual({ noList: true, items: [] });
    expect(parseRecognizedList(ok({ no_list: false, items: ["   ", "—"] }))).toEqual({
      noList: true,
      items: [],
    });
  });

  it("мусор вместо JSON → отказ, а не падение", () => {
    expect(parseRecognizedList("не json")).toEqual({ noList: true, items: [] });
    expect(parseRecognizedList("")).toEqual({ noList: true, items: [] });
    expect(parseRecognizedList(null)).toEqual({ noList: true, items: [] });
    expect(parseRecognizedList(undefined)).toEqual({ noList: true, items: [] });
    expect(parseRecognizedList(ok({ items: "молоко" }))).toEqual({ noList: true, items: [] });
    expect(parseRecognizedList(ok({ items: [1, 2, 3] }))).toEqual({ noList: true, items: [] });
  });

  it("режет ответ до лимита позиций — модель не может раздуть список", () => {
    const many = Array.from({ length: 500 }, (_, i) => `продукт ${i}`);
    const res = parseRecognizedList(ok({ no_list: false, items: many }));
    expect(res.noList).toBe(false);
    expect(res.items).toHaveLength(MAX_SHOPPING_ITEMS);
  });

  it("длина позиции режется общей санитизацией", () => {
    const res = parseRecognizedList(ok({ no_list: false, items: ["х".repeat(200)] }));
    expect(res.noList).toBe(false);
    expect(res.items[0].length).toBeLessThanOrEqual(50);
  });
});
