// Зеркалирование ЛИЧНЫХ списков покупок на сервер для залогиненных.
// Таблица user_shopping_lists (supabase_user_shopping_lists.sql), клиент пишет
// в неё напрямую под своим JWT — RLS пускает только к своим строкам.
//
// ИСТОЧНИК ПРАВДЫ — localStorage устройства. Сервер зеркало: он догоняет
// устройство, а не наоборот. Отсюда три следствия, которые важнее любой
// оптимизации:
//   1) запись всегда идёт в localStorage ПЕРВОЙ, интерфейс не ждёт сети;
//   2) неудача синхронизации молчит — ни тостов, ни блокировок, как у
//      claimGuestPartiesToAccount;
//   3) ни одна ветка не удаляет локальный список из-за ответа сервера, кроме
//      одной — «список архивировали на другом устройстве, и здесь его с тех пор
//      не трогали» (mergeShoppingLists). Всё остальное расхождение превращается
//      в ВТОРОЙ список, а не в потерю.
//
// Чего здесь намеренно НЕТ (v1): realtime, построчного слияния позиций,
// синхронизации у гостей, переноса закреплений и режима просмотра — они про
// устройство, а не про аккаунт.

import { supabase } from "./supabase";
import { FEATURE_SHOPPING_SYNC } from "./features";
import { SHOPPING_CHANGED_EVENT, type ShoppingItem, type SortCache } from "./shoppingList";
import { listUpdatedAt, loadLists, saveLists, type ShoppingListRecord } from "./shoppingLists";
import {
  mergeShoppingLists,
  payloadFromRecord,
  pendingFromLocal,
  type ServerList,
  type SyncState,
} from "./shoppingSyncMerge";

const TABLE = "user_shopping_lists";

// Карта сведённых версий: { listId: { server: ISO, local: epoch ms } }.
const STATE_KEY = "smartcook_shopping_sync_v1";
// Аккаунт, которому принадлежит текущее локальное состояние.
const OWNER_KEY = "smartcook_shopping_sync_owner_v1";
// Очередь неотправленного: { listId: "upsert" | "archive" }.
const QUEUE_KEY = "smartcook_shopping_sync_queue_v1";
// Списки предыдущего аккаунта: видно, но наверх не отправляем (§6в).
const FOREIGN_KEY = "smartcook_shopping_sync_foreign_v1";
// Снимок хранилища перед самой первой отправкой. Пишется ОДИН раз навсегда.
export const BACKUP_KEY = "smartcook_shopping_backup_v1";

// Сколько «чужих» id помним. Больше не нужно: это защита от перелива списков в
// соседний аккаунт, а не архив.
const MAX_FOREIGN = 200;
// Отправка после правки — отложенная: галочки в магазине ставят очередями.
const PUSH_DEBOUNCE_MS = 1500;
// Сколько операций очереди разгребаем за один заход, чтобы не занять поток.
const MAX_QUEUE_OPS_PER_RUN = 30;

type QueueOp = "upsert" | "archive";
type Queue = Record<string, QueueOp>;

// --- localStorage: всё через try/catch, приватный режим ничего не ломает -----

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Переполнение/приватный режим: синхронизация деградирует, список цел.
  }
}

function readState(): SyncState {
  const raw = readJson<Record<string, unknown>>(STATE_KEY, {});
  const out: SyncState = {};
  for (const [id, mark] of Object.entries(raw)) {
    if (!mark || typeof mark !== "object") continue;
    const server = (mark as { server?: unknown }).server;
    const local = (mark as { local?: unknown }).local;
    if (typeof server !== "string" || typeof local !== "number") continue;
    out[id] = { server, local };
  }
  return out;
}

function readQueue(): Queue {
  const raw = readJson<Record<string, unknown>>(QUEUE_KEY, {});
  const out: Queue = {};
  for (const [id, op] of Object.entries(raw)) {
    if (op === "upsert" || op === "archive") out[id] = op;
  }
  return out;
}

