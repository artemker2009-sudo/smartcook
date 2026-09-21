import { describe, expect, it } from "vitest";
// Внутри lib/ импортируем соседей относительным путём: алиас @/ в vitest не резолвится.
import {
  EMPTY_FILTERS,
  FAMILY_GAP,
  QUICK_MAX_MINUTES,
  applyFilters,
  cardHeightUnits,
  filtersToQuery,
  hasAnyFilter,
  orderCards,
  parseFilters,
  BACKGROUND_RESET_MS,
  reuseOrder,
  shouldStartNewVisit,
  spaceOutFamilies,
  splitIntoColumns,
  toIdeaCard,
  IDEA_FEED_COLUMNS,
  type IdeaCard,
} from "./ideasFeed";
import { buildTasteMatcher } from "./ideasTaste";

function card(slug: string, extra: Partial<IdeaCard> = {}): IdeaCard {
  return {
    slug,
    title: slug,
    cookingTimeMinutes: 20,
    meals: ["обед"],
    mainProduct: "курица",
    allergens: [],
    tags: [],
    family: null,
    imageUrl: `https://example/${slug}.webp`,
    thumbUrl: null,
    imageAspect: "square",
    sortWeight: 0,
    publishedAt: "2026-09-20T00:00:00Z",
    ingredientNames: [],
    ...extra,
  };
}

const many = (n: number, extra: (i: number) => Partial<IdeaCard> = () => ({})) =>
  Array.from({ length: n }, (_, i) => card(`r-${i}`, extra(i)));

describe("toIdeaCard", () => {
  const raw = {
    slug: "syrniki",
    title: "Сырники",
    cooking_time_minutes: 25,
    meals: ["завтрак"],
    main_product: "без мяса",
    allergens: ["молоко"],
    family: "syrniki",
    image_url: "https://example/a.webp",
    image_aspect: "portrait",
    sort_weight: 10,
    published_at: "2026-09-20T00:00:00Z",
    ingredients: [{ name: "Творог", amount: "400 г" }, { name: "Яйцо", amount: "1 шт" }],
  };

  // В ленту уходит восемьдесят карточек: количества ингредиентов нужны экрану
  // рецепта, а здесь это чистый лишний вес в пейлоаде.
  it("оставляет только названия ингредиентов, без количеств", () => {
    expect(toIdeaCard(raw)?.ingredientNames).toEqual(["Творог", "Яйцо"]);
  });

  it("рецепт без картинки в ленту не попадает", () => {
    expect(toIdeaCard({ ...raw, image_url: null })).toBeNull();
  });

  it("неизвестный аспект считается квадратом", () => {
    expect(toIdeaCard({ ...raw, image_aspect: "что-то" })?.imageAspect).toBe("square");
  });
});

describe("фильтры в адресе", () => {
  const params = (q: string) => new URLSearchParams(q);

  it("читает латинские значения и переводит в русские", () => {
    const f = parseFilters(params("meal=breakfast&main=fish&max=30&fit=1"));
    expect(f).toEqual({ meal: "завтрак", mainProduct: "рыба", quick: true, fit: true });
  });

  it("мусор в адресе не ломает ленту", () => {
    expect(parseFilters(params("meal=полдник&main=единорог"))).toEqual(EMPTY_FILTERS);
    expect(parseFilters(params(""))).toEqual(EMPTY_FILTERS);
  });

  it("собирает адрес обратно и не пишет пустое", () => {
    expect(filtersToQuery(EMPTY_FILTERS)).toBe("");
    expect(filtersToQuery({ meal: "ужин", mainProduct: null, quick: true, fit: false })).toBe(
      "meal=dinner&max=30",
    );
  });

  it("разбор и сборка — обратные друг другу", () => {
    const f = { meal: "перекус", mainProduct: "без мяса", quick: true, fit: true };
    expect(parseFilters(params(filtersToQuery(f)))).toEqual(f);
  });

  it("hasAnyFilter видит любой включённый фильтр", () => {
    expect(hasAnyFilter(EMPTY_FILTERS)).toBe(false);
    expect(hasAnyFilter({ ...EMPTY_FILTERS, quick: true })).toBe(true);
  });
});

