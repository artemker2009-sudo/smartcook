// Что открыто в разделе «Покупки»: активный список и режим просмотра.
//
// Раздел стал ОДНОЭКРАННЫМ (эталон — Bring!): всегда открыт один список, а
// остальные переключаются чипами сверху. Значит «какой именно открыт» — это
// состояние, которое обязано переживать уход в другой раздел и закрытие
// приложения, иначе человек каждый раз возвращается не туда, где был.
//
// Два новых ключа localStorage, никакой БД и никаких миграций: и списки, и
// указатели общих списков лежат там же, рядом (lib/shoppingLists.ts,
// lib/sharedShoppingList.ts).

const ACTIVE_KEY = "smartcook_shopping_active_v1";
const GROUPED_KEY = "smartcook_shopping_grouped_v1";

/**
 * id последнего открытого списка — локального или общего (они из разных
 * хранилищ, но id не пересекаются: uuid против uuid).
 *
 * null означает «ничего не запомнили» — вызывающий сам выбирает первый
 * доступный список. Проверять, что список ещё существует, тоже его дело:
 * список могли удалить, а общий — убрать с устройства.
 */
export function loadActiveListId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    return raw && raw.length <= 128 ? raw : null;
  } catch {
    return null;
  }
}

export function saveActiveListId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Приватный режим / переполнение: раздел продолжит работать, просто
    // откроется на первом списке.
  }
}

/**
 * Режим просмотра — по отделам или в порядке добавления. Один на весь раздел,
 * а не на каждый список: человек выбирает, КАК ему удобно ходить по магазину,
 * и переспрашивать это на каждом списке незачем.
 */
export function loadGroupedMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(GROUPED_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveGroupedMode(grouped: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GROUPED_KEY, grouped ? "1" : "0");
  } catch {
    // См. saveActiveListId.
  }
}
