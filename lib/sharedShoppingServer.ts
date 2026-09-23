import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MAX_SHOPPING_ITEM_LENGTH,
  buildGroups,
  sanitizeShoppingName,
  signatureFromNames,
  type ShoppingGroup,
} from "./shoppingList";
import { departmentsFromGroups, nameKey } from "./shoppingDepartments";
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
  // Раскладка по отделам: подпись набора позиций, для которого она считалась,
  // и сами группы. Живут в БД, чтобы результат видели ВСЕ участники, а не
  // только тот, кто нажал (supabase_shared_list_sort.sql).
  sort_sig: string | null;
  sort_groups: unknown;
};

/** Живой (не архивированный) список по id. */
export async function findLiveList(
  supabase: SupabaseClient,
  listId: string,
): Promise<SharedListRow | null> {
  const { data, error } = await supabase
    .from("shared_lists")
    .select("id,name,owner_ref,updated_at,archived_at,sort_sig,sort_groups")
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

/**
 * Раскладка списка в том виде, в каком её ждёт клиент, либо null.
 *
 * Колонки заполняются парой, но проверяем обе: строка могла пережить неудачное
 * сохранение или ручную правку в Dashboard, и половинчатая раскладка сломала бы
 * группировку на экране.
 */
export function sharedSortFromRow(row: SharedListRow): { sig: string; groups: unknown[] } | null {
  if (!row.sort_sig || !Array.isArray(row.sort_groups)) return null;
  return { sig: row.sort_sig, groups: row.sort_groups };
}

/**
 * Стартовый набор позиций для «Сделать общим»: название + отметка «куплено».
 *
 * Раньше клиент присылал просто массив строк, и галочки терялись на границе —
 * человек отмечал купленное, делал список общим и получал его заново
 * неотмеченным. Строки по-прежнему принимаем: в кэше сервис-воркера может
 * лежать старый бандл, и его запрос обязан продолжать работать.
 */
export type StartItem = { name: string; checked: boolean };

export function startItemsForDb(raw: unknown[], limit: number): StartItem[] {
  const items: StartItem[] = [];
  for (const candidate of raw) {
    const source =
      typeof candidate === "string"
        ? { name: candidate, checked: false }
        : ((candidate ?? {}) as { name?: unknown; checked?: unknown });
    const name = sanitizeItemNameForDb(source.name);
    if (!name) continue;
    if (items.some((it) => it.name.toLowerCase() === name.toLowerCase())) continue;
    items.push({ name, checked: source.checked === true });
    if (items.length >= limit) break;
  }
  return items;
}

/**
 * Раскладка по отделам, принесённая клиентом при «Сделать общим».
 *
 * Клиенту не верим — но и терять раскладку нельзя: она стоила вызова модели, а
 * человек уже разложил список и ждёт его в том же виде. Поэтому из присланного
 * берём ТОЛЬКО соответствие «название → отдел», а сами группы собираем заново
 * через buildGroups из тех названий, что реально легли в базу. Подсунуть лишнюю
 * позицию, переименовать существующую или выдумать отдел через это нельзя —
 * ровно та же защита, что стоит на ответе модели в /api/shopping/sort.
 *
 * Подпись считаем сами. Не совпала с присланной — набор позиций по дороге
 * изменился (дедуп, обрезка длины), раскладка к нему уже не относится: не
 * переносим, и экран честно предложит разложить заново. Названия, для которых
 * отдела не нашлось, падают в «Прочее» — это лучше, чем не показать позицию
 * вовсе.
 */
export function startSortForDb(
  raw: unknown,
  names: string[],
): { sig: string; groups: ShoppingGroup[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const sig = (raw as { sig?: unknown }).sig;
  const groups = (raw as { groups?: unknown }).groups;
  if (typeof sig !== "string" || !Array.isArray(groups) || names.length === 0) return null;

  const ourSig = signatureFromNames(names);
  if (ourSig !== sig) return null;

  const byName = departmentsFromGroups(groups as ShoppingGroup[]);
  const rebuilt = buildGroups(
    names,
    names.map((name) => byName.get(nameKey(name))),
  );
  return rebuilt.length > 0 ? { sig: ourSig, groups: rebuilt } : null;
}