function readForeign(): string[] {
  const raw = readJson<unknown>(FOREIGN_KEY, []);
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
}

function writeForeign(ids: string[]): void {
  const unique = Array.from(new Set(ids));
  writeJson(FOREIGN_KEY, unique.slice(Math.max(0, unique.length - MAX_FOREIGN)));
}

function readOwner(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

/**
 * Снимок всего хранилища списков ПЕРЕД первой в жизни устройства отправкой.
 *
 * Пишется один раз и никогда не перезаписывается: смысл ровно в том, чтобы
 * сохранить состояние ДО того, как синхронизация вообще что-либо сделала.
 * Дешёвая страховка под красную линию — если слияние поведёт себя не так,
 * списки достаются отсюда руками, без бэкапов базы.
 */
function backupOnce(lists: ShoppingListRecord[]): void {
  if (typeof window === "undefined") return;
  if (lists.length === 0) return;
  try {
    if (localStorage.getItem(BACKUP_KEY) !== null) return;
  } catch {
    return;
  }
  writeJson(BACKUP_KEY, { at: Date.now(), lists });
}

// --- Сервер -----------------------------------------------------------------

type Row = {
  id: string;
  name: string;
  items: unknown;
  sort_sig: string | null;
  sort_groups: unknown;
  created_at: string;
  updated_at: string;
  client_updated_at: string | null;
  archived_at: string | null;
};

function toServerList(row: Row): ServerList {
  const createdAt = Date.parse(row.created_at);
  const clientUpdatedAt = row.client_updated_at ? Date.parse(row.client_updated_at) : NaN;
  const fallbackUpdatedAt = Date.parse(row.updated_at);
  return {
    id: row.id,
    name: row.name,
    // Санитайз и лимиты применит normalizeList в recordFromServer — доверять
    // содержимому jsonb на слово нельзя даже из своей же таблицы.
    items: (Array.isArray(row.items) ? row.items : []) as ShoppingItem[],
    sort:
      row.sort_sig && Array.isArray(row.sort_groups)
        ? ({ sig: row.sort_sig, groups: row.sort_groups } as SortCache)
        : null,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    serverUpdatedAt: row.updated_at,
    clientUpdatedAt: Number.isFinite(clientUpdatedAt)
      ? clientUpdatedAt
      : Number.isFinite(fallbackUpdatedAt)
        ? fallbackUpdatedAt
        : Date.now(),
    archived: row.archived_at !== null,
  };
}

/** Все строки аккаунта, включая архивные: по ним прячем удалённое на других устройствах. */
async function pullRows(userId: string): Promise<ServerList[] | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id,name,items,sort_sig,sort_groups,created_at,updated_at,client_updated_at,archived_at")
    .eq("user_id", userId);
  if (error) {
    console.warn("[shoppingSync] pull failed", error.message);
    return null;
  }
  return ((data ?? []) as Row[]).map(toServerList);
}

/** Отправка одного списка. Возвращает новый `updated_at` или null при неудаче. */
async function pushOne(userId: string, list: ShoppingListRecord): Promise<string | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert({ ...payloadFromRecord(list), user_id: userId }, { onConflict: "user_id,id" })
    .select("updated_at")
    .single();
  if (error || !data) {
    console.warn("[shoppingSync] push failed", error?.message);
    return null;
  }
  return (data as { updated_at: string }).updated_at;
}

