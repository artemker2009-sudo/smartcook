import { describe, expect, it } from "vitest";
// Внутри lib/ импортируем соседей относительным путём: алиас @/ в vitest не резолвится.
import { buildDishPrompt, pickDishware } from "./dishPrompt";

// Посуда подбирается по названию, тегам и способу приготовления — новых полей
// в БД под это нет намеренно. Значит правило обязано быть проверяемым: ошибка
// здесь стоит денег (картинка уже сгенерирована) и видна только глазами.
describe("pickDishware", () => {
  it("супы — в глубокой тарелке", () => {
    for (const title of [
      "Куриный суп с лапшой",
      "Борщ с говядиной",
      "Щи из свежей капусты",
      "Уха из речной рыбы",
      "Солянка мясная",
      "Окрошка на кефире",
    ]) {
      expect(pickDishware({ title }), title).toBe("deep-bowl");
    }
  });

  it("запечённое — в форме для запекания", () => {
    for (const title of [
      "Запеканка творожная",
      "Запечённая рыба с овощами",
      "Лазанья с фаршем",
      "Картофель под сыром",
    ]) {
      expect(pickDishware({ title }), title).toBe("baking-dish");
    }
  });

  it("каши и подобное — в миске", () => {
    for (const title of ["Овсяная каша с бананом", "Гречневая каша", "Рагу овощное"]) {
      expect(pickDishware({ title }), title).toBe("bowl");
    }
  });

  it("всё остальное — на тарелке", () => {
    for (const title of [
      "Сырники со сметаной",
      "Куриное филе с овощами",
      "Салат с тунцом",
      "Яичница с колбасой",
    ]) {
      expect(pickDishware({ title }), title).toBe("plate");
    }
  });

  it("духовка без слов-примет тоже даёт форму", () => {
    expect(pickDishware({ title: "Курица с картошкой", cookMethod: "духовка" })).toBe("baking-dish");
  });

  it("слова названия сильнее способа: суп из духовки остаётся супом", () => {
    expect(pickDishware({ title: "Суп-пюре из тыквы", cookMethod: "духовка" })).toBe("deep-bowl");
  });

  it("теги учитываются наравне с названием", () => {
    expect(pickDishware({ title: "Харчо по-домашнему", tags: ["суп"] })).toBe("deep-bowl");
    expect(pickDishware({ title: "Тыква по-деревенски", tags: ["запеканка"] })).toBe("baking-dish");
  });

  it("регистр не важен", () => {
    expect(pickDishware({ title: "БОРЩ УКРАИНСКИЙ" })).toBe("deep-bowl");
  });

  it("пустой ввод не роняет и даёт тарелку", () => {
    expect(pickDishware({})).toBe("plate");
    expect(pickDishware({ title: "", tags: null, cookMethod: null })).toBe("plate");
  });
});

describe("buildDishPrompt", () => {
  const base = { title: "Сырники со сметаной", ingredients: ["творог", "яйцо"] } as const;

  it("подставляет название, ингредиенты и посуду", () => {
    const prompt = buildDishPrompt({ ...base, aspect: "square", dishware: "deep-bowl" });
    expect(prompt).toContain("Сырники со сметаной");
    expect(prompt).toContain("творог, яйцо");
    expect(prompt).toContain("deep soup bowl");
  });

  it("вертикаль просит стол сверху и снизу, квадрат — ровные поля", () => {
    const portrait = buildDishPrompt({ ...base, aspect: "portrait", dishware: "plate" });
    const square = buildDishPrompt({ ...base, aspect: "square", dishware: "plate" });
    expect(portrait).toContain("above and below");
    expect(portrait).toContain("not as a cropped square");
    expect(square).toContain("Square photo");
    expect(square).not.toContain("above and below");
  });

  it("общая часть стиля одинакова у разной посуды — на этом держится серия", () => {
    const a = buildDishPrompt({ ...base, aspect: "square", dishware: "plate" });
    const b = buildDishPrompt({ ...base, aspect: "square", dishware: "baking-dish" });
    const tail = (s: string) => s.slice(s.indexOf("Style, identical for every photo"));
    expect(tail(a)).toBe(tail(b));
  });

  it("запреты на месте: ни рук, ни людей, ни текста, ни лишнего реквизита", () => {
    const prompt = buildDishPrompt({ ...base, aspect: "portrait", dishware: "bowl" });
    expect(prompt).toContain("no hands, no people");
    expect(prompt).toContain("No text");
    expect(prompt).toContain("Nothing else on the table");
    expect(prompt).toContain("At most one simple fork or spoon");
  });

  it("без ингредиентов строка про них не появляется вовсе", () => {
    const prompt = buildDishPrompt({ title: "Борщ", aspect: "square", dishware: "deep-bowl" });
    expect(prompt).not.toContain("Key ingredients");
  });
});
