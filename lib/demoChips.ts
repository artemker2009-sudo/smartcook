// Демо-чипы главной (H8 «магия без фото»). Тап по чипу → мгновенный рецепт из
// кэша блюд (тип B) тем же механизмом, что текстовый поиск, БЕЗ камеры,
// регистрации и без обращения к OpenAI (см. cacheOnly в /api/search-recipe).
//
// label — продукт(ы), понятные аудитории 35–65; key — ТОЧНЫЙ нормализованный
// ключ прогретого блюда в dish_cache.query_key (нормализация идемпотентна, так
// что key уходит в поиск как query и гарантированно попадает в кэш). На главной
// показываем ТОЛЬКО те чипы, чей key реально есть в кэше (проверка на сервере,
// getAvailableDemoChips) — если блюда в кэше нет, чип не рисуем.

export type DemoChip = { key: string; label: string; emoji: string };

// Кандидаты. Ключи сверены с прод-кэшем (dish_cache, все type B / ready).
// Держим короткий, «бытовой» набор — быстрый рецепт из простых продуктов.
export const DEMO_CHIP_CANDIDATES: DemoChip[] = [
  { key: "гречка с курицей", label: "Курица + гречка", emoji: "🍗" },
  { key: "оладьи из кабачков", label: "Кабачки", emoji: "🥒" },
  { key: "жареная картошка", label: "Картошка", emoji: "🥔" },
  { key: "омлет", label: "Яйца", emoji: "🍳" },
  { key: "сырники", label: "Творог", emoji: "🧀" },
];

// Пересечение кандидатов с реально прогретым кэшем. presentKeys — множество
// query_key из dish_cache (читается публично). Порядок кандидатов сохраняем.
export function filterAvailableChips(presentKeys: Set<string>): DemoChip[] {
  return DEMO_CHIP_CANDIDATES.filter((c) => presentKeys.has(c.key));
}
