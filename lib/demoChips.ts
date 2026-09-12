// Демо-чипы главной (H8 «магия без фото»). Тап по чипу → мгновенный рецепт из
// кэша блюд (тип B) тем же механизмом, что текстовый поиск, БЕЗ камеры,
// регистрации и без обращения к OpenAI (см. cacheOnly в /api/search-recipe).
//
// label — продукт(ы), понятные аудитории 35–65; key — ТОЧНЫЙ нормализованный
// ключ прогретого блюда в dish_cache.query_key (нормализация идемпотентна, так
// что key уходит в поиск как query и гарантированно попадает в кэш). На главной
// показываем ТОЛЬКО те чипы, чей key реально есть в кэше (проверка на сервере,
// getAvailableDemoChips) — если блюда в кэше нет, чип не рисуем.
//
// products — то, что человек «принёс с собой», тапнув чип: на чипе написано
// «Курица + гречка», значит курица и гречка у него есть. Из кэша приходит
// готовый рецепт (тип B), продуктов в нём нет, и без этого поля блок «Что
// нужно купить» предложил бы купить в том числе то, что нарисовано на чипе.

export type DemoChip = { key: string; label: string; emoji: string; products: string[] };

// Кандидаты. Ключи сверены с прод-кэшем (dish_cache, все type B / ready).
// Держим короткий, «бытовой» набор — быстрый рецепт из простых продуктов.
export const DEMO_CHIP_CANDIDATES: DemoChip[] = [
  { key: "гречка с курицей", label: "Курица + гречка", emoji: "🍗", products: ["курица", "гречка"] },
  { key: "оладьи из кабачков", label: "Кабачки", emoji: "🥒", products: ["кабачки"] },
  { key: "жареная картошка", label: "Картошка", emoji: "🥔", products: ["картошка"] },
  { key: "омлет", label: "Яйца", emoji: "🍳", products: ["яйца"] },
  { key: "сырники", label: "Творог", emoji: "🧀", products: ["творог"] },
];

/** Продукты чипа по его ключу: /search?demo=<ключ> знает только ключ. */
export function demoChipProducts(key: string): string[] {
  return DEMO_CHIP_CANDIDATES.find((c) => c.key === key)?.products ?? [];
}

// Пересечение кандидатов с реально прогретым кэшем. presentKeys — множество
// query_key из dish_cache (читается публично). Порядок кандидатов сохраняем.
export function filterAvailableChips(presentKeys: Set<string>): DemoChip[] {
  return DEMO_CHIP_CANDIDATES.filter((c) => presentKeys.has(c.key));
}
