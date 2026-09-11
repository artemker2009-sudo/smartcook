import { describe, it, expect } from "vitest";
// Внутри lib/ импортируем соседей относительным путём: алиас @/ в тестах не резолвится.
import { computeMissing, sameProduct, isPantryStaple } from "./missingProducts";

describe("sameProduct", () => {
  it("уточнение считается тем же продуктом", () => {
    expect(sameProduct("яйцо", "Яйцо куриное")).toBe(true);
    expect(sameProduct("масло", "Масло растительное")).toBe(true);
    expect(sameProduct("сыр", "Сыр твёрдый")).toBe(true);
  });

  it("разные формы слова сходятся", () => {
    expect(sameProduct("помидор", "Помидоры")).toBe(true);
    expect(sameProduct("Морковь", "морковь (1 шт, 120 г)")).toBe(true);
  });

  it("разные продукты с общим словом НЕ сходятся", () => {
    // Ровно этот случай раньше прятал половину покупок за «всё есть дома».
    expect(sameProduct("перец болгарский", "Перец черный молотый")).toBe(false);
    expect(sameProduct("масло сливочное", "Масло растительное")).toBe(false);
  });

  it("совсем разное не сходится", () => {
    expect(sameProduct("картофель", "говядина")).toBe(false);
    expect(sameProduct("", "молоко")).toBe(false);
  });
});

describe("isPantryStaple", () => {
  it("соль, перец и вода в магазин не гонят", () => {
    expect(isPantryStaple("Соль")).toBe(true);
    expect(isPantryStaple("Перец черный молотый")).toBe(true);
    expect(isPantryStaple("Масло растительное")).toBe(true);
    expect(isPantryStaple("Вода")).toBe(true);
  });

  it("нормальные продукты кладовкой не считаются", () => {
    expect(isPantryStaple("Перец болгарский")).toBe(false);
    expect(isPantryStaple("Масло сливочное")).toBe(false);
    expect(isPantryStaple("Картофель")).toBe(false);
  });
});

describe("computeMissing", () => {
  it("считает недостающее сам, даже когда модель прислала пустой список", () => {
    // Реальный случай из прода (#1778): фото картошки и яйца, режим «строго
    // из этого», missing_ingredients = [] — а сметаны на фото не было.
    const result = computeMissing({
      detailed: [{ name: "Картофель" }, { name: "Яйцо" }, { name: "Сметана" }, { name: "Соль" }],
      known: ["картофель", "яйцо"],
      modelMissing: [],
    });
    expect(result.items).toEqual(["Сметана"]);
    expect(result.comparable).toBe(true);
  });

  it("«всё есть дома» только когда реально всё есть", () => {
    const result = computeMissing({
      detailed: [{ name: "Яйцо куриное" }, { name: "Соль" }, { name: "Масло растительное" }],
      known: ["яйца"],
      modelMissing: [],
    });
    expect(result.items).toEqual([]);
    expect(result.comparable).toBe(true);
  });

  it("без списка продуктов НЕ делает вид, что всё есть", () => {
    // История, ссылка, поиск по названию блюда: сравнивать не с чем.
    const result = computeMissing({
      detailed: [{ name: "Свекла" }, { name: "Капуста" }],
      known: [],
      modelMissing: [],
    });
    expect(result.comparable).toBe(false);
    expect(result.items).toEqual([]);
  });

  it("без списка продуктов берёт подсказку модели", () => {
    const result = computeMissing({
      detailed: [{ name: "Свекла" }],
      known: null,
      modelMissing: ["Свекла", "Капуста белокочанная", "Соль"],
    });
    expect(result.items).toEqual(["Свекла", "Капуста белокочанная"]);
    expect(result.comparable).toBe(false);
  });

  it("не просит купить то, что человек уже назвал, даже если модель просит", () => {
    const result = computeMissing({
      detailed: [{ name: "Молоко" }],
      known: ["молоко 3.2%"],
      modelMissing: ["Молоко"],
    });
    expect(result.items).toEqual([]);
  });

  it("дедуплицирует ингредиенты рецепта и подсказки модели", () => {
    const result = computeMissing({
      detailed: [{ name: "Сметана" }],
      known: ["картофель"],
      modelMissing: ["сметана"],
    });
    expect(result.items).toHaveLength(1);
  });

  it("склеенный одной строкой список старых записей раскладывается", () => {
    const result = computeMissing({
      detailed: [],
      known: [],
      modelMissing: "Свекла, Капуста белокочанная, Говядина",
    });
    expect(result.items).toEqual(["Свекла", "Капуста белокочанная", "Говядина"]);
  });
});
