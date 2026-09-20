import { describe, expect, it } from "vitest";
// Внутри lib/ импортируем соседей относительным путём: алиас @/ в vitest не резолвится.
import { ALLERGEN_SYNONYMS, buildTasteMatcher, hidesCard } from "./ideasTaste";

// «Подходит мне» — это подбор, а не гарантия. Но ошибка здесь бьёт по доверию
// сильнее любой другой: человек с аллергией на молоко увидит сырники и решит,
// что фильтр не работает вовсе.

const card = (extra: Partial<Parameters<typeof hidesCard>[0]> = {}) => ({
  allergens: [] as string[],
  ingredientNames: [] as string[],
  ...extra,
});

describe("buildTasteMatcher — разбор профиля", () => {
  it("пустой профиль виден как пустой — по нему прячем сам чип", () => {
    expect(buildTasteMatcher({}).isEmpty).toBe(true);
    expect(buildTasteMatcher({ allergies: [], dislikes: [] }).isEmpty).toBe(true);
    expect(buildTasteMatcher({ allergies: ["  "] }).isEmpty).toBe(true);
  });

  it("узнаёт тег по названию самого тега", () => {
    expect(buildTasteMatcher({ allergies: ["молоко"] }).allergens).toEqual(["молоко"]);
    expect(buildTasteMatcher({ allergies: ["глютен"] }).allergens).toEqual(["глютен"]);
  });

  it("узнаёт по тому, как пишут люди", () => {
    for (const [word, expected] of [
      ["творог", "молоко"],
      ["сметана", "молоко"],
      ["лактоза", "молоко"],
      ["молочка", "молоко"],
      ["молочные продукты", "молоко"],
      ["казеин", "молоко"],
      ["гхи", "молоко"],
      ["клейковина", "глютен"],
      ["мучное", "глютен"],
      ["яичный белок", "яйца"],
      ["крабовые палочки", "морепродукты"],
      ["рыбный бульон", "рыба"],
      ["тахини", "кунжут"],
    ] as const) {
      expect(buildTasteMatcher({ allergies: [word] }).allergens, word).toContain(expected);
    }
  });

  it("овёс и овсянка идут в глютен — перестраховываемся осознанно", () => {
    for (const word of ["овёс", "овсянка", "овсяные хлопья"]) {
      expect(buildTasteMatcher({ allergies: [word] }).allergens, word).toContain("глютен");
    }
  });

  // Решение основателя: сливочное и растительное — разные вещи, а в профиле
  // пишут и так, и так. Одно слово «масло» не должно прятать пол-каталога.
  it("«масло» без уточнения не считается молочным, «сливочное масло» — считается", () => {
    expect(buildTasteMatcher({ allergies: ["масло"] }).allergens).toEqual([]);
    expect(buildTasteMatcher({ allergies: ["сливочное масло"] }).allergens).toContain("молоко");
    expect(buildTasteMatcher({ allergies: ["топлёное масло"] }).allergens).toContain("молоко");
  });

  it("регистр и падеж не важны", () => {
    expect(buildTasteMatcher({ allergies: ["МОЛОКА"] }).allergens).toContain("молоко");
    expect(buildTasteMatcher({ allergies: ["орехов"] }).allergens).toContain("орехи");
  });

  // САМОЕ ВАЖНОЕ В ЭТОМ ФАЙЛЕ. Аллергия, которой нет в словаре, не должна
  // ПРОПАДАТЬ: фильтр молча ничего не скрывал бы, а человек думал бы, что его
  // услышали.
  it("аллергия не из словаря не теряется, а идёт в сравнение с ингредиентами", () => {
    const taste = buildTasteMatcher({ allergies: ["клубника"] });
    expect(taste.allergens).toEqual([]);
    expect(taste.isEmpty).toBe(false);
    expect(taste.words.length).toBe(1);
    expect(hidesCard(card({ ingredientNames: ["Клубника свежая", "Сахар"] }), taste)).toBe(true);
    expect(hidesCard(card({ ingredientNames: ["Яблоко", "Сахар"] }), taste)).toBe(false);
  });

  it("нелюбимые продукты всегда идут словами", () => {
    const taste = buildTasteMatcher({ dislikes: ["грибы"] });
    expect(taste.allergens).toEqual([]);
    expect(hidesCard(card({ ingredientNames: ["Шампиньоны", "Лук"] }), taste)).toBe(false);
    expect(hidesCard(card({ ingredientNames: ["Грибы белые", "Лук"] }), taste)).toBe(true);
  });
});

describe("hidesCard", () => {
  it("прячет по тегу, который мы проставили при вычитке", () => {
    const taste = buildTasteMatcher({ allergies: ["творог"] });
    expect(hidesCard(card({ allergens: ["молоко"] }), taste)).toBe(true);
    expect(hidesCard(card({ allergens: ["рыба"] }), taste)).toBe(false);
  });

  it("не трогает карточку, если профиль пуст", () => {
    const taste = buildTasteMatcher({});
    expect(hidesCard(card({ allergens: ["молоко"] }), taste)).toBe(false);
  });

  it("карточка без ингредиентов не падает", () => {
    const taste = buildTasteMatcher({ dislikes: ["лук"] });
    expect(hidesCard(card({ ingredientNames: [] }), taste)).toBe(false);
    expect(hidesCard(card({ ingredientNames: null }), taste)).toBe(false);
  });

  // Та же ловушка, на которой мы споткнулись в подборе посуды («овощи»
  // содержит «щи»). Здесь сравниваются ОСНОВЫ слов на точное равенство,
  // поэтому подстроки не ловятся.
  it("«сыр» не прячет «сырники», «щи» не ловятся в «овощах»", () => {
    const cheese = buildTasteMatcher({ dislikes: ["сыр"] });
    expect(hidesCard(card({ ingredientNames: ["Сырники готовые"] }), cheese)).toBe(false);
    expect(hidesCard(card({ ingredientNames: ["Сыр твёрдый"] }), cheese)).toBe(true);

    const schi = buildTasteMatcher({ dislikes: ["щи"] });
    expect(hidesCard(card({ ingredientNames: ["Овощи замороженные"] }), schi)).toBe(false);
  });
});

describe("словарь", () => {
  it("название тега всегда входит в свои синонимы", () => {
    for (const [allergen, synonyms] of Object.entries(ALLERGEN_SYNONYMS)) {
      expect(synonyms, allergen).toContain(allergen);
    }
  });
});
