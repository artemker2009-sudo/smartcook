import { describe, it, expect } from "vitest";
import { addNames, parseNames, MAX_SHOPPING_ITEMS,
  signatureFromNames,
  listSignature,
} from "./shoppingList";

describe("parseNames", () => {
  it("одна позиция остаётся одной позицией", () => {
    expect(parseNames("молоко")).toEqual(["молоко"]);
    expect(parseNames("куриное филе охлаждённое")).toEqual(["куриное филе охлаждённое"]);
  });

  it("запятая по-прежнему делит позиции", () => {
    expect(parseNames("молоко, хлеб, яйца")).toEqual(["молоко", "хлеб", "яйца"]);
  });

  // Ввод через пробелы, без запятых — то, на чём провалилась приёмка.
  it("ввод без запятых режется по словарю продуктов", () => {
    expect(parseNames("Молоко яйца хлеб тефтели")).toEqual([
      "Молоко",
      "яйца",
      "хлеб",
      "тефтели",
    ]);
    expect(parseNames("молоко огурцы")).toEqual(["молоко", "огурцы"]);
    expect(parseNames("яйца молоко 3 л молоко 2 л")).toEqual([
      "яйца",
      "молоко 3 л",
      "молоко 2 л",
    ]);
    expect(parseNames("гречка макароны тефтели")).toEqual(["гречка", "макароны", "тефтели"]);
    expect(parseNames("молоко 2 л")).toEqual(["молоко 2 л"]);
    expect(parseNames("куриное филе охлаждённое")).toEqual(["куриное филе охлаждённое"]);
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

describe("signatureFromNames — подпись набора позиций", () => {
  it("не зависит от порядка и регистра", () => {
    expect(signatureFromNames(["Молоко", "хлеб"])).toBe(signatureFromNames(["ХЛЕБ", "молоко"]));
  });

  it("меняется при добавлении и удалении позиции", () => {
    const base = signatureFromNames(["молоко", "хлеб"]);
    expect(signatureFromNames(["молоко", "хлеб", "сыр"])).not.toBe(base);
    expect(signatureFromNames(["молоко"])).not.toBe(base);
  });

  it("listSignature — та же формула: галочка подпись НЕ меняет", () => {
    // Ключевое свойство: пока человек ходит по магазину и вычёркивает купленное,
    // раскладка по отделам не должна сбрасываться.
    const item = (name: string, checked: boolean) => ({ id: name, name, checked });
    const before = listSignature([item("молоко", false), item("хлеб", false)]);
    const after = listSignature([item("молоко", true), item("хлеб", false)]);
    expect(after).toBe(before);
  });

  it("совпадает с listSignature по тем же названиям — клиент и сервер считают одинаково", () => {
    const names = ["Молоко 2 л", "хлеб"];
    const fromItems = listSignature(names.map((n) => ({ id: n, name: n, checked: false })));
    expect(signatureFromNames(names)).toBe(fromItems);
  });
});