describe("applyFilters", () => {
  const cards = [
    card("a", { meals: ["завтрак"], mainProduct: "без мяса", cookingTimeMinutes: 15 }),
    card("b", { meals: ["обед", "ужин"], mainProduct: "курица", cookingTimeMinutes: 45 }),
    card("c", { meals: ["ужин"], mainProduct: "рыба", cookingTimeMinutes: 30 }),
  ];

  it("приём пищи — по вхождению в массив", () => {
    expect(applyFilters(cards, { ...EMPTY_FILTERS, meal: "ужин" }, null).map((c) => c.slug)).toEqual(
      ["b", "c"],
    );
  });

  it("главный продукт — точным совпадением", () => {
    expect(
      applyFilters(cards, { ...EMPTY_FILTERS, mainProduct: "рыба" }, null).map((c) => c.slug),
    ).toEqual(["c"]);
  });

  it("«до 30 минут» включает ровно тридцать", () => {
    const got = applyFilters(cards, { ...EMPTY_FILTERS, quick: true }, null).map((c) => c.slug);
    expect(got).toEqual(["a", "c"]);
    expect(QUICK_MAX_MINUTES).toBe(30);
  });

  it("фильтры складываются", () => {
    expect(
      applyFilters(cards, { ...EMPTY_FILTERS, meal: "ужин", quick: true }, null).map((c) => c.slug),
    ).toEqual(["c"]);
  });

  it("«подходит мне» без профиля ничего не режет", () => {
    expect(applyFilters(cards, { ...EMPTY_FILTERS, fit: true }, null)).toHaveLength(3);
  });

  it("«подходит мне» с профилем прячет по тегу и по ингредиенту", () => {
    const taste = buildTasteMatcher({ allergies: ["творог"], dislikes: ["авокадо"] });
    const list = [
      card("milk", { allergens: ["молоко"] }),
      card("avocado", { ingredientNames: ["Авокадо спелое"] }),
      card("ok", {}),
    ];
    expect(applyFilters(list, { ...EMPTY_FILTERS, fit: true }, taste).map((c) => c.slug)).toEqual([
      "ok",
    ]);
  });
});

describe("порядок", () => {
  it("детерминирован по сиду — на этом держится возврат из рецепта", () => {
    const cards = many(20);
    const a = orderCards(cards, { seed: 12345, seen: [] }).map((c) => c.slug);
    const b = orderCards(cards, { seed: 12345, seen: [] }).map((c) => c.slug);
    expect(a).toEqual(b);
  });

  it("другой сид — другой порядок", () => {
    const cards = many(20);
    const a = orderCards(cards, { seed: 1, seen: [] }).map((c) => c.slug);
    const b = orderCards(cards, { seed: 2, seen: [] }).map((c) => c.slug);
    expect(a).not.toEqual(b);
  });

  it("ни одна карточка не теряется и не дублируется", () => {
    const cards = many(30, (i) => ({ family: i % 3 === 0 ? "f" : null }));
    const out = orderCards(cards, { seed: 7, seen: ["r-1", "r-2"] });
    expect(out).toHaveLength(30);
    expect(new Set(out.map((c) => c.slug)).size).toBe(30);
  });

  it("открытые уезжают в конец", () => {
    const cards = many(10);
    const seen = ["r-0", "r-1", "r-2"];
    const out = orderCards(cards, { seed: 42, seen }).map((c) => c.slug);
    const tail = out.slice(-3);
    expect(new Set(tail)).toEqual(new Set(seen));
  });

  it("sort_weight поднимает наверх внутри своей группы", () => {
    const cards = [...many(9), card("top", { sortWeight: 100 })];
    expect(orderCards(cards, { seed: 3, seen: [] })[0].slug).toBe("top");
  });

  it("открытый рецепт не всплывает наверх даже с большим весом", () => {
    const cards = [...many(9), card("top", { sortWeight: 100 })];
    const out = orderCards(cards, { seed: 3, seen: ["top"] }).map((c) => c.slug);
    expect(out[out.length - 1]).toBe("top");
  });
});

