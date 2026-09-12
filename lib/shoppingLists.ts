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
  withSource,
  type AddNamesResult,
  type ShoppingItem,
  type SortCache,
} from "./shoppingList";
import { convertedLocalListIds, loadSharedPointers } from "./sharedShoppingList";

// v2-хранилище. Старые ключи (v1) читаем только для одноразовой миграции.
export const SHOPPING_LISTS_KEY = "smartcook_shopping_lists_v2";

export const MAX_LIST_NAME_LENGTH = 60;
/**
 * Имя первого списка — и при миграции одиночного списка из MVP, и у человека,
 * который зашёл в раздел впервые.
 *
 * Раньше было «Мои покупки», а новые списки назывались «Покупки, 6 августа».
 * На четырёх списках экран превращался в четыре карточки «Покупки», и какая из
 * них какая — понять было нельзя. Слово «Покупки» осталось только у самого
 * раздела: в таб-баре и в заголовке страницы.
 *
 * Уже созданные списки НЕ переименовываем — они лежат в localStorage как
 * лежали. Легаси-имена вида «Покупки, 11 сентября» различаются в чипе по дате,
 * см. listChipLabel.
 */
export const MIGRATED_LIST_NAME = "Мой список";

export type ShoppingListRecord = {
  id: string;
  name: string;
  createdAt: number; // epoch ms
  /**
   * Когда список меняли последний раз (позиции, отметки, имя). Нужен хабу: он
   * сортирует списки по свежести и подписывает карточку «обновлён сегодня
   * 17:10» — по дате СОЗДАНИЯ это была бы неправда, список живёт неделями.
   *
   * Необязательный: у записей, заведённых до этого поля, его просто нет —
   * тогда берём createdAt (см. listUpdatedAt). Переписывать хранилище ради
   * одного поля не нужно, оно появится при первой же правке списка.
   */
  updatedAt?: number;
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

/**
 * Имя по умолчанию для нового списка: «Список 1», «Список 2», «Список 3»…
 *
 * Ни слова «Покупки» (так называется весь раздел — в таб-баре и заголовке
 * хаба), ни даты в имени: дата у списка и так есть, она стоит подписью
 * «обновлён сегодня 17:10» и живёт своей жизнью, а в имени сразу устаревала.
 *
 * Номер — первый свободный, а не по количеству списков: иначе после удаления
 * среднего списка два новых получили бы одно имя.
 *
 * Без аргумента (так зовёт серверный роут общего списка как резервное имя)
 * отдаёт «Список 1».
 */
export function defaultListName(lists: ShoppingListRecord[] = []): string {
  const taken = new Set(lists.map((l) => l.name.trim().toLowerCase()));
  for (let n = 1; n < 1000; n++) {
    const candidate = `Список ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  // Тысяча списков с занятыми именами — сценарий из области фантастики, но
  // возвращать undefined нельзя: имя обязано быть.
  return `Список ${RU_DAY_MONTH.format(new Date())}`;
}

/**
 * Имя списка для показа: в карточке хаба и в шапке самого списка.
 *
 * Обычное имя показываем целиком. Исключение — легаси-имена по умолчанию
 * («Покупки, 11 сентября», «Мои покупки, 1 мая»): слово «Покупки» у всех таких
 * списков одинаковое, различает их только дата, поэтому от имени остаётся она.
 * Данные при этом НЕ переписываем — в хранилище, при переименовании и при
 * «поделиться» имя по-прежнему полное.
 */
export function listDisplayName(name: string): string {
  const { title, subtitle } = splitListTitle(name);
  if (subtitle && /^(покупки|мои покупки)$/i.test(title)) return subtitle;
  return name;
}

/** Когда список меняли последний раз. У старых записей поля нет — берём создание. */
export function listUpdatedAt(list: Pick<ShoppingListRecord, "createdAt" | "updatedAt">): number {
  return typeof list.updatedAt === "number" && Number.isFinite(list.updatedAt)
    ? list.updatedAt
    : list.createdAt;
}

const RU_TIME = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Подпись под названием в хабе: «обновлён сегодня 17:10», «обновлён вчера
 * 09:30», «обновлён 6 августа».
 *
 * Время показываем только у сегодняшних и вчерашних правок: у списка,
 * тронутого месяц назад, минуты не значат ничего, а место занимают.
 */
export function formatUpdatedAt(at: number, now: Date = new Date()): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const startOfToday = midnight.getTime();
  try {
    if (at >= startOfToday) return `обновлён сегодня ${RU_TIME.format(date)}`;
    if (at >= startOfToday - DAY_MS) return `обновлён вчера ${RU_TIME.format(date)}`;
    return `обновлён ${RU_DAY_MONTH.format(date)}`;
  } catch {
    return "";
  }
}

/**
 * Разбивает имя списка на заголовок и подпись по ПЕРВОЙ запятой: имя по
 * умолчанию «Покупки, 31 августа» показывается двумя строками — «Покупки»
 * крупно, дата ниже помельче. Иначе длинное имя переносилось как попало
 * («Покупки, 31» / «августа»).
 *
 * Только представление: само имя в хранилище не меняется, переименование и
 * поделиться работают с ним как раньше. Имя без запятой (переименовали в
 * «Дача») возвращается целиком, подписи нет.
 */
export function splitListTitle(name: string): { title: string; subtitle: string | null } {
  const at = name.indexOf(",");
  if (at <= 0) return { title: name, subtitle: null };
  const title = name.slice(0, at).trim();
  const subtitle = name.slice(at + 1).trim();
  if (!title || !subtitle) return { title: name, subtitle: null };
  return { title, subtitle };
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
    items.push(
      withSource(
        {
          id: typeof (it as { id?: unknown }).id === "string" ? (it as { id: string }).id : newId(),
          name,
          checked: Boolean((it as { checked?: unknown }).checked),
        },
        (it as { source?: unknown }).source,
      ),
    );
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
  const updatedAtRaw = (raw as { updatedAt?: unknown }).updatedAt;
  return {
    id,
    name,
    createdAt,
    ...(typeof updatedAtRaw === "number" && Number.isFinite(updatedAtRaw) ? { updatedAt: updatedAtRaw } : {}),
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
 * список из MVP (v1) в первый список (MIGRATED_LIST_NAME), чтобы данные ранних
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

  const migratedAt = Date.now();
  const migrated: ShoppingListRecord = {
    id: newId(),
    name: MIGRATED_LIST_NAME,
    createdAt: migratedAt,
    updatedAt: migratedAt,
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
  const now = Date.now();
  const list: ShoppingListRecord = {
    id: newId(),
    name: sanitizeListName(name, defaultListName(lists)),
    createdAt: now,
    updatedAt: now,
    items: [],
    sort: null,
  };
  const next = [list, ...lists];
  saveLists(next);
  return { lists: next, list };
}

export function renameList(lists: ShoppingListRecord[], id: string, name: string): ShoppingListRecord[] {
  const next = lists.map((l) =>
    l.id === id ? { ...l, name: sanitizeListName(name, l.name), updatedAt: Date.now() } : l,
  );
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
    l.id === id ? { ...l, items, updatedAt: Date.now(), ...(sort !== undefined ? { sort } : {}) } : l,
  );
  saveLists(next);
  return next;
}

/**
 * Кэш раскладки по отделам. updatedAt тут НЕ двигаем: раскладка — производная
 * от позиций, а не правка списка. Иначе список всплывал бы в хабе наверх с
 * подписью «обновлён сейчас» от одного нажатия на иконку просмотра.
 */
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
 * новый). Используется экраном рецепта.
 *
 * opts.source — название рецепта: ставится подписью НОВЫМ позициям, чтобы в
 * «Покупках» было видно, зачем куплено. Уже лежащие позиции не переподписываем.
 * opts.fallbackListName — как назвать список, если у человека нет ни одного
 * (иначе «Мои покупки», то же имя, что у миграции v1 → v2).
 */
export function addNamesToDefaultList(
  names: string[],
  opts?: { source?: string; fallbackListName?: string },
): { added: number; duplicate: number; limited: boolean; listName: string; listId: string } {
  let lists = loadLists();
  // Списки, ставшие общими (семейными), в разделе «Покупки» СКРЫТЫ — вместо
  // них показана карточка общего списка. Раньше первым в loadLists мог оказаться
  // как раз такой список, и продукты с экрана рецепта уезжали туда, где человек
  // их уже никогда не увидит: тост радостно рапортовал об успехе, а в «Покупках»
  // не появлялось ничего. Берём первый ВИДИМЫЙ список.
  const hidden = convertedLocalListIds(loadSharedPointers());
  let target = lists.find((l) => !hidden.has(l.id));
  if (!target) {
    const created = createList(lists, opts?.fallbackListName || MIGRATED_LIST_NAME);
    lists = created.lists;
    target = created.list;
  }
  const result: AddNamesResult = addNames(target.items, names, { source: opts?.source });
  // Список изменился — старый кэш сортировки этого списка больше не валиден.
  setListItems(lists, target.id, result.items, null);
  // listId наружу — обязателен: экран рецепта уводит человека сразу в ЭТОТ
  // список (/shopping/<id>), а не в хаб. Иначе после «Добавлено в «Список 2»»
  // приходилось искать, куда именно всё уехало.
  return {
    added: result.added,
    duplicate: result.duplicate,
    limited: result.limited,
    listName: target.name,
    listId: target.id,
  };
}
