import { describe, it, expect } from "vitest";
import { IDEA_RECIPE_COLUMNS, isValidIdeaSlug, toIdeaRecipe } from "./ideaRecipe";

const row = {
  slug: "tefteli-v-tomatnom-souse",
  title: "Тефтели в томатном соусе",
  description: "Домашние тефтели",
  servings: 4,
  cooking_time_minutes: 45,
  ingredients: [{ name: "Фарш", amount: "500 г" }, { name: "Соль", amount: "по вкусу" }],
  steps: ["Смешать фарш", "Тушить"],
  meals: ["обед", "ужин"],
  main_product: "мясо",
  tags: ["тушёное"],
  family: null,
  image_url: "https://example.test/t.webp",
  image_aspect: "square",
};

describe("разбор строки каталога", () => {
  it("читает рецепт целиком", () => {
    const recipe = toIdeaRecipe(row);
    expect(recipe?.servings).toBe(4);
    expect(recipe?.ingredients).toHaveLength(2);
    expect(recipe?.steps).toEqual(["Смешать фарш", "Тушить"]);
    expect(recipe?.imageAspect).toBe("square");
  });

  it("без картинки, шагов или продуктов показывать нечего → null → 404", () => {
    expect(toIdeaRecipe({ ...row, image_url: null })).toBeNull();
    expect(toIdeaRecipe({ ...row, steps: [] })).toBeNull();
    expect(toIdeaRecipe({ ...row, ingredients: [] })).toBeNull();
    expect(toIdeaRecipe(null)).toBeNull();
  });

  it("нулевые порции не превращают множитель в бесконечность", () => {
    expect(toIdeaRecipe({ ...row, servings: 0 })?.servings).toBe(1);
  });

  it("не тащит в пейлоад лишних колонок", () => {
    // Всё, что попадёт в проп клиентского компонента, уезжает в RSC-пейлоад
    // браузера. Полей публикации и служебных весов там быть не должно.
    for (const forbidden of ["is_published", "published_at", "sort_weight", "session_id", "*"]) {
      expect(IDEA_RECIPE_COLUMNS).not.toContain(forbidden);
    }
  });
});

describe("slug из адреса", () => {
  it("пропускает нормальный", () => {
    expect(isValidIdeaSlug("tefteli-v-tomatnom-souse")).toBe(true);
  });

  it("не пропускает мусор в строку запроса", () => {
    for (const bad of ["../secret", "a b", "Тефтели", "a,b", "a*", "-a", "a-", ""]) {
      expect(isValidIdeaSlug(bad)).toBe(false);
    }
  });
});
