// Строка «N из M куплено» в карточке «Список покупок» на Главной.
//
// ИСТОЧНИК ПРАВДЫ ТОТ ЖЕ, ЧТО В «ПОКУПКАХ»: те же записи localStorage и ТО ЖЕ
// ПРАВИЛО ПОРЯДКА, что у хаба (components/ShoppingApp.tsx) — сначала
// закреплённые, внутри группы по свежести правок. Иначе Главная показывала бы
// счётчик одного списка, а кнопка открывала раздел, где сверху стоит другой,
// и числа «не сходились» бы без всякой ошибки в данных.
//
// Чистая функция над уже прочитанными данными: чтение localStorage остаётся в
// компоненте, а правило проверяется тестом без браузера.

import { listProgress, listUpdatedAt, type ShoppingListRecord } from "./shoppingLists";
import { type SharedListPointer } from "./sharedShoppingList";

export type ListCounts = { total: number; done: number };

/**
 * Счётчик главного списка или null, если показывать нечего.
 *
 * Пустые списки пропускаем: «0 из 0 куплено» — не сведение, а шум. Общий
 * (семейный) список участвует наравне с локальными, но только если его
 * счётчик уже известен: позиции лежат на сервере, и до первого открытия
 * списка чисел у нас нет (см. SharedListPointer.counts).
 */
export function mainListCounts(input: {
  lists: ShoppingListRecord[];
  pointers?: SharedListPointer[];
  pinned?: ReadonlySet<string>;
  /** id локальных списков, уже ставших общими: в хабе они скрыты — и здесь тоже. */
  hidden?: ReadonlySet<string>;
}): ListCounts | null {
  const pinned = input.pinned ?? new Set<string>();
  const hidden = input.hidden ?? new Set<string>();

  const candidates: { counts: ListCounts; pinned: boolean; at: number }[] = [];

  for (const list of input.lists) {
    if (hidden.has(list.id)) continue;
    const counts = listProgress(list);
    if (counts.total === 0) continue;
    candidates.push({ counts, pinned: pinned.has(list.id), at: listUpdatedAt(list) });
  }

  for (const pointer of input.pointers ?? []) {
    if (!pointer.counts || pointer.counts.total === 0) continue;
    candidates.push({
      counts: pointer.counts,
      pinned: pinned.has(pointer.id),
      at: pointer.updatedAt ?? pointer.joinedAt,
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at - a.at);
  return candidates[0].counts;
}

/** «2 из 5 куплено». Отдельно от компонента — чтобы текст проверялся тестом. */
export function formatBoughtLine(counts: ListCounts): string {
  return `${counts.done} из ${counts.total} куплено`;
}
