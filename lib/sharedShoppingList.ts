// Клиентская сторона общего (семейного) списка покупок.
//
// ВАЖНО: локальные мультисписки (lib/shoppingLists.ts, ключ
// smartcook_shopping_lists_v2) этот модуль НЕ трогает вообще. Общий список —
// отдельная сущность: сюда попадают только указатели «я состою в таком-то
// списке» и личность участника. Сами позиции живут на сервере.

import type { ShoppingGroup } from "./shoppingList";

export const SHARED_LISTS_KEY = "smartcook_shared_shopping_lists_v1";
const MEMBER_KEY_PREFIX = "smartcook_shared_member_";

export type SharedListPointer = {
  id: string;
  name: string;
  memberRef: string;
  role: "owner" | "member";
  joinedAt: number;
  /**
   * id локального списка, из которого этот общий был сделан.
   *
   * Нужен, чтобы в хабе не показывать ДВЕ карточки с одинаковым именем —
   * локальный оригинал и общий. Владелец продукта на приёмке сам попался в эту
   * ловушку: открыл на втором устройстве локальную копию, увидел её пустой и
   * решил, что синхронизация сломана.
   *
   * Локальный список при этом никуда не девается: он лежит в localStorage как
   * лежал, просто не дублируется в списке карточек. Уберёте общий с
   * устройства — оригинал снова появится.
   */
  fromLocalId?: string;
};

export type SharedItem = {
  id: string;
  name: string;
  checked: boolean;
  checkedBy?: string | null;
  createdBy?: string | null;
};

export type SharedMember = {
  memberRef: string;
  name: string;
  joinedAt: string;
};

export type SharedSort = { sig: string; groups: ShoppingGroup[] };

export type SharedSnapshot = {
  id: string;
  name: string;
  ownerRef: string | null;
  updatedAt: string | null;
  joined: true;
  memberRef: string;
  items: SharedItem[];
  members: SharedMember[];
  /**
   * Раскладка по отделам, посчитанная кем-то из участников и сохранённая на
   * сервере. Отсутствует у только что созданного списка — отсюда `?` и `null`.
   */
  sort?: SharedSort | null;
};

export type SharedPreview = {
  id: string;
  name: string;
  itemCount: number;
  joined: false;
};

export function newMemberRef(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// --- Личность участника в конкретном списке ---------------------------------

export type SharedMemberIdentity = { memberRef: string; name: string };

export function loadMemberIdentity(listId: string): SharedMemberIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${MEMBER_KEY_PREFIX}${listId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const memberRef = typeof parsed?.memberRef === "string" ? parsed.memberRef : "";
    const name = typeof parsed?.name === "string" ? parsed.name : "";
    if (!memberRef) return null;
    return { memberRef, name };
  } catch {
    return null;
  }
}

