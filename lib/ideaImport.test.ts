import { describe, expect, it } from "vitest";
// Внутри lib/ импортируем соседей ОТНОСИТЕЛЬНЫМ путём: алиас @/ в vitest не
// резолвится, тест с "@/lib/..." просто не запустится.
import { MAX_IMPORT_RECIPES, parseIdeaRecipe, parseIdeasImport } from "./ideaImport";

function recipe(extra: Record<string, unknown> = {}) {
  return {
    slug: "syrniki-iz-tvoroga",
    title: "Сырники из творога",
    description: "Пышные сырники на сковороде.",
    servings: 2,
    cooking_time_minutes: 20,
    meals: ["завтрак", "перекус"],
    main_product: "без мяса",
    ingredients: [{ name: "Творог 9%", amount: "400 г" }],
    steps: ["Разомните творог вилкой."],
    ...extra,
  };
}

describe("parseIdeasImport — годный файл", () => {
  it("принимает два рецепта и подставляет значения по умолчанию", () => {
    const result = parseIdeasImport([
      recipe(),
      recipe({ slug: "kurinoe-file", title: "Куриное филе", main_product: "курица", meals: ["ужин"] }),
    ]);

    expect(result.fatal).toBeUndefined();
    expect(result.skipped).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].tags).toEqual([]);
    expect(result.rows[0].allergens).toEqual([]);
    expect(result.rows[0].cook_method).toBeNull();
    expect(result.rows[0].image_aspect).toBe("square");
    expect(result.rows[0].sort_weight).toBe(0);
  });

  it("чистит управляющие символы и схлопывает пробелы", () => {
    const result = parseIdeasImport([recipe({ title: "  Сырники\n\tиз   творога  " })]);
    expect(result.rows[0].title).toBe("Сырники из творога");
  });

  it("приводит slug и словарные значения к нижнему регистру", () => {
    const result = parseIdeasImport([
      recipe({ slug: "SYRNIKI-2", meals: ["Завтрак"], main_product: "Без мяса" }),
    ]);
    expect(result.rows[0].slug).toBe("syrniki-2");
    expect(result.rows[0].meals).toEqual(["завтрак"]);
    expect(result.rows[0].main_product).toBe("без мяса");
  });
});

describe("parseIdeasImport — поля, которыми распоряжается сервер", () => {
  // САМАЯ ВАЖНАЯ ПРОВЕРКА ФАЙЛА. Если is_published просочится из файла,
  // импорт начнёт публиковать в обход вычитки — ровно то, чего правило
  // «импорт ничего не публикует» не допускает.
  it("не принимает is_published из файла и не ругается на него", () => {
    const result = parseIdeasImport([
      recipe({ is_published: true, published_at: "2020-01-01", id: "xxx", image_url: "http://x" }),
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).not.toHaveProperty("is_published");
    expect(result.rows[0]).not.toHaveProperty("published_at");
    expect(result.rows[0]).not.toHaveProperty("id");
    expect(result.rows[0]).not.toHaveProperty("image_url");
    expect(result.warnings).toEqual([]);
  });

  it("предупреждает о неизвестном поле, но рецепт принимает", () => {
    const result = parseIdeasImport([recipe({ meal: ["завтрак"] })]);
    expect(result.rows).toHaveLength(1);
    expect(result.warnings.join(" ")).toContain("meal");
  });
});

describe("parseIdeasImport — отказы по рецепту", () => {
  it("ошибка в одном рецепте не роняет остальные", () => {
    const result = parseIdeasImport([
      recipe({ slug: "bad-one", meals: ["полдник"] }),
      recipe({ slug: "good-one" }),
    ]);
    expect(result.rows.map((r) => r.slug)).toEqual(["good-one"]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].slug).toBe("bad-one");
    expect(result.skipped[0].reason).toContain("полдник");
  });

  it("слишком длинное описание — ОТКАЗ, а не обрезка", () => {
    const result = parseIdeasImport([recipe({ description: "я".repeat(401) })]);
    expect(result.rows).toEqual([]);
    expect(result.skipped[0].reason).toContain("401");
    expect(result.skipped[0].reason).toContain("максимум 400");
  });

  it("ингредиент без name отбивается с номером элемента", () => {
    const result = parseIdeasImport([
      recipe({ ingredients: [{ name: "Творог", amount: "400 г" }, { amount: "1 шт" }] }),
    ]);
    expect(result.skipped[0].reason).toContain("элемент 2");
    expect(result.skipped[0].reason).toContain("name");
  });

  it("аллерген не из словаря отбивается", () => {
    const result = parseIdeasImport([recipe({ allergens: ["молочное"] })]);
    expect(result.rows).toEqual([]);
    expect(result.skipped[0].reason).toContain("молочное");
  });

  it("пустой meals отбивается (та же ловушка, что в CHECK миграции)", () => {
    const result = parseIdeasImport([recipe({ meals: [] })]);
    expect(result.rows).toEqual([]);
    expect(result.skipped[0].reason).toContain("meals");
  });

  it("кириллический slug отбивается", () => {
    const result = parseIdeasImport([recipe({ slug: "сырники" })]);
    expect(result.rows).toEqual([]);
    expect(result.skipped[0].reason).toContain("латиница");
  });

  it("дробное число порций отбивается", () => {
    const result = parseIdeasImport([recipe({ servings: 2.5 })]);
    expect(result.skipped[0].reason).toContain("целое");
  });

  it("рецепт без slug получает в отчёте номер строки", () => {
    const result = parseIdeasImport([recipe({ slug: undefined })]);
    expect(result.skipped[0].slug).toBe("рецепт №1");
  });
});

describe("parseIdeasImport — дубли и негодный файл", () => {
  it("второй рецепт с тем же slug пропускается как дубль в файле", () => {
    const result = parseIdeasImport([recipe(), recipe({ title: "Другое название" })]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].title).toBe("Сырники из творога");
    expect(result.skipped[0].reason).toBe("дубль в файле");
  });

  it("не массив в корне — файл негоден целиком", () => {
    expect(parseIdeasImport({ recipes: [] }).fatal).toContain("массив");
  });

  it("пустой массив — файл негоден целиком", () => {
    expect(parseIdeasImport([]).fatal).toContain("пустой");
  });

  it("больше лимита рецептов — файл негоден целиком", () => {
    const many = Array.from({ length: MAX_IMPORT_RECIPES + 1 }, (_, i) => recipe({ slug: `r-${i}` }));
    expect(parseIdeasImport(many).fatal).toContain(String(MAX_IMPORT_RECIPES));
  });
});

describe("parseIdeaRecipe — правка в админке", () => {
  it("принимает годный рецепт", () => {
    const result = parseIdeaRecipe(recipe());
    expect(result.ok).toBe(true);
  });

  it("отдаёт причину отказа строкой", () => {
    const result = parseIdeaRecipe(recipe({ cooking_time_minutes: 0 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("cooking_time_minutes");
  });

  it("не объект — внятный отказ, а не падение", () => {
    const result = parseIdeaRecipe("строка");
    expect(result.ok).toBe(false);
  });
});
