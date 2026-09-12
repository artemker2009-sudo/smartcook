"use client";

import { useMemo, useState } from "react";

import type { ShoppingGroup } from "@/lib/shoppingList";
import { placeNames, uncoveredNames } from "@/lib/shoppingDepartments";
import type { ListScreenSort, SortState } from "@/components/shopping/types";

type Options = {
  /** Названия всех позиций списка, включая купленные. */
  names: string[];
  /** Раскладка, которая уже есть: локальная из localStorage или общая из БД. */
  cache: { sig: string; groups: ShoppingGroup[] } | null;
  /** Человек смотрит по отделам. Хранится у хозяина (переживает переключение списков). */
  grouped: boolean;
  setGrouped: (grouped: boolean) => void;
  /** Посчитать раскладку. Сохранять результат — дело хозяина. */
  run: () => Promise<void>;
  /** Позиций нет — считать нечего. */
  empty: boolean;
};

/**
 * Переключатель «по отделам / по порядку» — одна логика на локальный и на общий
 * список (эндпоинты разные, поведение обязано быть одинаковым).
 *
 * Главное здесь — честность про стоимость. Раскладка считается моделью на
 * сервере, поэтому:
 *   • кэш совпал с текущим набором (ready) — переключение мгновенное, без сети;
 *   • кэша нет (none) или позиции менялись (stale) — нажатие уходит в запрос,
 *     и это видно: спиннер на иконке и строка «Раскладываю…» на месте первого
 *     отдела;
 *   • выключение — всегда мгновенно и бесплатно.
 *
 * Целиком раскладку заново НЕ пересчитываем: новые позиции дописывает в неё
 * useAutoPlace — по словарю, а модель спрашивает только про незнакомое.
 *
 * «Готово» — это когда в раскладке есть КАЖДАЯ позиция, а не совпадение
 * подписи. Удалили продукт или очистили купленное — раскладка по-прежнему
 * верна для оставшегося, и рассыпать список ради этого незачем.
 */
export function useSortToggle({ names, cache, grouped, setGrouped, run, empty }: Options): ListScreenSort {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state: SortState = cache ? (uncoveredNames(cache.groups, names).length === 0 ? "ready" : "stale") : "none";
  // Удалённое из раскладки выбрасываем: иначе «Скопировать текстом» принёс бы
  // позиции, которых в списке уже нет.
  const groups = useMemo(
    () => (state === "ready" && cache ? placeNames(cache.groups, [], names) : null),
    [state, cache, names],
  );

  const compute = async () => {
    if (busy || empty) return;
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось разложить по отделам");
      // Раскладки не будет — возвращаем человека в тот вид, который работает.
      setGrouped(false);
    } finally {
      setBusy(false);
    }
  };

  const onToggle = () => {
    setError(null);
    if (grouped) {
      setGrouped(false);
      return;
    }
    if (empty) return;
    setGrouped(true);
    // Раскладка есть, но в ней не хватает новых позиций — модель заново НЕ
    // зовём: их допишет useAutoPlace (словарь, а незнакомое — отдельным
    // маленьким запросом). Считаем с нуля, только когда раскладки нет вовсе.
    if (state === "none") void compute();
  };

  return {
    state,
    groups,
    grouped,
    busy,
    error,
    onToggle,
    // Пересчёт устаревшей раскладки по явному нажатию — ещё один вызов модели,
    // поэтому отдельным действием, а не втихую при добавлении продукта.
    onRecompute: () => void compute(),
  };
}