export function saveMemberIdentity(listId: string, identity: SharedMemberIdentity): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${MEMBER_KEY_PREFIX}${listId}`, JSON.stringify(identity));
  } catch {
    // Приватный режим / переполнение — не ломаем сценарий. Человек останется
    // участником на сервере, но на этом устройстве попросит имя заново.
  }
}

/**
 * Имя, которым человек уже представлялся в других общих списках — чтобы не
 * заставлять вводить его каждый раз. Берём из самого свежего указателя.
 */
export function lastKnownMemberName(): string {
  const pointers = loadSharedPointers();
  for (let i = pointers.length - 1; i >= 0; i--) {
    const identity = loadMemberIdentity(pointers[i].id);
    if (identity?.name) return identity.name;
  }
  return "";
}

// --- Пометка «человек пришёл по приглашению» --------------------------------
//
// Живёт в sessionStorage, то есть на одну вкладку/сессию. Нужна знакомству
// («Привет! SmartCook — твой ИИ-шеф»), чтобы не выскакивать НИ НА ОДНОМ шаге
// пути приглашения. Одной проверки маршрута /shopping/join/ мало: человек
// уходит с этого экрана через несколько секунд — на /shopping или по таб-бару,
// и плашка встречала его уже там. Приёмка это и показала.
//
// Именно session, а не localStorage: в следующий заход человек уже осмотрелся,
// и знакомство ему показать нормально.

const INVITE_FLOW_KEY = "smartcook_invite_flow";

export function markInviteFlow(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(INVITE_FLOW_KEY, "1");
  } catch {
    // Приватный режим — переживём: в худшем случае человек увидит знакомство.
  }
}

export function isInviteFlow(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(INVITE_FLOW_KEY) === "1";
  } catch {
    return false;
  }
}

// --- Указатели «мои общие списки» -------------------------------------------

function normalizePointer(raw: unknown): SharedListPointer | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id) return null;
  if (typeof o.memberRef !== "string" || !o.memberRef) return null;
  return {
    id: o.id,
    name: typeof o.name === "string" ? o.name : "Общий список",
    memberRef: o.memberRef,
    role: o.role === "owner" ? "owner" : "member",
    joinedAt: typeof o.joinedAt === "number" && Number.isFinite(o.joinedAt) ? o.joinedAt : Date.now(),
    ...(typeof o.fromLocalId === "string" && o.fromLocalId ? { fromLocalId: o.fromLocalId } : {}),
  };
}

/**
 * id локальных списков, которые уже стали общими, — чтобы хаб не показывал их
 * второй раз. Множество, а не массив: проверка идёт на каждой карточке.
 */
export function convertedLocalListIds(pointers: SharedListPointer[]): Set<string> {
  const ids = new Set<string>();
  for (const p of pointers) if (p.fromLocalId) ids.add(p.fromLocalId);
  return ids;
}

export function loadSharedPointers(): SharedListPointer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SHARED_LISTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizePointer).filter((p): p is SharedListPointer => p !== null);
  } catch {
    return [];
  }
}

function savePointers(pointers: SharedListPointer[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SHARED_LISTS_KEY, JSON.stringify(pointers));
  } catch {
    // См. комментарий в saveMemberIdentity.
  }
}

/** Добавляет или обновляет указатель. Существующий не дублируется. */
export function rememberSharedList(pointer: SharedListPointer): SharedListPointer[] {
  const existing = loadSharedPointers();
  const without = existing.filter((p) => p.id !== pointer.id);
  const next = [pointer, ...without];
  savePointers(next);
  return next;
}

/**
 * Убирает список из хаба ЭТОГО устройства.
 *
 * Именно «убрать у себя», а не «удалить»: данные на сервере остаются, другие
 * участники ничего не теряют. Формулировки в интерфейсе должны это отражать.
 */
export function forgetSharedList(listId: string): SharedListPointer[] {
  const next = loadSharedPointers().filter((p) => p.id !== listId);
  savePointers(next);
  return next;
}

export function updatePointerName(listId: string, name: string): void {
  const pointers = loadSharedPointers();
  const next = pointers.map((p) => (p.id === listId ? { ...p, name } : p));
  savePointers(next);
}

// --- Сеть -------------------------------------------------------------------

export class SharedListError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseError(res: Response, fallback: string): Promise<never> {
  const data = await res.json().catch(() => ({}));
  throw new SharedListError(
    typeof data?.error === "string" && data.error ? data.error : fallback,
    res.status,
  );
}

export async function createSharedList(input: {
  name: string;
  items: string[];
  ownerRef: string;
  ownerName: string;
}): Promise<SharedSnapshot> {
  const res = await fetch("/api/shopping/shared", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) await parseError(res, "Не удалось создать общий список");
  return (await res.json()) as SharedSnapshot;
}

export async function fetchSharedList(
  listId: string,
  memberRef: string | null,
): Promise<SharedSnapshot | SharedPreview> {
  const qs = memberRef ? `?memberRef=${encodeURIComponent(memberRef)}` : "";
  const res = await fetch(`/api/shopping/shared/${listId}${qs}`, { cache: "no-store" });
  if (!res.ok) await parseError(res, "Не удалось загрузить список");
  return (await res.json()) as SharedSnapshot | SharedPreview;
}

export async function joinSharedList(
  listId: string,
  memberRef: string,
  name: string,
): Promise<SharedSnapshot> {
  const res = await fetch(`/api/shopping/shared/${listId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberRef, name }),
  });
  if (!res.ok) await parseError(res, "Не удалось вступить в список");
  return (await res.json()) as SharedSnapshot;
}

export async function addSharedItems(
  listId: string,
  memberRef: string,
  names: string[],
): Promise<{ added: number; duplicate: number; limited: boolean }> {
  const res = await fetch(`/api/shopping/shared/${listId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberRef, names }),
  });
  if (!res.ok) await parseError(res, "Не удалось добавить позиции");
  return (await res.json()) as { added: number; duplicate: number; limited: boolean };
}

export async function patchSharedItem(
  listId: string,
  itemId: string,
  memberRef: string,
  patch: { checked?: boolean; deleted?: true },
): Promise<void> {
  const res = await fetch(`/api/shopping/shared/${listId}/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberRef, ...patch }),
  });
  // 404 здесь — не ошибка сценария, а гонка: позицию уже убрал другой участник.
  // Экран всё равно перечитает снимок, поэтому молча выходим.
  if (res.status === 404) return;
  if (!res.ok) await parseError(res, "Не удалось обновить позицию");
}

/**
 * Разложить общий список по отделам.
 *
 * Сервер сам возьмёт актуальные позиции из БД, посчитает раскладку (или отдаст
 * уже посчитанную для этого же набора, не тратя вызов модели), сохранит её и
 * разошлёт остальным участникам.
 */
export async function sortSharedList(
  listId: string,
  memberRef: string,
): Promise<SharedSort> {
  const res = await fetch(`/api/shopping/shared/${listId}/sort`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberRef }),
  });
  if (!res.ok) await parseError(res, "Не удалось разложить по отделам");
  const data = (await res.json()) as { sig?: string; groups?: unknown };
  return {
    sig: typeof data.sig === "string" ? data.sig : "",
    groups: Array.isArray(data.groups) ? (data.groups as ShoppingGroup[]) : [],
  };
}

export async function clearSharedChecked(listId: string, memberRef: string): Promise<number> {
  const res = await fetch(
    `/api/shopping/shared/${listId}/items?memberRef=${encodeURIComponent(memberRef)}`,
    { method: "DELETE" },
  );
  if (!res.ok) await parseError(res, "Не удалось очистить купленное");
  const data = (await res.json()) as { removed?: number };
  return data.removed ?? 0;
}
