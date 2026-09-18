// Слияние личных списков покупок: устройство ↔ сервер. ЧИСТАЯ часть, без сети,
// без localStorage, без Supabase — чтобы поведение под красной линией задачи
// («ни один список ни у кого не теряется») можно было проверить тестами, а не
// прокликиванием. Ввод-вывод живёт в lib/shoppingSync.ts.
//
// ГЛАВНОЕ ПРАВИЛО, из которого выводится всё остальное: источник правды —
// localStorage устройства, сервер лишь зеркало. Поэтому здесь НЕТ ни одной
// ветки, которая выбрасывала бы локальный список из-за того, что на сервере
// что-то иначе. Максимум, что может случиться при расхождении, — появится
// ВТОРОЙ список (копия). Дубль лучше потери.

import { MAX_SHOPPING_ITEMS, type ShoppingItem, type SortCache } from "./shoppingList";
import {
  MAX_LIST_NAME_LENGTH,
  listUpdatedAt,
  normalizeList,
  sanitizeListName,
  type ShoppingListRecord,
} from "./shoppingLists";

/**
 * Отметка «эту пару версий мы уже свели». Хранится на устройстве рядом со
 * списками (ключ smartcook_shopping_sync_v1).
 *
 * server — `updated_at` строки, какой мы её видели (серверное время, порядок
 *          решает только оно: часы устройств врут);
 * local  — listUpdatedAt локальной записи в тот же момент.
 *
 * Сравнение с этой парой и отвечает на единственный важный вопрос: правку
 * сделали с одной стороны или с обеих.
 */
export type SyncMark = { server: string; local: number };
export type SyncState = Record<string, SyncMark>;

/** Строка таблицы user_shopping_lists, уже приведённая к клиентскому виду. */
export type ServerList = {
  id: string;
  name: string;
  items: ShoppingItem[];
  sort: SortCache | null;
  createdAt: number;
  /** `updated_at` — серверное время, ISO. Только по нему сверяем «изменилось ли». */
  serverUpdatedAt: string;
  /** `client_updated_at` — чтобы подпись «обновлён вчера 09:30» не поехала. */
  clientUpdatedAt: number;
  archived: boolean;
};

export type MergeInput = {
  local: ShoppingListRecord[];
  server: ServerList[];
  state: SyncState;
  /**
   * id списков, которые НЕЛЬЗЯ отправлять в текущий аккаунт: они остались на
   * устройстве от предыдущего (человек вышел из аккаунта A и вошёл в B).
   * Решение основателя по §6в: чужие списки видно, но наверх они не уезжают.
   */
  foreign: string[];
  newId: () => string;
};

export type MergeResult = {
  /** Что записать в localStorage. */
  lists: ShoppingListRecord[];
  /** id, которые надо отправить на сервер (upsert). */
  push: string[];
  /** id, которые надо пометить archived_at на сервере. */
  archive: string[];
  /** Новая карта отметок. Пополняется только там, где сводить больше нечего. */
  state: SyncState;
  /** Обновлённый список «не наших»: сервер мог доказать, что список всё-таки наш. */
  foreign: string[];
  /** Сколько раз разошлись правки с двух сторон и появилась копия. Для лога. */
  forks: number;
};

const COPY_SUFFIX = " (копия с другого устройства)";

/**
 * Имя списка-копии. Обрезаем ОСНОВУ, а не результат: sanitizeListName режет
 * хвост по 60 символам, и у длинного имени под нож ушло бы ровно объяснение,
 * откуда взялась копия, — а оно тут единственное, что человеку помогает.
 */
export function copyListName(name: string): string {
  const room = MAX_LIST_NAME_LENGTH - COPY_SUFFIX.length;
  const base = name.length > room ? `${name.slice(0, room - 1).trim()}…` : name;
  return sanitizeListName(base + COPY_SUFFIX, base);
}

/** Строка сервера → запись для localStorage, через общий санитайз и лимиты. */
export function recordFromServer(s: ServerList, id: string = s.id): ShoppingListRecord {
  const normalized = normalizeList({
    id,
    name: s.name,
    createdAt: s.createdAt,
    updatedAt: s.clientUpdatedAt,
    items: s.items,
    sort: s.sort,
  });
  // normalizeList отдаёт null только на не-объекте; литерал выше им быть не может.
  return (
    normalized ?? {
      id,
      name: sanitizeListName(s.name, "Мой список"),
      createdAt: s.createdAt,
      updatedAt: s.clientUpdatedAt,
      items: [],
      sort: null,
    }
  );
}

/**
 * Свести устройство и сервер.
 *
 * Разбор по веткам (l — локальная запись, s — серверная строка, mark — отметка
 * последней сведённой пары):
 *
 *   нет s              → список новый на этом устройстве, отправляем;
 *   s архивирован      → удалили на другом устройстве. Прячем локально, НО
 *                        только если здесь его с тех пор не трогали. Трогали —
 *                        воскрешаем (отправляем заново, снимая archived_at);
 *   правили только тут → отправляем;
 *   правили только там → забираем;
 *   правили с обеих    → локальная остаётся под своим id (человек смотрит
 *                        именно на неё, подменять открытый список нельзя),
 *                        серверная сохраняется ОТДЕЛЬНЫМ списком-копией;
 *   нигде не правили   → ничего.
 *
 * Плюс две ветки по краям: строка есть на сервере, а локально её нет (забираем,
 * если только её не удалили здесь же) и наоборот — отметка есть, а записи нет
 * (значит удалили здесь, архивируем на сервере).
 */
