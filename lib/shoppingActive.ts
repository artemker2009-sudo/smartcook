// Настройка просмотра списка покупок.
//
// Раньше здесь лежал ещё и «активный список»: раздел был одноэкранным, и надо
// было помнить, какой список открыт. Теперь это делает АДРЕС — /shopping/<id>,
// — а значит и «назад» в браузере, в PWA и в нативной оболочке работает сам,
// без нашего участия. Ключ активного списка убран вместе с лентой чипов.

const GROUPED_KEY = "smartcook_shopping_grouped_v1";
// Пометка «в список пришли из хаба» — на одну вкладку/сессию.
const FROM_HUB_KEY = "smartcook_shopping_from_hub";

/**
 * Ставится, когда человек открывает список из хаба, и нужна ровно для одного:
 * понять, чем должна быть ссылка «← Покупки» в шапке списка — шагом НАЗАД по
 * истории или обычным переходом.
 *
 * Без этой развилки любой из вариантов ломается:
 *   • всегда push — история растёт (хаб → список → хаб → …), и системная
 *     кнопка «назад» в TWA/Capacitor начинает возвращать в список вместо
 *     выхода из раздела;
 *   • всегда history.back() — человек, пришедший по прямой ссылке на список
 *     (закладка, холодный старт приложения), улетает из приложения совсем.
 *
 * sessionStorage, а не localStorage: это про текущий сеанс навигации, а не про
 * настройку. Перезагрузка страницы списка пометку не портит — хаб всё равно
 * остаётся позади в истории.
 */
export function markOpenedFromHub(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(FROM_HUB_KEY, "1");
  } catch {
    // Приватный режим: ссылка «← Покупки» просто сделает обычный переход.
  }
}

/** Хаб стоит позади в истории — «назад» вернёт туда, куда нужно. */
export function openedFromHub(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(FROM_HUB_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearOpenedFromHub(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(FROM_HUB_KEY);
  } catch {
    // см. markOpenedFromHub
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
    // Приватный режим / переполнение: раздел продолжит работать, просто
    // режим не запомнится до следующего запуска.
  }
}
