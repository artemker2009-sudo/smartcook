// Офлайн-очередь общего списка.
//
// Зачем: список покупок открывают в магазине, где связь пропадает между
// стеллажами. Галочка обязана вставать мгновенно и не теряться — поэтому UI
// обновляется оптимистично, а неотправленная мутация ложится в localStorage и
// переживает перезагрузку страницы.
//
// Почему повтор безопасен: ВСЕ три операции идемпотентны по построению.
//   * add    — сервер дедупит по названию, повторная отправка не создаст дубль;
//   * patch  — выставляет конкретное значение (checked=true / deleted), а не
//              переключает, поэтому повтор ничего не портит;
//   * clear  — «убрать все отмеченные», повтор просто ничего не находит.
// Значит при потерянном ответе можно спокойно отправить операцию заново, и это
// главная причина, по которой очередь получилась такой простой.

import { addSharedItems, clearSharedChecked, patchSharedItem } from "./sharedShoppingList";

const PENDING_PREFIX = "smartcook_shared_pending_";
const MAX_PENDING = 200;

/** Префикс id позиции, которая создана оптимистично и сервером ещё не подтверждена. */
export const TEMP_ITEM_PREFIX = "tmp:";

export function isTempItemId(id: string): boolean {
  return id.startsWith(TEMP_ITEM_PREFIX);
}

export type PendingMutation =
  | { kind: "add"; names: string[] }
  | { kind: "patch"; itemId: string; checked?: boolean; deleted?: true }
  | { kind: "clear" };

function keyFor(listId: string): string {
  return `${PENDING_PREFIX}${listId}`;
}

export function loadPending(listId: string): PendingMutation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(keyFor(listId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m): m is PendingMutation => {
      if (!m || typeof m !== "object") return false;
      if (m.kind === "add") return Array.isArray(m.names);
      if (m.kind === "patch") return typeof m.itemId === "string";
      return m.kind === "clear";
    });
  } catch {
    return [];
  }
}

function savePending(listId: string, mutations: PendingMutation[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = mutations.slice(-MAX_PENDING);
    if (trimmed.length === 0) localStorage.removeItem(keyFor(listId));
    else localStorage.setItem(keyFor(listId), JSON.stringify(trimmed));
  } catch {
    // Приватный режим / переполнение: очередь не переживёт перезагрузку, но
    // текущая сессия всё равно попробует отправить мутацию.
  }
}

export function enqueue(listId: string, mutation: PendingMutation): void {
  savePending(listId, [...loadPending(listId), mutation]);
}

export function clearPending(listId: string): void {
  savePending(listId, []);
}

export function pendingCount(listId: string): number {
  return loadPending(listId).length;
}

/**
 * Пытается отправить всю очередь по порядку.
 *
 * Возвращает true, если очередь опустела. При первой же сетевой ошибке
 * останавливается и сохраняет ОСТАТОК — порядок операций важен (добавили, потом
 * чиркнули), поэтому «перепрыгнуть» неудачную и продолжить нельзя.
 *
 * Мутации над позициями, которые ещё не подтверждены сервером (tmp-id),
 * отбрасываются: сервер такого id не знает. Практически это значит, что
 * галочка, поставленная в офлайне на позицию, добавленную тоже в офлайне, до
 * синхронизации не доедет — редкий случай, осознанная плата за простоту.
 */
export async function flushPending(listId: string, memberRef: string): Promise<boolean> {
  let queue = loadPending(listId);
  if (queue.length === 0) return true;

  while (queue.length > 0) {
    const mutation = queue[0];

    if (mutation.kind === "patch" && isTempItemId(mutation.itemId)) {
      queue = queue.slice(1);
      savePending(listId, queue);
      continue;
    }

    try {
      if (mutation.kind === "add") {
        await addSharedItems(listId, memberRef, mutation.names);
      } else if (mutation.kind === "patch") {
        const patch: { checked?: boolean; deleted?: true } = {};
        if (mutation.deleted) patch.deleted = true;
        else if (typeof mutation.checked === "boolean") patch.checked = mutation.checked;
        await patchSharedItem(listId, mutation.itemId, memberRef, patch);
      } else {
        await clearSharedChecked(listId, memberRef);
      }
    } catch {
      // Связь не вернулась (или сервер ответил ошибкой) — остаток ждёт
      // следующей попытки. Порядок сохранён.
      savePending(listId, queue);
      return false;
    }

    queue = queue.slice(1);
    savePending(listId, queue);
  }

  return true;
}