/** Мягкое удаление: строка остаётся, ставится archived_at. */
async function archiveOne(userId: string, id: string): Promise<boolean> {
  const { error } = await supabase
    .from(TABLE)
    .update({ archived_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    console.warn("[shoppingSync] archive failed", error.message);
    return false;
  }
  return true;
}

// --- Применение к устройству ------------------------------------------------

// saveLists шлёт SHOPPING_CHANGED_EVENT, который слушаем мы сами. Без этого
// флага собственная запись выглядела бы как правка человека и уезжала бы на
// сервер по кругу.
let applying = false;

function applyLists(lists: ShoppingListRecord[]): void {
  applying = true;
  try {
    saveLists(lists);
  } finally {
    applying = false;
  }
}

/** Сравнение по существу: стоит ли вообще трогать хранилище. */
function sameLists(a: ShoppingListRecord[], b: ShoppingListRecord[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --- Очередь ----------------------------------------------------------------

function enqueue(ids: string[], op: QueueOp): void {
  if (ids.length === 0) return;
  const queue = readQueue();
  for (const id of ids) queue[id] = op;
  writeJson(QUEUE_KEY, queue);
}

/**
 * Разгребает очередь. Ошибку на конкретной записи оставляет в очереди и
 * прекращает заход: если сеть легла или лимитер отдал 503, долбиться дальше
 * бессмысленно — попробуем на следующем открытии раздела или по событию online.
 */
async function flushQueue(userId: string): Promise<void> {
  let queue = readQueue();
  const ids = Object.keys(queue).slice(0, MAX_QUEUE_OPS_PER_RUN);
  if (ids.length === 0) return;

  const state = readState();
  const lists = new Map(loadLists().map((l) => [l.id, l]));

  for (const id of ids) {
    const op = queue[id];
    if (op === "archive") {
      if (!(await archiveOne(userId, id))) break;
      delete state[id];
    } else {
      const list = lists.get(id);
      if (!list) {
        // Список успели удалить, пока он ждал отправки. Отправлять нечего;
        // удаление приедет отдельной записью очереди.
        delete queue[id];
        writeJson(QUEUE_KEY, queue);
        continue;
      }
      const serverUpdatedAt = await pushOne(userId, list);
      if (!serverUpdatedAt) break;
      // Отметку ставим по той записи, которую РЕАЛЬНО отправили. Если человек
      // правил список, пока шёл запрос, отметка не совпадёт с текущей — и
      // следующий проход отправит его ещё раз. Так и надо.
      state[id] = { server: serverUpdatedAt, local: listUpdatedAt(list) };
    }
    // Перечитываем: за время запроса очередь могли пополнить.
    queue = readQueue();
    delete queue[id];
    writeJson(QUEUE_KEY, queue);
  }

  writeJson(STATE_KEY, state);
}

// --- Драйвер ----------------------------------------------------------------

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

let running = false;

/**
 * Полный цикл: pull → слияние → отправка. Best-effort, не бросает исключений.
 *
 * Порядок именно такой и переставлять его нельзя: сначала забрать серверное,
 * потом свести, и только потом отправлять. Обратный порядок («сервер — истина,
 * локальное подчистим») — ровно тот способ, которым теряются списки.
 */
export async function syncShoppingLists(reason: string): Promise<void> {
  if (!FEATURE_SHOPPING_SYNC) return;
  if (typeof window === "undefined") return;
  if (running) return;
  running = true;

  try {
    const userId = await currentUserId();
    if (!userId) return; // гость: синхронизации нет, всё живёт на устройстве

    // Вошли в ДРУГОЙ аккаунт на этом же устройстве. Списки предыдущего в новый
    // аккаунт не уезжают (решение основателя, §6в): помечаем их «чужими»,
    // забываем отметки и очередь — они относились к прошлому аккаунту.
    const owner = readOwner();
    if (owner && owner !== userId) {
      const carried = loadLists().map((l) => l.id);
      writeForeign([...readForeign(), ...carried]);
      writeJson(STATE_KEY, {});
      writeJson(QUEUE_KEY, {});
    }
    try {
      localStorage.setItem(OWNER_KEY, userId);
    } catch {
      // Не запомнили владельца — в худшем случае в следующий раз не отличим
      // смену аккаунта. Списки от этого не теряются.
    }

    backupOnce(loadLists());

    const server = await pullRows(userId);
    if (!server) return; // сеть моргнула — попробуем в следующий раз

    // Перечитываем ПОСЛЕ сетевого ожидания: человек мог что-то добавить, пока
    // шёл запрос, и слияние поверх устаревшего массива стёрло бы эту правку.
    const local = loadLists();
    const merged = mergeShoppingLists({
      local,
      server,
      state: readState(),
      foreign: readForeign(),
      newId,
    });

    if (!sameLists(local, merged.lists)) applyLists(merged.lists);
    writeJson(STATE_KEY, merged.state);
    writeForeign(merged.foreign);
    enqueue(merged.push, "upsert");
    enqueue(merged.archive, "archive");

    if (merged.forks > 0) {
      console.info(`[shoppingSync] ${reason}: разошлись правки, сохранено копий: ${merged.forks}`);
    }

    await flushQueue(userId);
  } catch (e) {
    console.warn("[shoppingSync] cycle failed", e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

/**
 * Отложенная отправка после правки на устройстве. Без опроса сервера: человек
 * ставит галочки, и дёргать сеть на каждую незачем.
 */
async function pushLocalChanges(): Promise<void> {
  if (!FEATURE_SHOPPING_SYNC) return;
  try {
    const userId = await currentUserId();
    if (!userId) return;
    if (readOwner() !== userId) {
      // Аккаунт сменился, а полного цикла ещё не было: он разберётся с
      // «чужими» списками. До тех пор не отправляем ничего.
      return;
    }

    const local = loadLists();
    backupOnce(local);
    const pending = pendingFromLocal({ local, state: readState(), foreign: readForeign() });
    enqueue(pending.push, "upsert");
    enqueue(pending.archive, "archive");
    await flushQueue(userId);
  } catch (e) {
    console.warn("[shoppingSync] push failed", e instanceof Error ? e.message : e);
  }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let listeners = 0;
let detach: (() => void) | null = null;

/**
 * Подписка на события, по которым стоит синхронизироваться. Идемпотентна:
 * экран хаба и экран списка зовут её независимо, слушатели вешаются один раз.
 *
 * Правки, сделанные ВНЕ раздела «Покупки» (кнопка «Чего не хватает» на экране
 * рецепта), при выключенной подписке никуда не денутся: очередь строится
 * сравнением хранилища с картой отметок, поэтому их подхватит ближайший заход.
 */
export function startShoppingSync(): () => void {
  if (!FEATURE_SHOPPING_SYNC) return () => {};
  if (typeof window === "undefined") return () => {};

  listeners += 1;
  if (listeners === 1) {
    const onLocalChange = () => {
      if (applying) return;
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(() => void pushLocalChanges(), PUSH_DEBOUNCE_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncShoppingLists("visible");
    };
    const onOnline = () => void syncShoppingLists("online");

    window.addEventListener(SHOPPING_CHANGED_EVENT, onLocalChange);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);

    detach = () => {
      window.removeEventListener(SHOPPING_CHANGED_EVENT, onLocalChange);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = null;
    };
  }

  return () => {
    listeners -= 1;
    if (listeners === 0 && detach) {
      detach();
      detach = null;
    }
  };
}

/**
 * Перенос списков в аккаунт сразу после входа/регистрации/восстановления.
 *
 * Живёт внутри useAuthModal, а НЕ в экране: хук зовут из четырёх мест, и
 * перенос профиля вкуса, подключённый когда-то только в SearchApp, из-за этого
 * молча не срабатывал у тех, кто регистрировался через /profile. Повторять эту
 * ошибку нельзя — тут цена не вкусы, а списки покупок.
 */
export function syncShoppingListsAfterAuth(): void {
  if (!FEATURE_SHOPPING_SYNC) return;
  // Намеренно не ждём: после регистрации следом показывается код
  // восстановления, и задерживать этот экран сетевым запросом нельзя.
  void syncShoppingLists("auth");
}