describe("reuseOrder — заморозка порядка на заход", () => {
  // ПОЙМАНО ЖИВЫМ ПРОГОНОМ. Возврат из рецепта размонтирует ленту и монтирует
  // заново. Если порядок пересчитывать, открытый только что рецепт уже лежит в
  // списке просмотренных — и его карточка уезжает в конец прямо под пальцем, а
  // скролл встаёт в чужое место (в проверке: 900 → 567).
  it("возвращает сохранённый порядок дословно", () => {
    const cards = many(5);
    const saved = ["r-3", "r-0", "r-4", "r-1", "r-2"];
    expect(reuseOrder(cards, saved)?.map((c) => c.slug)).toEqual(saved);
  });

  it("порядок переживает то, что рецепт стал открытым", () => {
    const cards = many(6);
    const frozen = orderCards(cards, { seed: 99, seen: [] }).map((c) => c.slug);
    // Человек открыл первую карточку — сохранённый порядок не должен дрогнуть.
    const after = reuseOrder(cards, frozen)?.map((c) => c.slug);
    expect(after).toEqual(frozen);
  });

  it("каталог изменился — считаем заново, а не показываем призраков", () => {
    const cards = many(5);
    expect(reuseOrder(cards, ["r-0", "r-1"])).toBeNull();
    expect(reuseOrder(cards, ["r-0", "r-1", "r-2", "r-3", "нет-такого"])).toBeNull();
    expect(reuseOrder(cards, null)).toBeNull();
  });
});

describe("shouldStartNewVisit — что считать новым заходом", () => {
  // ПОЙМАНО ПРИЁМКОЙ НА ТЕЛЕФОНЕ. Прежнее правило («сид живёт 6 часов»)
  // не срабатывало никогда: в приложении человек не перезагружает документ,
  // он сворачивает и разворачивает его, а для sessionStorage это не новый
  // заход. Лента не обновлялась вообще.
  it("обычное открытие и перезагрузка — новый заход", () => {
    for (const navigationType of ["navigate", "reload", "prerender", null, undefined]) {
      expect(
        shouldStartNewVisit({ isFirstMountInDocument: true, navigationType }),
        String(navigationType),
      ).toBe(true);
    }
  });

  it("кнопка «назад» — порядок сохраняем", () => {
    expect(
      shouldStartNewVisit({ isFirstMountInDocument: true, navigationType: "back_forward" }),
    ).toBe(false);
  });

  // Тип навигации описывает ЗАГРУЗКУ ДОКУМЕНТА и при мягком переходе не
  // меняется. Без флага первого монтирования возврат из рецепта считался бы
  // новым заходом и перемешивал ленту под пальцем — то есть мы бы сломали то,
  // что чинили прошлым PR.
  it("мягкий переход внутри приложения порядок не трогает", () => {
    expect(
      shouldStartNewVisit({ isFirstMountInDocument: false, navigationType: "navigate" }),
    ).toBe(false);
    expect(
      shouldStartNewVisit({ isFirstMountInDocument: false, navigationType: "reload" }),
    ).toBe(false);
  });

  it("возврат из фона дольше получаса — новый заход", () => {
    expect(
      shouldStartNewVisit({ isFirstMountInDocument: false, hiddenMs: BACKGROUND_RESET_MS + 1 }),
    ).toBe(true);
    expect(
      shouldStartNewVisit({ isFirstMountInDocument: false, hiddenMs: BACKGROUND_RESET_MS }),
    ).toBe(true);
  });

  it("короткая отлучка — тот же заход", () => {
    expect(shouldStartNewVisit({ isFirstMountInDocument: false, hiddenMs: 60_000 })).toBe(false);
    expect(shouldStartNewVisit({ isFirstMountInDocument: false, hiddenMs: null })).toBe(false);
  });

  it("долгий фон сильнее «назад»: вернулся через час — лента свежая", () => {
    expect(
      shouldStartNewVisit({
        isFirstMountInDocument: true,
        navigationType: "back_forward",
        hiddenMs: BACKGROUND_RESET_MS + 1,
      }),
    ).toBe(true);
  });
});

