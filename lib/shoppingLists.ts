// Мультисписки покупок — «Покупки 2.0». БЕЗ БД: всё в localStorage устройства.
// Надстройка над примитивами lib/shoppingList.ts (позиция, санитайз, дедуп,
// сборка групп, кэш сортировки). Здесь — модель нескольких списков, миграция
// одиночного списка из MVP и CRUD.

import {
  MAX_SHOPPING_ITEMS,
  SHOPPING_CHANGED_EVENT,
  SHOPPING_SORT_CACHE_KEY,
  addNames,
  loadItems as loadLegacyItems,
  sameName,
  sanitizeShoppingName,
  type AddNamesResult,
  type ShoppingItem,
  type SortCache,
} from "./shoppingList";

// v2-хранилище. Старые ключи (v1) читаем только для одноразовой миграции.
export const SHOPPING_LISTS_KEY = "smartcook_shopping_lists_v2";

export const MAX_LIST_NAME_LENGTH = 60;
// Имя списка по умолчанию при миграции одиночного списka из MVP.
export const MIGRATED_LIST_NAME = "Мои покупки";

export type ShoppingListRecord = {
  id: string;
  name: string;
  createdAt: number; // epoch ms
  items: ShoppingItem[];
  sort?: SortCache | null;
};

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const RU_DAY_MONTH = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

/** «6 августа» — день и месяц для подписи карточки. */
export function formatListDate(createdAt: number): string {
  try {
    return RU_DAY_MONTH.format(new Date(createdAt));
  } catch {
    return "";
  }
}

/** Имя по умолчанию для нового списка: «Покупки, 6 августа». */
export function defaultListName(now: Date = new Date()): string {
  return `Покупки, ${RU_DAY_MONTH.format(now)}`;
}

/** Санитайз имени списка: без управляющих символов, схлопнутые пробелы, лимит длины. */
export function sanitizeListName(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const cleaned = raw
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LIST_NAME_LENGTH)
    .trim();
  return cleaned || fallback;
}

// Приводит один сырой элемент localStorage к безопасному ShoppingItem[].
function normalizeItems(raw: unknown): ShoppingItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ShoppingItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const name = sanitizeShoppingName((it as { name?: unknown }).name);
    if (!name) continue;
    if (items.some((x) => sameName(x.name, name))) continue;
    items.push({
      id: typeof (it as { id?: unknown }).id === "string" ? (it as { id: string }).id : newId(),
      name,
      checked: Boolean((it as { checked?: unknown }).checked),
    });
    if (items.length >= MAX_SHOPPING_ITEMS) break;
  }
  return items;
}

function normalizeSort(raw: unknown): SortCache | null {
  if (!raw || typeof raw !== "object") return null;
  const sig = (raw as { sig?: unknown }).sig;
  const groups = (raw as { groups?: unknown }).groups;
  if (typeof sig !== "string" || !Array.isArray(groups)) return null;
  return { sig, groups } as SortCache;
}

function normalizeList(raw: unknown): ShoppingListRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof (raw as { id?: unknown }).id === "string" ? (raw as { id: string }).id : newId();
  const name = sanitizeListName((raw as { name?: unknown }).name, MIGRATED_LIST_NAME);
  const createdAtRaw = (raw as { createdAt?: unknown }).createdAt;
  const createdAt = typeof createdAtRaw === "number" && Number.isFinite(createdAtRaw) ? createdAtRaw : Date.now();
  return {
    id,
    name,
    createdAt,
    items: normalizeItems((raw as { items?: unknown }).items),
    sort: normalizeSort((raw as { sort?: unknown }).sort),
  };
}

// Возвращает массив v2, если ключ уже существует; null — если ключа нет (тогда
// вызывающий запускает миграцию из v1).
function readListsRaw(): ShoppingListRecord[] | null {
  try {
    const raw = localStorage.getItem(SHOPPING_LISTS_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeList).filter((l): l is ShoppingListRecord => l !== null);
  } catch {
    return [];
  }
}

/**
 * Загружает все списки. Если v2-ключа ещё нет — одноразово мигрирует одиночный
 * список из MVP (v1) в первый список «Мои покупки», чтобы данные ранних
 * пользователей не потерялись. Пустой v1 → пустой набор (ничего не пишем).
 */
