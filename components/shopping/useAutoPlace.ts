"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { OTHER_DEPARTMENT, signatureFromNames, type ShoppingGroup, type SortCache } from "@/lib/shoppingList";
import {
  learnDepartments,
  loadLearnedIndex,
  lookupDepartment,
  nameKey,
  placeNames,
  uncoveredNames,
  type DepartmentIndex,
  type Placement,
} from "@/lib/shoppingDepartments";
import { applyPins } from "@/lib/shoppingDepartmentPins";
import { loadLists } from "@/lib/shoppingLists";

// Серия добавлений подряд («молоко», «хлеб», «хурма» за пять секунд) — один
// запрос, а не три.
const SYNC_DEBOUNCE_MS = 2000;

export type AutoPlaceRequest = {
  /** Позиции, отдел которых нашёлся в словаре. */
  known: Placement[];
  /** Позиции, про которые словарь не знает, — их спрашивают у модели. */
  unknown: string[];
  /** Тот же поиск по словарю, что у хука (с выученным на устройстве). */
  lookup: (name: string) => Placement["department"] | null;
};

type Options = {
  /** Все позиции списка, включая купленные. */
  names: string[];
  /**
   * Позиции, которые уже можно отправлять на сервер. У общего списка это всё,
   * кроме оптимистичных tmp-позиций: пока сервер их не записал, раскладывать
   * там нечего. По умолчанию — names.
   */
  syncNames?: string[];
  /** Сохранённая раскладка. null — список ни разу не раскладывали. */
  cache: SortCache | null;
  /** Человек смотрит по отделам. Без этого ничего не делаем и не тратим. */
  active: boolean;
  /**
   * Исправления, сделанные руками («переместить в отдел…»). Спрашиваются
   * раньше словаря и применяются ПОВЕРХ готовой раскладки — в том числе
   * поверх только что посчитанной моделью, иначе полный пересчёт вернул бы
   * позицию обратно в тот отдел, откуда её убрали.
   *
   * Необязательные: у общего (семейного) списка раскладка общая на всех
   * участников, и переносить её в одиночку нельзя.
   */
  pins?: DepartmentIndex | null;
  /**
   * Дописать раскладку: сохранить найденное в словаре и спросить модель про
   * незнакомое. Возвращает группы, которые пришли от модели, — их отделы
   * запоминаются в словарь устройства.
   */
  sync: (request: AutoPlaceRequest) => Promise<ShoppingGroup[] | null>;
};

/**
 * Новый продукт в разложенном списке встаёт в свой отдел САМ.
 *
 * Раньше любое добавление делало раскладку устаревшей: список рассыпался в
 * порядок добавления, а чип предлагал «обновить отделы» — то есть заново
 * отправить модели ВЕСЬ список ради одной строки.
 *
 * Теперь:
 *   • в словаре нашлось («сметана») — позиция сразу в своём отделе, без сети.
 *     Это считается прямо в рендере, поэтому нет даже кадра, где список
 *     рассыпался бы;
 *   • не нашлось («хурма») — временно в «Прочее» внизу, а через 2 секунды
 *     затишья уходит ОДИН запрос только про незнакомые позиции;
 *   • порядок уже разложенного не меняется: новая позиция встаёт в конец
 *     своего отдела.
 *
 * Лимиты не ослаблены: запрос идёт через тот же роут с тем же лимитером, и
 * только за тем, чего нет в словаре.
 */
export function useAutoPlace({ names, syncNames, cache, active, pins, sync }: Options): SortCache | null {
  const [learned, setLearned] = useState<DepartmentIndex | null>(null);
  // Что уже отправляли в этой сессии экрана. Без этого неудачный запрос
  // (лимит, нет сети) повторялся бы каждые две секунды.
  const [attempted, setAttempted] = useState<ReadonlySet<string>>(() => new Set());

  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  });

  // Словарь устройства: всё, что уже разложено в локальных списках, плюс
  // выученное раньше.
  useEffect(() => {
    // Функция, а не тело эффекта: localStorage читается только на клиенте,
    // а setState не вызывается синхронно прямо в теле эффекта.
    const init = () => {
      for (const list of loadLists()) {
        if (list.sort?.groups) learnDepartments(list.sort.groups);
      }
      setLearned(loadLearnedIndex());
    };
    init();
  }, []);

  // Раскладка общего списка приходит с сервера — её тоже в словарь.
  useEffect(() => {
    const learn = () => {
      if (cache?.groups && learnDepartments(cache.groups)) setLearned(loadLearnedIndex());
    };
    learn();
  }, [cache]);

  const effective = useMemo<SortCache | null>(() => {
    if (!active || !cache) return cache;
    const missing = uncoveredNames(cache.groups, names);
    const placements = missing.map((name) => ({
      name,
      department: lookupDepartment(name, learned, pins) ?? OTHER_DEPARTMENT,
    }));
    const base =
      placements.length === 0
        ? cache
        : { sig: signatureFromNames(names), groups: placeNames(cache.groups, placements) };
    // Исправления человека — последним слоем, поверх всего остального.
    const groups = applyPins(base.groups, names, pins ?? null);
    return groups === base.groups ? base : { ...base, groups };
  }, [active, cache, names, learned, pins]);

  // Ключ того, что ещё не сохранено. Меняется — таймер начинается заново.
  const pendingKey = useMemo(() => {
    if (!active || !cache) return "";
    return uncoveredNames(cache.groups, syncNames ?? names)
      .filter((name) => !attempted.has(nameKey(name)))
      .join("\n");
  }, [active, cache, names, syncNames, attempted]);

  useEffect(() => {
    if (!pendingKey) return;
    const timer = setTimeout(() => {
      const batch = pendingKey.split("\n");
      setAttempted((prev) => new Set([...prev, ...batch.map(nameKey)]));

      const lookup = (name: string) => lookupDepartment(name, learned, pins);
      const known: Placement[] = [];
      const unknown: string[] = [];
      for (const name of batch) {
        const department = lookup(name);
        if (department) known.push({ name, department });
        else unknown.push(name);
      }

      syncRef.current({ known, unknown, lookup }).then(
        (groups) => {
          if (groups && learnDepartments(groups)) setLearned(loadLearnedIndex());
        },
        () => {
          // Молча: позиция остаётся в «Прочее», список не ломается. Повторной
          // попытки в этой сессии не будет — следующая при новом открытии.
        },
      );
    }, SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [pendingKey, learned, pins]);

  return effective;
}
