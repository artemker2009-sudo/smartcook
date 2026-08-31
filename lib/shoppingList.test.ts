import { describe, it, expect } from "vitest";
import { addNames, parseNames, MAX_SHOPPING_ITEMS } from "./shoppingList";

describe("parseNames", () => {
  it("одна позиция остаётся одной позицией", () => {
    expect(parseNames("молоко")).toEqual(["молоко"]);
    expect(parseNames("куриное филе охлаждённое")).toEqual(["куриное филе охлаждённое"]);
  });

  it("запятая по-прежнему делит позиции", () => {
    expect(parseNames("молоко, хлеб, яйца")).toEqual(["молоко", "хлеб", "яйца"]);
  });

  it("вставленный столбик с новой строки — отдельные позиции", () => {
    expect(parseNames("молоко 2 л\nяйца 10 шт\nкартошка 1 кг")).toEqual([
      "молоко 2 л",
      "яйца 10 шт",
      "картошка 1 кг",
    ]);
  });

  it("точка с запятой тоже разделитель", () => {
    expect(parseNames("молоко 2 л; яйца 10 шт")).toEqual(["молоко 2 л", "яйца 10 шт"]);
  });

  it("разлепляет количество и единицу", () => {
    expect(parseNames("молоко 2л")).toEqual(["молоко 2 л"]);
    expect(parseNames("яйца10шт")).toEqual(["яйца 10 шт"]);
    expect(parseNames("картошка 1кг")).toEqual(["картошка 1 кг"]);
  });

  it("не трогает слова, начинающиеся как единица", () => {
    expect(parseNames("сыр 2 литра")).toEqual(["сыр 2 литра"]);
    expect(parseNames("2 головки чеснока")).toEqual(["2 головки чеснока"]);
  });

  it("снимает маркеры списка и нумерацию", () => {
    expect(parseNames("- молоко\n• хлеб\n1. яйца\n[ ] сметана")).toEqual([
      "молоко",
      "хлеб",
      "яйца",
      "сметана",
    ]);
  });

  it("обломок-количество приклеивается к предыдущей позиции", () => {
    expect(parseNames("молоко, 2 л")).toEqual(["молоко 2 л"]);
  });

  it("пропускает заголовки отделов из скопированного списка", () => {
    expect(parseNames("Молочное:\n• молоко\n\nХлеб:\n• батон")).toEqual(["молоко", "батон"]);
  });

  it("мусор и пустой ввод → пустой массив", () => {
    expect(parseNames("")).toEqual([]);
    expect(parseNames("   \n\n , ; ")).toEqual([]);
  });
});

describe("addNames после вставки списка", () => {
  it("добавляет все позиции разом, дедуплицируя", () => {
    const result = addNames([], parseNames("молоко 2 л\nхлеб\nмолоко 2 л"));
    expect(result.items.map((it) => it.name)).toEqual(["молоко 2 л", "хлеб"]);
    expect(result.added).toBe(2);
    expect(result.duplicate).toBe(1);
  });

  it("лимит списка не обходится вставкой", () => {
    const many = Array.from({ length: MAX_SHOPPING_ITEMS + 5 }, (_, i) => `продукт ${i}`).join("\n");
    const result = addNames([], parseNames(many));
    expect(result.items).toHaveLength(MAX_SHOPPING_ITEMS);
    expect(result.limited).toBe(true);
  });
});