export function loadLists(): ShoppingListRecord[] {
  if (typeof window === "undefined") return [];

  const existing = readListsRaw();
  if (existing !== null) return existing;

  // v2 ещё не инициализирован — смотрим на старый одиночный список.
  const legacyItems = loadLegacyItems();
  if (legacyItems.length === 0) return [];

  let legacySort: SortCache | null = null;
  try {
    legacySort = normalizeSort(JSON.parse(localStorage.getItem(SHOPPING_SORT_CACHE_KEY) || "null"));
  } catch {
    legacySort = null;
  }

  const migrated: ShoppingListRecord = {
    id: newId(),
    name: MIGRATED_LIST_NAME,
    createdAt: Date.now(),
    items: legacyItems,
    sort: legacySort,
  };
  const lists = [migrated];
  saveLists(lists);
  return lists;
}

export function saveLists(lists: ShoppingListRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SHOPPING_LISTS_KEY, JSON.stringify(lists));
    window.dispatchEvent(new Event(SHOPPING_CHANGED_EVENT));
  } catch {
    // Приватный режим / переполнение — молча игнорируем: ломать сценарий нельзя.
  }
}

// --- CRUD (иммутабельно: возвращают новый массив и сразу его сохраняют) ---

export function createList(lists: ShoppingListRecord[], name?: string): { lists: ShoppingListRecord[]; list: ShoppingListRecord } {
  const list: ShoppingListRecord = {
    id: newId(),
    name: sanitizeListName(name, defaultListName()),
    createdAt: Date.now(),
    items: [],
    sort: null,
  };
  const next = [list, ...lists];
  saveLists(next);
  return { lists: next, list };
}

export function renameList(lists: ShoppingListRecord[], id: string, name: string): ShoppingListRecord[] {
  const next = lists.map((l) => (l.id === id ? { ...l, name: sanitizeListName(name, l.name) } : l));
  saveLists(next);
  return next;
}

export function deleteList(lists: ShoppingListRecord[], id: string): ShoppingListRecord[] {
  const next = lists.filter((l) => l.id !== id);
  saveLists(next);
  return next;
}

/** Обновляет позиции списка (и опционально кэш сортировки) по id. */
export function setListItems(
  lists: ShoppingListRecord[],
  id: string,
  items: ShoppingItem[],
  sort?: SortCache | null,
): ShoppingListRecord[] {
  const next = lists.map((l) =>
    l.id === id ? { ...l, items, ...(sort !== undefined ? { sort } : {}) } : l,
  );
  saveLists(next);
  return next;
}

export function setListSort(lists: ShoppingListRecord[], id: string, sort: SortCache | null): ShoppingListRecord[] {
  const next = lists.map((l) => (l.id === id ? { ...l, sort } : l));
  saveLists(next);
  return next;
}

/** Прогресс списка: сколько куплено из скольких. */
export function listProgress(list: ShoppingListRecord): { total: number; done: number } {
  return { total: list.items.length, done: list.items.filter((it) => it.checked).length };
}

// Дедуп импорта по shared-ссылке: enc (тело ?shared=) → id уже созданного из
// него списка. Без этого повторный переход по той же ссылке (обновление
// страницы, повторный клик по той же ссылке в чате) плодил бы дубли списков —
// импорт теперь происходит автоматически, без экрана-подтверждения.
const IMPORTED_SHARES_KEY = "smartcook_shopping_imported_shares_v1";
const MAX_IMPORTED_SHARES = 50;

function readImportedShares(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(IMPORTED_SHARES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === "string" && typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Список, уже созданный из этой shared-ссылки — если он ещё не удалён. */
export function getImportedShareListId(enc: string): string | null {
  return readImportedShares()[enc] ?? null;
}

/** Запоминает, что shared-ссылка enc уже импортирована в список listId. */
export function recordImportedShare(enc: string, listId: string): void {
  if (typeof window === "undefined") return;
  try {
    const map = readImportedShares();
    map[enc] = listId;
    const entries = Object.entries(map);
    const trimmed = entries.length > MAX_IMPORTED_SHARES ? entries.slice(entries.length - MAX_IMPORTED_SHARES) : entries;
    localStorage.setItem(IMPORTED_SHARES_KEY, JSON.stringify(Object.fromEntries(trimmed)));
  } catch {
    // Приватный режим / переполнение — молча игнорируем: ломать импорт нельзя.
  }
}

/**
 * Добавляет позиции в список по умолчанию (первый; если списков нет — создаёт
 * «Мои покупки»). Используется экраном рецепта («В список покупок»).
 */
export function addNamesToDefaultList(names: string[]): { added: number; limited: boolean; listName: string } {
  let lists = loadLists();
  let target = lists[0];
  if (!target) {
    const created = createList(lists, MIGRATED_LIST_NAME);
    lists = created.lists;
    target = created.list;
  }
  const result: AddNamesResult = addNames(target.items, names);
  // Список изменился — старый кэш сортировки этого списка больше не валиден.
  setListItems(lists, target.id, result.items, null);
  return { added: result.added, limited: result.limited, listName: target.name };
}
