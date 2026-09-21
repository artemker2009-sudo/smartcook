import { describe, it, expect } from "vitest";
import { relatedIdeas } from "./ideasRelated";
import type { IdeaCard } from "./ideasFeed";

function card(over: Partial<IdeaCard> & { slug: string }): IdeaCard {
  return {
    title: over.slug,
    cookingTimeMinutes: 30,
    meals: ["обед"],
    mainProduct: "курица",
    allergens: [],
    family: null,
    tags: [],
    imageUrl: `https://example.test/${over.slug}.webp`,
    thumbUrl: null,
    imageAspect: "square",
    sortWeight: 0,
    publishedAt: "2026-09-19T12:00:00Z",
    ingredientNames: [],
    ...over,
  };
}

describe("«Другие варианты» (то же семейство)", () => {
  it("берёт семейство и выкидывает сам рецепт", () => {
    const current = card({ slug: "syrniki", family: "syrniki" });
    const all = [current, card({ slug: "syrniki-v-duhovke", family: "syrniki" })];
    const { family } = relatedIdeas(current, all);
    expect(family.map((c) => c.slug)).toEqual(["syrniki-v-duhovke"]);
  });

  it("без семейства блок пуст — писать «вариантов нет» не будем", () => {
    const current = card({ slug: "syrniki", family: null });
    const all = [current, card({ slug: "omlet", family: "omlet" })];
    expect(relatedIdeas(current, all).family).toEqual([]);
  });

  it("семейство из одного рецепта — это сам рецепт, блока нет", () => {
    const current = card({ slug: "syrniki", family: "syrniki" });
    expect(relatedIdeas(current, [current]).family).toEqual([]);
  });
});

describe("«Похожие идеи»", () => {
  it("главный продукт весит больше одного общего тега", () => {
    const current = card({ slug: "a", mainProduct: "курица", tags: ["быстро", "духовка"] });
    const all = [
      current,
      card({ slug: "по-продукту", mainProduct: "курица", tags: [] }),
      card({ slug: "по-тегу", mainProduct: "рыба", tags: ["быстро"] }),
    ];
    expect(relatedIdeas(current, all).similar.map((c) => c.slug)).toEqual([
      "по-продукту",
      "по-тегу",
    ]);
  });

  it("совсем непохожее не берём, даже если место осталось", () => {
    const current = card({ slug: "a", mainProduct: "курица", tags: ["быстро"] });
    const all = [current, card({ slug: "чужое", mainProduct: "рыба", tags: ["долго"] })];
    expect(relatedIdeas(current, all).similar).toEqual([]);
  });

  it("не дублирует то, что уже показано в «Других вариантах»", () => {
    const current = card({ slug: "a", family: "f", mainProduct: "курица" });
    const all = [current, card({ slug: "брат", family: "f", mainProduct: "курица" })];
    const result = relatedIdeas(current, all);
    expect(result.family.map((c) => c.slug)).toEqual(["брат"]);
    expect(result.similar).toEqual([]);
  });

  it("всего не больше шести карточек на оба блока", () => {
    const current = card({ slug: "a", family: "f", mainProduct: "курица" });
    const all = [
      current,
      ...Array.from({ length: 4 }, (_, i) => card({ slug: `f${i}`, family: "f" })),
      ...Array.from({ length: 5 }, (_, i) => card({ slug: `s${i}`, mainProduct: "курица" })),
    ];
    const { family, similar } = relatedIdeas(current, all);
    expect(family.length + similar.length).toBe(6);
    expect(family).toHaveLength(4);
  });

  it("порядок детерминирован: одинаковый вес разводится slug'ом", () => {
    // Иначе сервер и клиент отрисовали бы разный порядок и React выбросил бы
    // серверную разметку.
    const current = card({ slug: "a", mainProduct: "курица" });
    const all = [current, card({ slug: "ббб" }), card({ slug: "ааа" })];
    const first = relatedIdeas(current, all).similar.map((c) => c.slug);
    const second = relatedIdeas(current, [...all].reverse()).similar.map((c) => c.slug);
    expect(first).toEqual(second);
    expect(first).toEqual(["ааа", "ббб"]);
  });
});
