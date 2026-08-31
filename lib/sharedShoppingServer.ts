import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_SHOPPING_ITEM_LENGTH, sanitizeShoppingName } from "./shoppingList";
import { sanitizeListName } from "./shoppingLists";

// Общие серверные проверки для роутов /api/shopping/shared/*.
//
// Санитизация здесь — ПОВТОРНАЯ (как в /api/shopping/sort), а не единственная
// линия защиты: клиент уже почистил ввод, но клиенту мы не верим.

// Совпадает с CHECK-ограничением в supabase_shared_shopping_lists.sql
// (char_length(owner_ref) between 1 and 64). Если разъедется — вставка упадёт
// на уровне БД, поэтому число здесь и в миграции должно быть одним и тем же.
export const MAX_MEMBER_REF_LENGTH = 64;

// Максимум участников одного списка. Не бизнес-правило, а защита: по одной
// ссылке нельзя набить сотни «участников».
export const MAX_MEMBERS_PER_LIST = 20;

/**
 * Убирает одинокие половинки суррогатных пар.
 *
 * `sanitizeShoppingName` режет строку через `.slice(0, 50)`, то есть по
 * UTF-16 code units. Если 50-й юнит оказался ПЕРВОЙ половиной эмодзи, на выходе
 * остаётся одинокий суррогат. В localStorage это безобидно и живёт так сегодня,
 * но Postgres такую байт-последовательность отвергает — и роут отдал бы 500
 * вместо добавления позиции. Здесь, на границе с БД, дочищаем.
 *
 * lib/shoppingList.ts намеренно не трогаем: он работает в проде, а проблема
 * проявляется только при записи в базу.
 */
function stripLoneSurrogates(value: string): string {
  return value.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

/** Название позиции для записи в БД: санитайз клиента + защита от битых пар. */
export function sanitizeItemNameForDb(raw: unknown): string {
  return stripLoneSurrogates(sanitizeShoppingName(raw)).trim();
}

/** Имя участника — тот же класс санитайза, что и у позиций (≤50 симв.). */
export function sanitizeMemberName(raw: unknown): string {
  return sanitizeItemNameForDb(raw);
}

/** Имя списка — ≤60 симв., с той же защитой от битых суррогатных пар. */
export function sanitizeSharedListName(raw: unknown, fallback: string): string {
  return stripLoneSurrogates(sanitizeListName(raw, fallback)).trim() || fallback;
}

/**
 * memberRef — идентификатор, сгенерированный на клиенте (как party.user_id).
 * Подлинность сервер не проверяет — только форму: непустая строка разумной
 * длины без управляющих символов.
 */
export function sanitizeMemberRef(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
    .slice(0, MAX_MEMBER_REF_LENGTH);
}

export const MAX_ITEM_NAME_LENGTH = MAX_SHOPPING_ITEM_LENGTH;

export type MembershipRow = {
  id: string;
  member_ref: string;
  member_name: string;
};

/**
 * Проверяет, что memberRef — действующий участник списка. Вышедшие
 * (`left_at is not null`) участниками не считаются, но строки их не удаляются.
 *
 * Владелец отдельной ветки не требует: при создании списка он тут же
 * вставляется в shared_list_members, поэтому проверка одна для всех.
 */
export async function findMembership(
  supabase: SupabaseClient,
  listId: string,
  memberRef: string,
): Promise<MembershipRow | null> {
  if (!listId || !memberRef) return null;
  const { data, error } = await supabase
    .from("shared_list_members")
    .select("id,member_ref,member_name")
    .eq("shared_list_id", listId)
    .eq("member_ref", memberRef)
    .is("left_at", null)
    .maybeSingle();
  if (error) {
    console.error("[sharedShopping] membership lookup failed", error.message);
    return null;
  }
  return (data as MembershipRow | null) ?? null;
}

export type SharedListRow = {
  id: string;
  name: string;
  owner_ref: string;
  updated_at: string;
  archived_at: string | null;
};

/** Живой (не архивированный) список по id. */
export async function findLiveList(
  supabase: SupabaseClient,
  listId: string,
): Promise<SharedListRow | null> {
  const { data, error } = await supabase
    .from("shared_lists")
    .select("id,name,owner_ref,updated_at,archived_at")
    .eq("id", listId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) {
    console.error("[sharedShopping] list lookup failed", error.message);
    return null;
  }
  return (data as SharedListRow | null) ?? null;
}

/** Отметка времени последнего изменения списка. Триггера в БД нет намеренно. */
export async function touchSharedList(supabase: SupabaseClient, listId: string): Promise<void> {
  const { error } = await supabase
    .from("shared_lists")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", listId);
  if (error) console.error("[sharedShopping] failed to touch updated_at", error.message);
}

/** UUID-форма id списка: мусор в адресе не должен доходить до запроса в БД. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