export function mergeShoppingLists(input: MergeInput): MergeResult {
  const { local, server, state, newId } = input;

  const foreign = new Set(input.foreign);
  const localById = new Map(local.map((l) => [l.id, l]));
  const serverById = new Map(server.map((s) => [s.id, s]));

  const kept: ShoppingListRecord[] = [];
  const appended: ShoppingListRecord[] = [];
  const push: string[] = [];
  const archive: string[] = [];
  const nextState: SyncState = {};
  let forks = 0;

  // Списки, которые мы когда-то свели, а локально их больше нет: их удалили
  // здесь. Отметку не переносим (иначе удаление «зависнет» навсегда), строку на
  // сервере архивируем — мягко, данные там остаются.
  const deletedHere = new Set<string>();
  for (const id of Object.keys(state)) {
    if (localById.has(id)) continue;
    deletedHere.add(id);
    const s = serverById.get(id);
    if (s && !s.archived) archive.push(id);
  }

  for (const l of local) {
    const s = serverById.get(l.id);
    const mark = state[l.id];

    if (!s) {
      // На сервере такой строки нет вовсе.
      kept.push(l);
      if (foreign.has(l.id)) continue; // чужой аккаунт — наверх не отправляем
      push.push(l.id);
      continue;
    }

    // Строка лежит в ЭТОМ аккаунте — значит список всё-таки наш, и держать его
    // в «чужих» больше нет оснований. Так к человеку возвращается его же
    // аккаунт после того, как он походил под другим.
    foreign.delete(l.id);

    const localChanged = !mark || listUpdatedAt(l) !== mark.local;

    if (s.archived) {
      if (localChanged) {
        // Удалили на другом устройстве, но здесь после этого правили. Правка
        // дороже удаления: воскрешаем.
        kept.push(l);
        push.push(l.id);
      }
      // Иначе просто не переносим запись в kept — список исчезает с устройства
      // вслед за удалением на другом. Отметку тоже не переносим.
      continue;
    }

    const serverChanged = !mark || s.serverUpdatedAt !== mark.server;

    if (localChanged && serverChanged) {
      forks += 1;
      const copy = recordFromServer(s, newId());
      appended.push({ ...copy, name: copyListName(copy.name) });
      kept.push(l);
      push.push(l.id);
      push.push(copy.id);
      continue;
    }

    if (localChanged) {
      kept.push(l);
      push.push(l.id);
      continue;
    }

    if (serverChanged) {
      const taken = recordFromServer(s);
      kept.push(taken);
      nextState[l.id] = { server: s.serverUpdatedAt, local: listUpdatedAt(taken) };
      continue;
    }

    kept.push(l);
    nextState[l.id] = mark;
  }

  // Строки, которых на устройстве нет: пришли с другого телефона.
  for (const s of server) {
    if (localById.has(s.id)) continue;
    if (s.archived) continue;
    if (deletedHere.has(s.id)) continue; // удалили здесь, архивация уже в очереди
    const rec = recordFromServer(s);
    appended.push(rec);
    nextState[s.id] = { server: s.serverUpdatedAt, local: listUpdatedAt(rec) };
  }

  return {
    // Новые списки в конец: первый ВИДИМЫЙ список — это цель добавления с
    // экрана рецепта (addNamesToDefaultList), и подменять её списком, приехавшим
    // с другого устройства, нельзя.
    lists: [...kept, ...appended],
    push: Array.from(new Set(push)),
    archive: Array.from(new Set(archive)),
    state: nextState,
    foreign: Array.from(foreign),
    forks,
  };
}

/**
 * Что нужно отправить, если сервер мы не опрашивали (человек просто правит
 * список, а мы отложенно догоняем). Та же логика по краям, что в merge, но без
 * серверной стороны.
 */
export function pendingFromLocal(input: {
  local: ShoppingListRecord[];
  state: SyncState;
  foreign: string[];
}): { push: string[]; archive: string[] } {
  const foreign = new Set(input.foreign);
  const localById = new Map(input.local.map((l) => [l.id, l]));

  const push: string[] = [];
  for (const l of input.local) {
    if (foreign.has(l.id)) continue;
    const mark = input.state[l.id];
    if (!mark || listUpdatedAt(l) !== mark.local) push.push(l.id);
  }

  const archive: string[] = [];
  for (const id of Object.keys(input.state)) {
    if (!localById.has(id)) archive.push(id);
  }

  return { push, archive };
}

/** Снимок списка для отправки. Лимит позиций применяем ещё раз, как и в БД. */
export function payloadFromRecord(list: ShoppingListRecord) {
  return {
    id: list.id,
    name: list.name,
    items: list.items.slice(0, MAX_SHOPPING_ITEMS),
    sort_sig: list.sort?.sig ?? null,
    sort_groups: list.sort?.groups ?? null,
    created_at: new Date(list.createdAt).toISOString(),
    client_updated_at: new Date(listUpdatedAt(list)).toISOString(),
    archived_at: null as string | null,
  };
}
