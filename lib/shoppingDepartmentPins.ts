// Исправления отделов, сделанные РУКАМИ: «переместить в отдел…» в «Покупках».
//
// Зачем отдельно от «выученного» (smartcook_shopping_departments_v1). Выученное
// пишется из ЛЮБОЙ раскладки, включая модельную, поэтому ближайшее «обновить
// отделы» его переписывает мнением модели. Для догадки это правильно: модель
// видит список целиком и может передумать. Для решения человека — недопустимо:
// он уже сказал, где лежит хумус, и спорить с ним нечем.
//
// Отсюда два свойства, которые и составляют смысл файла:
//   1. исправление спрашивается ПЕРВЫМ — раньше выученного, базового словаря и
//      модели (см. lookupDepartment);
//   2. исправление применяется ПОВЕРХ готовой раскладки (applyPins) — в том
//      числе поверх только что посчитанной моделью, иначе полный пересчёт
//      вернул бы позицию обратно.
//
// Источник правды — устройство. У залогиненных есть серверное зеркало
// (lib/shoppingDepartmentSync.ts, таблица user_product_departments), но оно
// именно зеркало: сеть здесь не упоминается вовсе, и модуль работает у гостя
// ровно так же.
//
// Импорты внутри lib/ — относительные: vitest не знает алиаса @/.

import {
  buildDepartmentIndex,
  isDepartment,
  lookupInIndex,
  nameKey,
  placeNames,
  type DepartmentIndex,
} from "./shoppingDepartments";
import { OTHER_DEPARTMENT, type ShoppingDepartment, type ShoppingGroup } from "./shoppingList";
import { splitQuantity } from "./shoppingQuantity";

export const DEPARTMENT_PINS_KEY = "smartcook_shopping_department_pins_v1";

/**
 * Сколько исправлений помним. Двести — это заведомо больше, чем человек
 * поправит руками за годы; кап нужен не для экономии, а чтобы хранилище (общее
 * со списками покупок) нельзя было раздуть без предела.
 */
export const MAX_DEPARTMENT_PINS = 200;

export type DepartmentPin = {
  /** Ключ продукта: нижний регистр, без количества. См. pinKey. */
  name: string;
  department: ShoppingDepartment;
  /** Когда поправили, epoch ms. По нему решается, чьё исправление новее. */
  at: number;
};

/**
 * Ключ продукта. Ровно та же нормализация, которой словарь ищет отдел
 * (nameKey + отброшенное количество): исправление «Хумус 200 г» обязано
 * сработать на «хумус» и наоборот.
 */
export function pinKey(name: string): string {
  return splitQuantity(nameKey(name)).label.trim();
}

function normalizePin(raw: unknown): DepartmentPin | null {
  if (!raw || typeof raw !== "object") return null;
  const name = (raw as { name?: unknown }).name;
  const department = (raw as { department?: unknown }).department;
  const at = (raw as { at?: unknown }).at;
  if (typeof name !== "string") return null;
  const key = pinKey(name);
  // Длина — тот же предел, что у позиции списка (MAX_SHOPPING_ITEM_LENGTH).
  if (!key || key.length > 50) return null;
  if (!isDepartment(department)) return null;
  // «Прочее» не исправление, а отказ выбрать отдел: запоминать его значило бы
  // навсегда закрепить позицию в мусорной корзине списка.
  if (department === OTHER_DEPARTMENT) return null;
  return { name: key, department, at: typeof at === "number" && Number.isFinite(at) ? at : 0 };
}

/** Исправления с устройства, самые свежие в конце. Мусор отбрасывается. */
export function loadPins(): DepartmentPin[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(DEPARTMENT_PINS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const out: DepartmentPin[] = [];
    const seen = new Set<string>();
    for (const raw of parsed) {
      const pin = normalizePin(raw);
      if (!pin || seen.has(pin.name)) continue;
      seen.add(pin.name);
      out.push(pin);
    }
    return out.slice(-MAX_DEPARTMENT_PINS);
  } catch {
    return [];
  }
}

export function savePins(pins: DepartmentPin[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DEPARTMENT_PINS_KEY, JSON.stringify(pins.slice(-MAX_DEPARTMENT_PINS)));
  } catch {
    // Приватный режим / переполнение: исправление не переживёт перезагрузку.
    // Ломать из-за этого сам перенос нельзя — на экране он уже произошёл.
  }
}

/**
 * Добавляет или заменяет исправление. Возвращает новый набор (уже сохранённый).
 *
 * Запись всегда уезжает в КОНЕЦ: свежие исправления вытесняют самые старые, а
 * не случайные.
 */
export function pinDepartment(name: string, department: ShoppingDepartment, at = Date.now()): DepartmentPin[] {
  const pin = normalizePin({ name, department, at });
  if (!pin) return loadPins();
  const next = [...loadPins().filter((p) => p.name !== pin.name), pin];
  savePins(next);
  return next;
}

/** Индекс для lookupDepartment: терпит падежи и порядок слов. */
export function pinsIndex(pins: DepartmentPin[]): DepartmentIndex {
  return buildDepartmentIndex(pins.map((p) => [p.name, p.department] as [string, ShoppingDepartment]));
}

export function loadPinsIndex(): DepartmentIndex {
  return pinsIndex(loadPins());
}

/**
 * Приводит готовую раскладку в согласие с исправлениями человека.
 *
 * Зовётся на КАЖДЫЙ показ разложенного списка, поэтому устроено так, чтобы быть
 * бесплатным в обычном случае: если всё уже лежит там, где человек поставил,
 * возвращается тот же самый массив (===), и рендер не пересчитывается.
 *
 * Позиция, которую перенесли, встаёт в конец нового отдела — там, где она и
 * оказалась в момент переноса.
 */
export function applyPins(
  groups: ShoppingGroup[],
  names: string[],
  index: DepartmentIndex | null,
): ShoppingGroup[] {
  if (!index || index.exact.size === 0) return groups;

  const placements: Array<{ name: string; department: ShoppingDepartment }> = [];
  for (const group of Array.isArray(groups) ? groups : []) {
    if (!group || !Array.isArray(group.items)) continue;
    for (const item of group.items) {
      if (typeof item !== "string") continue;
      const pinned = lookupInIndex(item, index);
      if (pinned && pinned !== group.department) placements.push({ name: item, department: pinned });
    }
  }
  if (placements.length === 0) return groups;
  return placeNames(groups, placements, names);
}

/**
 * Сведение исправлений устройства и сервера. Чистая функция — вся сеть в
 * lib/shoppingDepartmentSync.ts.
 *
 * Конфликт решается по времени: побеждает то исправление, которое сделали
 * позже. Терять тут нечему — это словарь предпочтений, а не данные: худшее, что
 * может случиться при расхождении, — «хумус» окажется в том отделе, куда его
 * положили на другом телефоне, и человек поправит его снова одним жестом.
 * Поэтому здесь нет ни копий, ни развилок, которые нужны спискам покупок.
 */
export function mergePins(local: DepartmentPin[], remote: DepartmentPin[]): DepartmentPin[] {
  const byName = new Map<string, DepartmentPin>();
  for (const pin of [...remote, ...local]) {
    const current = byName.get(pin.name);
    if (!current || pin.at >= current.at) byName.set(pin.name, pin);
  }
  return [...byName.values()].sort((a, b) => a.at - b.at).slice(-MAX_DEPARTMENT_PINS);
}
