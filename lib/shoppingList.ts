// Умный список покупок — MVP этап 1. Хранение ТОЛЬКО в localStorage на
// устройстве (для гостей и залогиненных одинаково). Синхронизации между
// устройствами тут нет — это отдельный этап после 18.08.
//
// Файл общий для клиента и сервера: серверный роут /api/shopping/sort
// использует те же лимиты, список отделов и сборку групп, НЕ доверяя клиенту
// (правило 5 CLAUDE.md — лимиты применяются и на сервере ещё раз).

// Защита расходов OpenAI: не больше стольки позиций и стольки символов на
// позицию уходит в промпт. Совпадает с проверкой в /api/shopping/sort.
export const MAX_SHOPPING_ITEMS = 60;
export const MAX_SHOPPING_ITEM_LENGTH = 50;

// Ключи localStorage. Версия в имени — чтобы будущая смена формата не ломала
// старые устройства (просто заведём _v2).
export const SHOPPING_STORAGE_KEY = "smartcook_shopping_list_v1";
export const SHOPPING_SORT_CACHE_KEY = "smartcook_shopping_sort_v1";

// Событие «список изменился» — чтобы открытая вкладка /shopping и добавление из
// экрана рецепта не рассинхронились. Слушатель перечитывает localStorage.
export const SHOPPING_CHANGED_EVENT = "smartcook:shopping-changed";

// Отделы магазина в порядке обхода зала — по нему строим и выводим группы.
// «Прочее» всегда последним: туда падает всё, что модель не отнесла.
export const SHOPPING_DEPARTMENTS = [
  "Овощи-фрукты",
  "Молочное",
  "Мясо-рыба",
  "Бакалея",
  "Заморозка",
  "Хлеб",
  "Напитки",
  "Хозтовары",
  "Прочее",
] as const;

export type ShoppingDepartment = (typeof SHOPPING_DEPARTMENTS)[number];

export const OTHER_DEPARTMENT: ShoppingDepartment = "Прочее";

export type ShoppingItem = {
  id: string;
  name: string;
  checked: boolean;
};

export type ShoppingGroup = {
  department: ShoppingDepartment;
  items: string[];
};

export type AddNamesResult = {
  items: ShoppingItem[];
  added: number;
  duplicate: number;
  limited: boolean;
};

/**
 * Приводит одну позицию к безопасному виду: убирает управляющие символы
 * (в т.ч. переводы строк из буфера), схлопывает пробелы, режет до
 * MAX_SHOPPING_ITEM_LENGTH. Возвращает "" для мусора — такую позицию не берём.
 */
export function sanitizeShoppingName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SHOPPING_ITEM_LENGTH)
    .trim();
}

/** Сравнение позиций для защиты от дублей: регистр и пробелы не важны. */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Запятая = несколько продуктов сразу (как в редакторе продуктов после фото). */
export function parseNames(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => sanitizeShoppingName(part))
    .filter(Boolean);
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Добавляет массив названий к списку с дедупликацией по названию и лимитом
 * MAX_SHOPPING_ITEMS. Никаких сетевых вызовов — умная сортировка только по
 * явной кнопке.
 */
export function addNames(items: ShoppingItem[], names: string[]): AddNamesResult {
  let next = items;
  let added = 0;
  let duplicate = 0;
  let limited = false;

  for (const raw of names) {
    const name = sanitizeShoppingName(raw);
    if (!name) continue;
    if (next.some((it) => sameName(it.name, name))) {
      duplicate++;
      continue;
    }
    if (next.length >= MAX_SHOPPING_ITEMS) {
      limited = true;
      break;
    }
    next = [...next, { id: newId(), name, checked: false }];
    added++;
  }

  return { items: next, added, duplicate, limited };
}

/** Разбирает строку ввода (с запятыми) и добавляет позиции к списку. */
export function addFromInput(items: ShoppingItem[], raw: string): AddNamesResult {
  return addNames(items, parseNames(raw));
}

