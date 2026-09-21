// Избранное каталога «Идеи»: ОДНО хранилище с подпиской.
//
// ПРИЧИНА БАГА, ради которой модуль появился. Лента читала избранное ОДИН РАЗ
// — при монтировании — и дальше жила со своей копией. Пока возврат из рецепта
// перемонтирует ленту, это работает. Но Safari возвращает страницу из bfcache
// ЦЕЛИКОМ, с замороженным состоянием React: эффект монтирования не
// выполняется, и лента показывает избранное на момент своего первого захода.
// Сердечко на рецепте закрашено, в хранилище запись есть, а фильтр в шапке
// ленты пишет «Пока пусто». Воспроизведено на прод-сборке: запись в хранилище
// + pageshow без перемонтирования = пустой фильтр.
//
// Теперь избранное никто не копирует к себе. Экраны подписываются через
// useSyncExternalStore и перечитывают хранилище, когда оно могло измениться:
//   - своё событие — запись с этого же документа (событие storage в той же
//     вкладке НЕ приходит, это правило браузера);
//   - storage — запись из другой вкладки;
//   - pageshow — возврат из bfcache;
//   - visibilitychange и focus — возврат в приложение из фона.
//
// Снимок — СЫРАЯ строка из хранилища, а не массив: useSyncExternalStore
// сравнивает снимки через Object.is, и новый массив на каждом чтении
// перерисовывал бы экран бесконечно. Строку разбираем уже в хуке.

import { FAV_KEY, MAX_FAVORITES, toggleInList } from "./ideasLocal";
import {
  browserStorage,
  reportStorageFailure,
  verifiedWrite,
  type StorageLike,
} from "./storageWrite";

export const FAV_CHANGE_EVENT = "smartcook:ideas-fav";

type Listenable = {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
};

export type FavoritesEnv = {
  storage: StorageLike | null;
  /** window: здесь живут своё событие, storage, pageshow и focus. */
  target: (Listenable & { dispatchEvent(event: Event): boolean }) | null;
  /** document: visibilitychange приходит сюда, а не на window. */
  doc: (Listenable & { visibilityState?: string }) | null;
};

export type ToggleResult = { ok: true; on: boolean } | { ok: false; reason: string };

export function parseFavorites(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function createFavoritesStore(
  getEnv: () => FavoritesEnv,
  onWriteFailure?: (reason: string, bytes: number) => void,
) {
  const snapshot = (): string => {
    try {
      return getEnv().storage?.getItem(FAV_KEY) ?? "";
    } catch {
      return "";
    }
  };

  const subscribe = (notify: () => void): (() => void) => {
    const { target, doc } = getEnv();
    const onStorage = (event: Event) => {
      // key === null — хранилище очистили целиком (clear()).
      const key = (event as Event & { key?: string | null }).key;
      if (key === undefined || key === null || key === FAV_KEY) notify();
    };
    const onVisibility = () => {
      if (doc?.visibilityState !== "hidden") notify();
    };
    target?.addEventListener(FAV_CHANGE_EVENT, notify);
    target?.addEventListener("storage", onStorage);
    target?.addEventListener("pageshow", notify);
    target?.addEventListener("focus", notify);
    doc?.addEventListener("visibilitychange", onVisibility);
    return () => {
      target?.removeEventListener(FAV_CHANGE_EVENT, notify);
      target?.removeEventListener("storage", onStorage);
      target?.removeEventListener("pageshow", notify);
      target?.removeEventListener("focus", notify);
      doc?.removeEventListener("visibilitychange", onVisibility);
    };
  };

  /**
   * Добавить или убрать рецепт. Успех — только если запись подтверждена
   * чтением обратно. При сбое подписчиков НЕ будим: на экране не должно
   * появиться то, чего нет в хранилище.
   */
  const toggle = (slug: string): ToggleResult => {
    const env = getEnv();
    const next = toggleInList(parseFavorites(snapshot()), slug, MAX_FAVORITES);
    const value = JSON.stringify(next);
    const result = verifiedWrite(env.storage, FAV_KEY, value);
    if (!result.ok) {
      onWriteFailure?.(result.reason, value.length);
      return result;
    }
    env.target?.dispatchEvent(new Event(FAV_CHANGE_EVENT));
    return { ok: true, on: next.includes(slug) };
  };

  return { snapshot, subscribe, toggle };
}

/** Хранилище приложения. На сервере окружения нет — снимок пустой. */
export const favoritesStore = createFavoritesStore(
  () =>
    typeof window === "undefined"
      ? { storage: null, target: null, doc: null }
      : { storage: browserStorage(), target: window, doc: document },
  (reason, bytes) => reportStorageFailure(FAV_KEY, reason, bytes),
);
