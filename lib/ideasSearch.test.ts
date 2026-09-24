import { describe, expect, it } from "vitest";

import {
  buildSearchEntries,
  queryStems,
  sanitizeIdeasQuery,
  searchCards,
  MAX_IDEAS_QUERY_LENGTH,
} from "./ideasSearch";
import type { IdeaCard } from "./ideasFeed";

function card(over: Partial<IdeaCard> & { slug: string; title: string }): IdeaCard {
  return {
    cookingTimeMinutes: 20,
    meals: ["обед"],
    mainProduct: "без мяса",
    allergens: [],
    family: null,
    tags: [],
    imageUrl: "/img/x.jpg",
    thumbUrl: null,
    imageAspect: "square",
    sortWeight: 0,
    publishedAt: null,
    ingredientNames: [],
    ...over,
  };
}

const CATALOG: IdeaCard[] = [
  card({
    slug: "salat-s-rukkoloj",
    title: "Салат с рукколой и креветками",
    ingredientNames: ["руккола", "креветки", "оливковое масло"],
    tags: ["лёгкое"],
  }),
  card({
    slug: "pasta",
    title: "Паста с томатами",
    ingredientNames: ["спагетти", "помидоры", "рукколой посыпать"],
  }),
  card({
    slug: "syrniki",
    title: "Сырники на завтрак",
    meals: ["завтрак"],
    ingredientNames: ["творог", "яйцо", "мука"],
    tags: ["пп"],
  }),
  card({
    slug: "kurinye-krylyshki",
    title: "Куриные крылышки в духовке",
    mainProduct: "курица",
    ingredientNames: ["крылышки", "мёд", "соевый соус"],
  }),
  card({
    slug: "sup-s-kuricej",
    title: "Суп с курицей",
    mainProduct: "курица",
    ingredientNames: ["курица", "картофель", "морковь"],
  }),
];

const ENTRIES = buildSearchEntries(CATALOG);

function slugs(query: string): string[] {
  return searchCards(ENTRIES, query).map((c) => c.slug);
}

describe("sanitizeIdeasQuery", () => {
  it("чистит управляющие символы и режет по длине", () => {
    expect(sanitizeIdeasQuery("  руккола\n")).toBe("руккола");
    expect(sanitizeIdeasQuery("а".repeat(80))).toHaveLength(MAX_IDEAS_QUERY_LENGTH);
    expect(sanitizeIdeasQuery(null)).toBe("");
  });
});

describe("queryStems", () => {
  it("окончание не имеет значения", () => {
    expect(queryStems("руккола")).toEqual(queryStems("рукколой"));
    expect(queryStems("рукколу")).toEqual(queryStems("руккола"));
  });

  it("пунктуация и регистр не имеют значения", () => {
    expect(queryStems("Руккола!!!")).toEqual(queryStems("руккола"));
  });

  it("пустой запрос — пустой набор", () => {
    expect(queryStems("")).toEqual([]);
    expect(queryStems("!!!")).toEqual([]);
  });
});

describe("searchCards", () => {
  it("находит по продукту в любом падеже — одинаково", () => {
    const expected = ["salat-s-rukkoloj", "pasta"];
    expect(slugs("руккола")).toEqual(expected);
    expect(slugs("рукколой")).toEqual(expected);
    expect(slugs("рукколу")).toEqual(expected);
  });

  it("совпадение в названии выше, чем в составе", () => {
    // У салата руккола и в названии, и в составе; у пасты — только в составе.
    expect(slugs("руккола")[0]).toBe("salat-s-rukkoloj");
  });

  it("находит по названию блюда", () => {
    expect(slugs("сырники")).toEqual(["syrniki"]);
    expect(slugs("сырник")).toEqual(["syrniki"]);
  });

  it("«курица» находит и «Куриные крылышки»", () => {
    // Стеммер сам по себе не связывает «курицу» с «куриными»: разные корни.
    // Связку даёт главный продукт каталога — ради этого он и в индексе.
    expect(slugs("курица").sort()).toEqual(["kurinye-krylyshki", "sup-s-kuricej"]);
    expect(slugs("курицей").sort()).toEqual(["kurinye-krylyshki", "sup-s-kuricej"]);
  });

  it("находит по тегу", () => {
    expect(slugs("пп")).toEqual(["syrniki"]);
  });

  it("находит по началу слова — человек ищет на ходу", () => {
    expect(slugs("рукк")).toEqual(["salat-s-rukkoloj", "pasta"]);
  });

  it("бессмыслица не находит ничего", () => {
    expect(slugs("ыыы")).toEqual([]);
    expect(slugs("вертолёт")).toEqual([]);
  });

  it("несколько слов складываются по И", () => {
    expect(slugs("суп курица")).toEqual(["sup-s-kuricej"]);
    // «салат» есть только у одной карточки, «творог» — у другой: вместе пусто.
    expect(slugs("салат творог")).toEqual([]);
  });

  it("пустой запрос отдаёт всё в исходном порядке", () => {
    expect(slugs("")).toEqual(CATALOG.map((c) => c.slug));
    expect(slugs("   ")).toEqual(CATALOG.map((c) => c.slug));
  });
});