// --- localStorage (только клиент; на сервере — no-op / пустой список) ---

export function loadItems(): ShoppingItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(SHOPPING_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const items: ShoppingItem[] = [];
    for (const raw of parsed) {
      if (!raw || typeof raw !== "object") continue;
      const name = sanitizeShoppingName((raw as { name?: unknown }).name);
      if (!name) continue;
      if (items.some((it) => sameName(it.name, name))) continue;
      items.push({
        id: typeof (raw as { id?: unknown }).id === "string" ? (raw as { id: string }).id : newId(),
        name,
        checked: Boolean((raw as { checked?: unknown }).checked),
      });
      if (items.length >= MAX_SHOPPING_ITEMS) break;
    }
    return items;
  } catch {
    return [];
  }
}

export function saveItems(items: ShoppingItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SHOPPING_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(SHOPPING_CHANGED_EVENT));
  } catch {
    // Приватный режим / переполненное хранилище — молча игнорируем, список
    // просто не переживёт перезагрузку. Ломать сценарий покупок из-за этого нельзя.
  }
}

/**
 * Добавляет позиции прямо в localStorage — удобно для экрана рецепта, где
 * компонента списка не смонтирована. Возвращает результат (сколько добавлено).
 */
export function addNamesToStorage(names: string[]): AddNamesResult {
  const result = addNames(loadItems(), names);
  if (result.added > 0) saveItems(result.items);
  return result;
}

// --- Кэш умной сортировки ---

// Подпись списка по названиям (без учёта галочек/порядка) — по ней решаем,
// можно ли отдать кэш вместо повторного вызова API. Вычёркивание позиции
// подпись НЕ меняет, добавление/удаление — меняет.
export function listSignature(items: ShoppingItem[]): string {
  return items
    .map((it) => it.name.trim().toLowerCase())
    .sort()
    .join("|");
}

export type SortCache = { sig: string; groups: ShoppingGroup[] };

export function loadSortCache(): SortCache | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(SHOPPING_SORT_CACHE_KEY) || "null");
    if (!parsed || typeof parsed.sig !== "string" || !Array.isArray(parsed.groups)) return null;
    return parsed as SortCache;
  } catch {
    return null;
  }
}

export function saveSortCache(cache: SortCache): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SHOPPING_SORT_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // см. saveItems — не критично.
  }
}

// --- Сборка групп (используется сервером) ---

/**
 * Строит упорядоченные группы из ОРИГИНАЛЬНЫХ названий и параллельного массива
 * отделов (departments[i] — отдел для names[i]). Гарантия безопасности: имена
 * берём только из входа (модель не может переименовать/добавить позицию),
 * неизвестный отдел падает в «Прочее». Пустые группы отбрасываем.
 */
export function buildGroups(names: string[], departments: Array<string | undefined>): ShoppingGroup[] {
  const allowed = new Set<string>(SHOPPING_DEPARTMENTS);
  const byDept = new Map<ShoppingDepartment, string[]>();

  names.forEach((name, i) => {
    const raw = departments[i];
    const dep: ShoppingDepartment = raw && allowed.has(raw) ? (raw as ShoppingDepartment) : OTHER_DEPARTMENT;
    const bucket = byDept.get(dep);
    if (bucket) bucket.push(name);
    else byDept.set(dep, [name]);
  });

  return SHOPPING_DEPARTMENTS.map((department) => ({
    department,
    items: byDept.get(department) || [],
  })).filter((group) => group.items.length > 0);
}

// --- Текстовое представление для «Скопировать список» ---

export function groupsToText(groups: ShoppingGroup[]): string {
  return groups
    .map((g) => `${g.department}:\n${g.items.map((name) => `• ${name}`).join("\n")}`)
    .join("\n\n");
}

export function itemsToText(items: ShoppingItem[]): string {
  return items.map((it) => `• ${it.name}`).join("\n");
}