describe("разведение семейств", () => {
  it("на большом каталоге держит дистанцию", () => {
    const cards = [
      ...Array.from({ length: 4 }, (_, i) => card(`syr-${i}`, { family: "syrniki" })),
      ...many(20),
    ];
    const out = spaceOutFamilies(cards);
    const positions = out
      .map((c, i) => (c.family === "syrniki" ? i : -1))
      .filter((i) => i >= 0);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i] - positions[i - 1]).toBeGreaterThanOrEqual(FAMILY_GAP);
    }
  });

  // Три сырника на десять рецептов — наш нынешний каталог. Дистанцию выдержать
  // невозможно, и правило обязано ослабнуть, а не уронить ленту.
  it("на маленьком каталоге ослабляется, но ничего не теряет", () => {
    const cards = [
      ...Array.from({ length: 3 }, (_, i) => card(`syr-${i}`, { family: "syrniki" })),
      ...many(3),
    ];
    const out = spaceOutFamilies(cards);
    expect(out).toHaveLength(6);
    expect(new Set(out.map((c) => c.slug)).size).toBe(6);
  });

  it("рецепты без семейства не трогает", () => {
    const cards = many(5);
    expect(spaceOutFamilies(cards).map((c) => c.slug)).toEqual(cards.map((c) => c.slug));
  });
});

describe("раскладка по колонкам", () => {
  it("вертикаль выше квадрата — от этого и берётся разная высота колонок", () => {
    expect(cardHeightUnits("portrait")).toBeGreaterThan(cardHeightUnits("square"));
  });

  it("порядок внутри колонки сохраняется", () => {
    const cards = many(6);
    const [left] = splitIntoColumns(cards, 2);
    const order = left.map((c) => Number(c.slug.split("-")[1]));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("ни одна карточка не теряется при любом числе колонок", () => {
    const cards = many(17, (i) => ({ imageAspect: i % 3 === 0 ? "portrait" : "square" }));
    for (const columns of [1, 2, 3, 4]) {
      const cols = splitIntoColumns(cards, columns);
      expect(cols).toHaveLength(columns);
      expect(cols.flat()).toHaveLength(17);
      expect(new Set(cols.flat().map((c) => c.slug)).size).toBe(17);
    }
  });

  // Смысл раскладки: колонки не должны разъезжаться по высоте, иначе внизу
  // ленты появится длинный хвост одной колонки — та самая «дыра».
  it("колонки не расходятся по высоте больше чем на одну карточку", () => {
    const cards = many(24, (i) => ({ imageAspect: i % 2 === 0 ? "portrait" : "square" }));
    for (const columns of [2, 3, 4]) {
      const heights = splitIntoColumns(cards, columns).map((col) =>
        col.reduce((sum, c) => sum + cardHeightUnits(c.imageAspect), 0),
      );
      const spread = Math.max(...heights) - Math.min(...heights);
      expect(spread, `колонок ${columns}`).toBeLessThanOrEqual(cardHeightUnits("portrait"));
    }
  });

  it("карточек меньше, чем колонок — пустые колонки, но без падения", () => {
    const cols = splitIntoColumns(many(2), 4);
    expect(cols.flat()).toHaveLength(2);
    expect(cols.filter((c) => c.length === 0)).toHaveLength(2);
  });
});

describe("миниатюра в карточке ленты", () => {
  const SB = "https://yjfqwwiqwoighjdlkodg.supabase.co/storage/v1/object/public/recipe-images";
  const base = {
    slug: "tefteli", title: "Тефтели", cooking_time_minutes: 50, meals: ["обед"], main_product: "мясо",
    allergens: [], family: null, image_aspect: "square", sort_weight: 0, published_at: null, ingredients: [],
    image_url: `${SB}/ideas/tefteli-1789918526569.webp`,
  };

  it("колонка thumb_url в явном списке ленты", () => {
    expect(IDEA_FEED_COLUMNS.split(",")).toContain("thumb_url");
  });

  it("миниатюра от этой картинки попадает в карточку", () => {
    const card = toIdeaCard({ ...base, thumb_url: `${SB}/ideas/thumb/tefteli-1789918526569.webp` });
    expect(card?.thumbUrl).toBe(`${SB}/ideas/thumb/tefteli-1789918526569.webp`);
    expect(card?.imageUrl).toBe(base.image_url);
  });

  it("миниатюра от прежней картинки отбрасывается — карточка покажет оригинал", () => {
    const card = toIdeaCard({ ...base, thumb_url: `${SB}/ideas/thumb/tefteli-1700000000000.webp` });
    expect(card?.thumbUrl).toBeNull();
  });

  it("миниатюры нет — null, не undefined", () => {
    expect(toIdeaCard({ ...base, thumb_url: null })?.thumbUrl).toBeNull();
    expect(toIdeaCard(base)?.thumbUrl).toBeNull();
  });
});
