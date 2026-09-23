// «Вы собирались приготовить» — намерение с экрана рецепта «Идей».
//
// ЗАЧЕМ. Человек открыл рецепт, добавил продукты в список покупок или нажал
// «Готовим!» — и ушёл. Вернётся он через день, в магазине или дома, и первое,
// что должен увидеть на Главной, — то самое блюдо, а не поиск с нуля.
//
// Где живёт: localStorage устройства, одна запись (последнее намерение).
// Сервер о ней не знает и знать не должен — это не данные аккаунта, а
// состояние конкретного телефона, как избранное каталога.
//
// Устроено ровно как избранное (lib/ideasFavorites.ts), и по той же причине:
// экран не копирует запись к себе в состояние, а ПОДПИСЫВАЕТСЯ на хранилище.
// Safari отдаёт страницу из bfcache целиком, с замороженным состоянием React —
// эффект монтирования не выполняется, и Главная показывала бы плашку на момент
// своего первого захода: человек уже приготовил, а она всё зовёт готовить.
// Поэтому снимок — СЫРАЯ строка (useSyncExternalStore сравнивает через
// Object.is, и новый объект на каждом чтении крутил бы рендер вечно), а
// разбирают её уже потребители.

import {
  browserStorage,
  reportStorageFailure,
  verifiedWrite,
  type StorageLike,
} from "./storageWrite";

export const INTENT_KEY = "sc_ideas_intent_v1";
export const INTENT_CHANGE_EVENT = "smartcook:ideas-intent";

/**
 * Сколько живёт намерение. Неделя: за это время в магазин сходили и блюдо
 * приготовили либо передумали. Месячная плашка «вы собирались» — уже упрёк, а
 * не помощь.
 */
export const INTENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Границы полей — на случай, если в хранилище окажется мусор из будущей версии. */
const MAX_TITLE = 200;
const MAX_SLUG = 200;
const MAX_THUMB = 500;

export type IdeaIntent = {
  slug: string;
  title: string;
  /** Миниатюра блюда (540px). Пустая строка — плашка покажется без картинки. */
  thumb: string;
  /** Когда записали, epoch ms. */
  at: number;
};

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max).trim() : "";
}

/**
 * Строка хранилища → намерение. null — записи нет, она битая или протухла.
 *
 * Протухшую запись здесь НЕ удаляем: разбор обязан быть чистым (его зовёт
 * рендер), а лишняя запись в localStorage никому не мешает — её перезапишет
 * следующее намерение.
 */
export function parseIntent(raw: string | null | undefined, now: number = Date.now()): IdeaIntent | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  const slug = str(obj.slug, MAX_SLUG);
  const title = str(obj.title, MAX_TITLE);
  const at = typeof obj.at === "number" && Number.isFinite(obj.at) ? obj.at : 0;
  if (!slug || !title || at <= 0) return null;
  // Часы на телефоне переводят: запись «из будущего» считаем свежей, а не
  // выбрасываем — иначе плашка молча пропала бы у человека с уехавшим временем.
  if (now - at > INTENT_TTL_MS) return null;
  return { slug, title, thumb: str(obj.thumb, MAX_THUMB), at };
}

type Listenable = {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
};

export type IntentEnv = {
  storage: StorageLike | null;
  target: (Listenable & { dispatchEvent(event: Event): boolean }) | null;
  doc: (Listenable & { visibilityState?: string }) | null;
};

export function createIntentStore(
  getEnv: () => IntentEnv,
  onWriteFailure?: (reason: string, bytes: number) => void,
) {
  const snapshot = (): string => {
    try {
      return getEnv().storage?.getItem(INTENT_KEY) ?? "";
    } catch {
      return "";
    }
  };

  const subscribe = (notify: () => void): (() => void) => {
    const { target, doc } = getEnv();
    const onStorage = (event: Event) => {
      const key = (event as Event & { key?: string | null }).key;
      if (key === undefined || key === null || key === INTENT_KEY) notify();
    };
    const onVisibility = () => {
      if (doc?.visibilityState !== "hidden") notify();
    };
    target?.addEventListener(INTENT_CHANGE_EVENT, notify);
    target?.addEventListener("storage", onStorage);
    target?.addEventListener("pageshow", notify);
    target?.addEventListener("focus", notify);
    doc?.addEventListener("visibilitychange", onVisibility);
    return () => {
      target?.removeEventListener(INTENT_CHANGE_EVENT, notify);
      target?.removeEventListener("storage", onStorage);
      target?.removeEventListener("pageshow", notify);
      target?.removeEventListener("focus", notify);
      doc?.removeEventListener("visibilitychange", onVisibility);
    };
  };

  /**
   * Запомнить намерение. Сбой записи гасим: человек нажал «в список покупок»,
   * и плашка на Главной — приятный довесок, а не то, ради чего он нажимал.
   * Отчёт о сбое хранилища при этом уходит (тот же, что у избранного).
   */
  const remember = (intent: { slug: string; title: string; thumb?: string | null }, now: number = Date.now()): boolean => {
    const env = getEnv();
    const slug = str(intent.slug, MAX_SLUG);
    const title = str(intent.title, MAX_TITLE);
    if (!slug || !title) return false;
    const value = JSON.stringify({ slug, title, thumb: str(intent.thumb, MAX_THUMB), at: now });
    const result = verifiedWrite(env.storage, INTENT_KEY, value);
    if (!result.ok) {
      onWriteFailure?.(result.reason, value.length);
      return false;
    }
    env.target?.dispatchEvent(new Event(INTENT_CHANGE_EVENT));
    return true;
  };

  return { snapshot, subscribe, remember };
}

export const intentStore = createIntentStore(
  () =>
    typeof window === "undefined"
      ? { storage: null, target: null, doc: null }
      : { storage: browserStorage(), target: window, doc: document },
  (reason, bytes) => reportStorageFailure(INTENT_KEY, reason, bytes),
);

/** Короткий вход для экрана рецепта. */
export function rememberIdeaIntent(intent: { slug: string; title: string; thumb?: string | null }): void {
  intentStore.remember(intent);
}
