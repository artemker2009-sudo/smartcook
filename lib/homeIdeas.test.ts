import { describe, expect, it } from "vitest";
import type { IdeaCard } from "./ideasFeed";
import {
  HOME_IDEAS_COUNT,
  homeIdeaCandidates,
  mskDateKey,
  pickDailyIdeas,
  seedFromDateKey,
} from "./homeIdeas";

function card(slug: string, thumb: string | null = `thumb/${slug}.webp`): IdeaCard {
  return {
    slug,
    title: slug,
    cookingTimeMinutes: 20,
    meals: [],
    mainProduct: "курица",
    allergens: [],
    family: null,
    tags: [],
    imageUrl: `ideas/${slug}.webp`,
    thumbUrl: thumb,
    imageAspect: "square",
    sortWeight: 0,
    publishedAt: null,
    ingredientNames: [],
  };
}

const catalog = Array.from({ length: 40 }, (_, i) => card(`recipe-${i}`));

describe("дата набора", () => {
  it("считается по МСК, а не по UTC", () => {
    // 22:30 UTC — в Москве уже следующие сутки.
    expect(mskDateKey(new Date("2026-09-23T22:30:00Z"))).toBe("2026-09-24");
    expect(mskDateKey(new Date("2026-09-23T20:59:00Z"))).toBe("2026-09-23");
  });

  it("соседние дни дают непохожие сиды", () => {
    const a = seedFromDateKey("2026-09-23");
    const b = seedFromDateKey("2026-09-24");
    expect(a).not.toBe(b);
    // Разница не в единицу: иначе тасовка соседних дней давала бы почти тот же
    // порядок и набор «менялся» бы одной карточкой.
    expect(Math.abs(a - b)).toBeGreaterThan(1000);
  });
});

describe("набор дня", () => {
  it("одна дата — один и тот же набор (SSR совпадёт с клиентом)", () => {
    const first = pickDailyIdeas(catalog, "2026-09-23").map((c) => c.slug);
    const second = pickDailyIdeas(catalog, "2026-09-23").map((c) => c.slug);
    expect(first).toEqual(second);
    expect(first).toHaveLength(HOME_IDEAS_COUNT);
  });

  it("другая дата — другой набор", () => {
    const today = pickDailyIdeas(catalog, "2026-09-23").map((c) => c.slug);
    const tomorrow = pickDailyIdeas(catalog, "2026-09-24").map((c) => c.slug);
    expect(today).not.toEqual(tomorrow);
  });

  it("карточки в наборе не повторяются", () => {
    for (const day of ["2026-09-23", "2026-09-24", "2026-10-01", "2027-01-01"]) {
      const slugs = pickDailyIdeas(catalog, day).map((c) => c.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it("берёт только рецепты с миниатюрой", () => {
    const mixed = [card("a", null), card("b"), card("c", null), card("d"), card("e")];
    expect(homeIdeaCandidates(mixed).map((c) => c.slug)).toEqual(["b", "d", "e"]);
    expect(pickDailyIdeas(mixed, "2026-09-23").every((c) => !!c.thumbUrl)).toBe(true);
  });

  it("каталог меньше четырёх — отдаёт что есть, а не падает", () => {
    expect(pickDailyIdeas([card("a"), card("b")], "2026-09-23")).toHaveLength(2);
    expect(pickDailyIdeas([], "2026-09-23")).toEqual([]);
  });

  it("новый рецепт в каталоге не перетасовывает всю сегодняшнюю четвёрку", () => {
    // Частичная тасовка: публикация одной строки не должна менять набор дня
    // целиком — иначе каждая публикация переписывала бы Главную у всех.
    const before = pickDailyIdeas(catalog, "2026-09-23").map((c) => c.slug);
    const after = pickDailyIdeas([...catalog, card("recipe-new")], "2026-09-23").map((c) => c.slug);
    const kept = after.filter((slug) => before.includes(slug));
    expect(kept.length).toBeGreaterThanOrEqual(HOME_IDEAS_COUNT - 1);
  });
});
