import { describe, it, expect } from "vitest";
import { splitPhraseIntoItems } from "./productSplit";
import { classifyWord } from "./productWords";

// Обязательные кейсы приёмки (диктовка и ввод без запятых).
describe("splitPhraseIntoItems — приёмка", () => {
  it("«куриное филе охлаждённое» → 1 позиция", () => {
    expect(splitPhraseIntoItems("куриное филе охлаждённое")).toEqual(["куриное филе охлаждённое"]);
  });

  it("«молоко огурцы» → 2 позиции", () => {
    expect(splitPhraseIntoItems("молоко огурцы")).toEqual(["молоко", "огурцы"]);
  });

  it("«яйца молоко 3 л молоко 2 л» → яйца / молоко 3 л / молоко 2 л", () => {
    expect(splitPhraseIntoItems("яйца молоко 3 л молоко 2 л")).toEqual([
      "яйца",
      "молоко 3 л",
      "молоко 2 л",
    ]);
  });

  it("«молоко яйца хлеб тефтели» → 4 позиции", () => {
    expect(splitPhraseIntoItems("молоко яйца хлеб тефтели")).toEqual([
      "молоко",
      "яйца",
      "хлеб",
      "тефтели",
    ]);
  });

  it("«гречка макароны тефтели» → 3 позиции", () => {
    expect(splitPhraseIntoItems("гречка макароны тефтели")).toEqual([
      "гречка",
      "макароны",
      "тефтели",
    ]);
  });

  it("«молоко 2 л» → 1 позиция", () => {
    expect(splitPhraseIntoItems("молоко 2 л")).toEqual(["молоко 2 л"]);
  });
});

describe("splitPhraseIntoItems — правила", () => {
  it("количество и единица приклеиваются к продукту", () => {
    expect(splitPhraseIntoItems("молоко два литра")).toEqual(["молоко два литра"]);
    expect(splitPhraseIntoItems("сыр 1.5 кг")).toEqual(["сыр 1.5 кг"]);
    expect(splitPhraseIntoItems("яйца 10 шт молоко 2 л")).toEqual(["яйца 10 шт", "молоко 2 л"]);
  });

  it("количество ПЕРЕД продуктом относится к нему", () => {
    expect(splitPhraseIntoItems("2 л молока")).toEqual(["2 л молока"]);
    expect(splitPhraseIntoItems("два молока три яйца")).toEqual(["два молока", "три яйца"]);
  });

  it("незнакомые слова не начинают позицию", () => {
    expect(splitPhraseIntoItems("куриное филе без кожи и костей")).toEqual([
      "куриное филе без кожи и костей",
    ]);
    expect(splitPhraseIntoItems("хлеб бородинский нарезной")).toEqual(["хлеб бородинский нарезной"]);
  });

  it("прилагательное перед продуктом не рвёт позицию, продукт после продукта — рвёт", () => {
    expect(splitPhraseIntoItems("сливочное масло")).toEqual(["сливочное масло"]);
    expect(splitPhraseIntoItems("хлеб черный молоко")).toEqual(["хлеб черный", "молоко"]);
  });

  it("связки выбрасываются на границе и сохраняются внутри позиции", () => {
    expect(splitPhraseIntoItems("хлеб и сметана")).toEqual(["хлеб", "сметана"]);
    expect(splitPhraseIntoItems("ну вот молоко")).toEqual(["молоко"]);
    expect(splitPhraseIntoItems("купи батон нарезной")).toEqual(["батон нарезной"]);
  });

  it("предлог притягивает следующий продукт к текущей позиции", () => {
    expect(splitPhraseIntoItems("тефтели в томатном соусе")).toEqual(["тефтели в томатном соусе"]);
    expect(splitPhraseIntoItems("средство для посуды")).toEqual(["средство для посуды"]);
    // ...но следующий за этим продукт — уже новая позиция.
    expect(splitPhraseIntoItems("молоко для кофе хлеб")).toEqual(["молоко для кофе", "хлеб"]);
  });

  it("«десяток яиц» начинает позицию, а «шт» приклеивается слева", () => {
    expect(splitPhraseIntoItems("два литра молока и десяток яиц")).toEqual([
      "два литра молока",
      "десяток яиц",
    ]);
    expect(splitPhraseIntoItems("яйца 10 шт молоко")).toEqual(["яйца 10 шт", "молоко"]);
  });

  it("склонения узнаются по основе", () => {
    expect(splitPhraseIntoItems("молока хлеба картошки")).toEqual(["молока", "хлеба", "картошки"]);
  });

  it("пустой ввод → пустой массив", () => {
    expect(splitPhraseIntoItems("")).toEqual([]);
    expect(splitPhraseIntoItems("   ")).toEqual([]);
  });
});

describe("classifyWord", () => {
  it("отличает продукт, единицу, количество, связку и описание", () => {
    expect(classifyWord("молоко")).toBe("product");
    expect(classifyWord("молока")).toBe("product");
    expect(classifyWord("л")).toBe("unit");
    expect(classifyWord("пачка")).toBe("unit");
    expect(classifyWord("2")).toBe("quantity");
    expect(classifyWord("два")).toBe("quantity");
    expect(classifyWord("и")).toBe("connector");
    expect(classifyWord("куриное")).toBe("other");
    expect(classifyWord("охлаждённое")).toBe("other");
  });

  it("мороженое — продукт, несмотря на окончание прилагательного", () => {
    expect(classifyWord("мороженое")).toBe("product");
  });

  it("ё и регистр не мешают", () => {
    expect(classifyWord("Свёкла")).toBe("product");
    expect(classifyWord("СЕЛЬДЬ")).toBe("product");
  });
});
