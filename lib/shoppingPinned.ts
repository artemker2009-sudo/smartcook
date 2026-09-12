// Закреплённые списки покупок.
//
// Закрепление — ЛОКАЛЬНОЕ, на этом устройстве, и для общего (семейного) списка
// тоже. Это не свойство списка, а порядок на конкретном телефоне: у мамы
// сверху «Пятёрочка», у сына — «Общий». Гонять такое на сервер значило бы
// навязывать один порядок всем участникам.
//
// Отдельный ключ, а не поле в записи списка: у общих списков записи на
// устройстве нет вовсе — есть только указатель, а хранить одно и то же в двух
// местах пришлось бы синхронизировать.

const PINNED_KEY = "smartcook_shopping_pinned_v1";
// Больше и не нужно: закрепление теряет смысл, когда «первых» списков десяток.
const MAX_PINNED = 20;

/** id закреплённых списков — локальных и общих вместе. */
export function loadPinned(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 128),
    );
  } catch {
    return new Set();
  }
}

function save(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify([...ids].slice(0, MAX_PINNED)));
  } catch {
    // Приватный режим / переполнение: порядок в хабе просто не запомнится.
  }
}

export function isPinned(id: string): boolean {
  return loadPinned().has(id);
}

/** Переключает закрепление и возвращает НОВОЕ состояние (true — закреплён). */
export function togglePinned(id: string): boolean {
  const ids = loadPinned();
  const next = !ids.has(id);
  if (next) ids.add(id);
  else ids.delete(id);
  save(ids);
  return next;
}

/**
 * Убирает id из закреплённых — при удалении списка. Иначе id висел бы в ключе
 * вечно и «всплыл» бы, если новый список случайно получил тот же id (для
 * общего списка это реально: убрали с устройства, вступили заново).
 */
export function unpin(id: string): void {
  const ids = loadPinned();
  if (!ids.delete(id)) return;
  save(ids);
}
