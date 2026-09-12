"use client";

import { useState } from "react";

import type { ShoppingGroup } from "@/lib/shoppingList";
import type { ListScreenSort, SortState } from "@/components/shopping/types";

type Options = {
  /** Подпись текущего набора позиций (listSignature / signatureFromNames). */
  sig: string;
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
 * Сами по себе, без нажатия, раскладки НЕ пересчитываем: иначе каждое
 * добавление продукта тратило бы вызов модели, и лимит на роуте пришлось бы
 * ослаблять.
 */
export function useSortToggle({ sig, cache, grouped, setGrouped, run, empty }: Options): ListScreenSort {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state: SortState = cache ? (cache.sig === sig ? "ready" : "stale") : "none";
  const groups = state === "ready" ? cache!.groups : null;

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
    if (state !== "ready") void compute();
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
