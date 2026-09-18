// Поделиться списком покупок БЕЗ БД — весь список кодируется в ссылку.
// Формат: https://<origin>/shopping?shared=<base64url>&utm_source=shopping_share
//
// Хост — тот, на котором человек сейчас стоит (shareUrl из lib/site.ts), а не
// канон: в приложении и в установленном PWA это старый smart-cook.pro, и ссылка
// на канон увела бы на другой origin с пустым localStorage. Поэтому адрес
// вычисляется в момент вызова, а не константой при загрузке модуля.
//
// БЕЗОПАСНОСТЬ: при разборе ссылки принимаем ТОЛЬКО строки и жёстко их
// санитизируем (обрезка 50 симв./позиция, максимум SHARE_MAX_ITEMS позиций,
// удаление управляющих символов, дедуп). Рендерится всё строго текстом —
// никакого HTML/кода из ссылки исполнить нельзя.

import { sanitizeShoppingName } from "./shoppingList";
import { shareUrl } from "./site";

export const SHARE_PARAM = "shared";
export const SHARE_MAX_ITEMS = 80;
export const SHARE_UTM = "shopping_share";

export type SharedPayload = { name: string; items: string[] };

// Компактный вид в JSON: n — имя, i — массив названий позиций.
type Wire = { n?: unknown; i?: unknown };

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Можно ли уложить список в ссылку (иначе — предложить поделиться текстом). */
export function canShareByLink(itemCount: number): boolean {
  return itemCount <= SHARE_MAX_ITEMS;
}

/** Кодирует список в base64url-строку для параметра ?shared=. */
export function encodeSharedList(name: string, itemNames: string[]): string {
  const payload: Wire = {
    n: (sanitizeShoppingName(name) || "Список покупок").slice(0, 50),
    i: itemNames.map((n) => sanitizeShoppingName(n)).filter(Boolean).slice(0, SHARE_MAX_ITEMS),
  };
  return toBase64Url(JSON.stringify(payload));
}

/** Собирает полную ссылку для шаринга (текущий домен + utm). */
export function buildShareUrl(name: string, itemNames: string[]): string {
  const encoded = encodeSharedList(name, itemNames);
  return `${shareUrl("/shopping")}?${SHARE_PARAM}=${encoded}&utm_source=${SHARE_UTM}`;
}

/**
 * Разбирает ?shared= с ПОЛНОЙ санитизацией. Возвращает null на любой мусор —
 * страница не должна ломаться от подделанной ссылки. Имена — только строки,
 * обрезаны до 50 символов, без управляющих символов, дедуп, максимум
 * SHARE_MAX_ITEMS позиций.
 */
export function decodeSharedList(encoded: unknown): SharedPayload | null {
  if (typeof encoded !== "string" || encoded.length === 0) return null;
  let json: string;
  try {
    json = fromBase64Url(encoded);
  } catch {
    return null;
  }

  let obj: Wire;
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    obj = parsed as Wire;
  } catch {
    return null;
  }

  const name = sanitizeShoppingName(obj.n) || "Список покупок";
  const rawItems = Array.isArray(obj.i) ? obj.i : [];
  const items: string[] = [];
  for (const raw of rawItems) {
    const value = sanitizeShoppingName(raw);
    if (!value) continue;
    if (items.some((x) => x.toLowerCase() === value.toLowerCase())) continue;
    items.push(value);
    if (items.length >= SHARE_MAX_ITEMS) break;
  }

  if (items.length === 0) return null;
  return { name, items };
}
