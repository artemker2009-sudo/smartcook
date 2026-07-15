// Санитизация и лимиты списка продуктов, который пользователь правит руками
// после фото-распознавания (удалил чип / дописал свой продукт).
//
// Этот список уходит в промпт OpenAI (/api/recipe, /api/regenerate), поэтому
// правило 5 CLAUDE.md: обрезаем длину, чистим управляющие символы, ограничиваем
// размер списка ДО вызова модели. Файл общий для клиента и сервера — сервер не
// доверяет клиентским лимитам и применяет те же правила ещё раз.

export const MAX_PRODUCT_LENGTH = 50;
export const MAX_PRODUCTS = 20;

/**
 * Приводит одну строку-продукт к безопасному виду: убирает управляющие символы
 * (включая переводы строк из вставки буфера), схлопывает пробелы, обрезает до
 * MAX_PRODUCT_LENGTH. Возвращает "" для мусора — такой продукт не добавляем.
 */
export function sanitizeProduct(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PRODUCT_LENGTH)
    .trim();
}

/** Сравнение продуктов для защиты от дублей: регистр и пробелы не важны. */
function sameProduct(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export type AddProductResult =
  | { ok: true; products: string[] }
  | { ok: false; reason: "empty" | "limit" | "duplicate" };

/**
 * Добавляет продукт к списку с учётом лимитов. Никаких сетевых вызовов:
 * дописывание продукта НЕ дёргает OpenAI, генерация — только по явной кнопке.
 */
export function addProduct(products: string[], raw: string): AddProductResult {
  const value = sanitizeProduct(raw);
  if (!value) return { ok: false, reason: "empty" };
  if (products.some((p) => sameProduct(p, value))) return { ok: false, reason: "duplicate" };
  if (products.length >= MAX_PRODUCTS) return { ok: false, reason: "limit" };
  return { ok: true, products: [...products, value] };
}

/**
 * Серверная нормализация списка: чистит каждый элемент, выкидывает пустые и
 * дубли, режет список до MAX_PRODUCTS. Клиент мог быть подделан — роуты гоняют
 * список через эту функцию перед промптом.
 */
export function sanitizeProductList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const result: string[] = [];
  for (const item of raw) {
    const value = sanitizeProduct(item);
    if (!value) continue;
    if (result.some((p) => sameProduct(p, value))) continue;
    result.push(value);
    if (result.length >= MAX_PRODUCTS) break;
  }
  return result;
}
