import { describe, it, expect } from "vitest";
import {
  clampServings,
  formatServings,
  ingredientLine,
  scaleIdeaAmount,
} from "./ideaServings";

// Количества в idea_recipes написаны на ВЕСЬ рецепт (servings порций), а не на
// одну, как в recipes. Эти тесты стерегут именно это: на базовом числе порций
// множитель равен единице, и ошибку «умножили на абсолютное число порций»
// глазами не поймать — она проявляется только при изменении порций.
describe("scaleIdeaAmount: множитель — доля, а не число порций", () => {
  it("тефтели: 500 г на 4 порции → 3 порции дают 375 г", () => {
    expect(scaleIdeaAmount("500 г", 3, 4)).toBe("375 г");
  });

  it("тефтели: 6 порций из 4 дают 750 г, а не 3000 г", () => {
    expect(scaleIdeaAmount("500 г", 6, 4)).toBe("750 г");
  });

  it("базовое число порций возвращает строку буква в букву", () => {
    expect(scaleIdeaAmount("2 ст. л.", 4, 4)).toBe("2 ст. л.");
    expect(scaleIdeaAmount("0,5 шт", 4, 4)).toBe("0,5 шт");
  });

  it("объём считается так же, как вес", () => {
    expect(scaleIdeaAmount("400 мл", 6, 4)).toBe("600 мл");
  });

  it("дробный результат у веса допустим", () => {
    expect(scaleIdeaAmount("2 ст. л.", 3, 4)).toBe("1,5 ст. л.");
  });

  it("битые входные данные не роняют строку", () => {
    expect(scaleIdeaAmount("500 г", 3, 0)).toBe("500 г");
    expect(scaleIdeaAmount("", 3, 4)).toBe("");
  });
});

describe("scaleIdeaAmount: что пересчитывать нельзя", () => {
  it("«по вкусу» не трогаем", () => {
    expect(scaleIdeaAmount("по вкусу", 8, 4)).toBe("по вкусу");
  });

  it("«1 щепотка» не трогаем — цифра есть, но пересчитывать нечего", () => {
    expect(scaleIdeaAmount("1 щепотка", 8, 4)).toBe("1 щепотка");
  });

  it("«2 ст. л. для жарки» не трогаем", () => {
    expect(scaleIdeaAmount("2 ст. л. для жарки", 8, 4)).toBe("2 ст. л. для жарки");
  });

  it("«для обжарки» тоже не трогаем", () => {
    expect(scaleIdeaAmount("2 ст. л. для обжарки", 8, 4)).toBe("2 ст. л. для обжарки");
  });

  it("стоп-слово ищется по НАЧАЛУ слова, а не по подстроке", () => {
    // «вкус» внутри «привкусом» — это не «по вкусу». Проверка по подстроке
    // заморозила бы такую строку навсегда; ровно на подстроках мы уже
    // обожглись, когда «овощи» содержали «щи».
    expect(scaleIdeaAmount("200 г с привкусом", 8, 4)).toBe("400 г с привкусом");
    expect(scaleIdeaAmount("200 г", 8, 4)).toBe("400 г");
  });
});

describe("scaleIdeaAmount: штучное округляем вверх", () => {
  it("1 шт при уменьшении остаётся 1 шт, а не 0,8", () => {
    expect(scaleIdeaAmount("1 шт", 3, 4)).toBe("1 шт");
  });

  it("1 шт при увеличении в полтора раза даёт 2 шт", () => {
    expect(scaleIdeaAmount("1 шт", 6, 4)).toBe("2 шт");
  });

  it("ровное удвоение не превращается в три штуки", () => {
    expect(scaleIdeaAmount("2 шт", 8, 4)).toBe("4 шт");
  });

  it("зубчики, пучки, банки и ломтики считаются штучными", () => {
    expect(scaleIdeaAmount("2 зубчика", 6, 4)).toBe("3 зубчика");
    expect(scaleIdeaAmount("1 пучок", 6, 4)).toBe("2 пучок");
    expect(scaleIdeaAmount("1 банка", 6, 4)).toBe("2 банка");
    expect(scaleIdeaAmount("2 ломтика", 6, 4)).toBe("3 ломтика");
  });

  it("никогда не опускаемся до нуля штук", () => {
    expect(scaleIdeaAmount("1 шт", 1, 12)).toBe("1 шт");
  });

  it("вес рядом со штуками округлению вверх не подвергается", () => {
    expect(scaleIdeaAmount("80 г", 3, 4)).toBe("60 г");
  });
});

describe("строка для списка покупок", () => {
  it("склеивает название и количество", () => {
    expect(ingredientLine("Фарш говяжий", "375 г")).toBe("Фарш говяжий 375 г");
  });

  it("пустое количество не оставляет хвостовой пробел", () => {
    expect(ingredientLine("Соль", "")).toBe("Соль");
  });
});

describe("границы и склонения порций", () => {
  it("зажимает в 1..12", () => {
    expect(clampServings(0)).toBe(1);
    expect(clampServings(99)).toBe(12);
    expect(clampServings(Number.NaN)).toBe(1);
  });

  it("склоняет", () => {
    expect(formatServings(1)).toBe("1 порция");
    expect(formatServings(3)).toBe("3 порции");
    expect(formatServings(5)).toBe("5 порций");
    expect(formatServings(11)).toBe("11 порций");
  });
});
