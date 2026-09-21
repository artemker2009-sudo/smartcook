import { describe, it, expect, vi } from "vitest";
import { FAV_CHANGE_EVENT, createFavoritesStore, parseFavorites } from "./ideasFavorites";
import { FAV_KEY } from "./ideasLocal";

// Хранилище в памяти. dropWrites — Safari, у которого setItem не бросает, но
// значение не сохраняется; throwOn — переполненное или запрещённое хранилище.
function memoryStorage(opts: { throwOn?: string; dropWrites?: boolean } = {}) {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (opts.throwOn === key) {
        const error = new Error("The quota has been exceeded.");
        error.name = "QuotaExceededError";
        throw error;
      }
      if (!opts.dropWrites) data.set(key, value);
    },
  };
}

function env(storage: ReturnType<typeof memoryStorage>) {
  const target = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  return { storage, target, doc };
}

describe("причина бага: лента, не перемонтированная после «назад»", () => {
  // Safari возвращает ленту из bfcache целиком, без перемонтирования. Раньше
  // лента читала избранное один раз и не узнавала о записи с экрана рецепта.
  it("узнаёт о записи, сделанной, пока она была скрыта, по pageshow", () => {
    const e = env(memoryStorage());
    const store = createFavoritesStore(() => e);
    const notify = vi.fn();
    store.subscribe(notify);
    expect(parseFavorites(store.snapshot())).toEqual([]);

    // Запись «с другого экрана»: прямо в хранилище, без своего события.
    e.storage.data.set(FAV_KEY, JSON.stringify(["tefteli"]));
    e.target.dispatchEvent(new Event("pageshow"));

    expect(notify).toHaveBeenCalled();
    expect(parseFavorites(store.snapshot())).toEqual(["tefteli"]);
  });

  it("перечитывает при возврате из фона (visibilitychange)", () => {
    const e = env(memoryStorage());
    const store = createFavoritesStore(() => e);
    const notify = vi.fn();
    store.subscribe(notify);
    e.doc.dispatchEvent(new Event("visibilitychange"));
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("уходя в фон, не дёргает экран зря", () => {
    const e = env(memoryStorage());
    e.doc.visibilityState = "hidden";
    const store = createFavoritesStore(() => e);
    const notify = vi.fn();
    store.subscribe(notify);
    e.doc.dispatchEvent(new Event("visibilitychange"));
    expect(notify).not.toHaveBeenCalled();
  });

  it("запись с этого же документа будит подписчиков сразу", () => {
    // Событие storage в той же вкладке браузер НЕ присылает — нужно своё.
    const e = env(memoryStorage());
    const store = createFavoritesStore(() => e);
    const notify = vi.fn();
    store.subscribe(notify);
    expect(store.toggle("tefteli")).toEqual({ ok: true, on: true });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("событие storage по чужому ключу экран не будит", () => {
    const e = env(memoryStorage());
    const store = createFavoritesStore(() => e);
    const notify = vi.fn();
    store.subscribe(notify);
    e.target.dispatchEvent(Object.assign(new Event("storage"), { key: "smartcook_shopping_lists_v2" }));
    expect(notify).not.toHaveBeenCalled();
    e.target.dispatchEvent(Object.assign(new Event("storage"), { key: FAV_KEY }));
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("отписка снимает все обработчики", () => {
    const e = env(memoryStorage());
    const store = createFavoritesStore(() => e);
    const notify = vi.fn();
    const off = store.subscribe(notify);
    off();
    for (const type of ["pageshow", "focus", FAV_CHANGE_EVENT]) e.target.dispatchEvent(new Event(type));
    e.doc.dispatchEvent(new Event("visibilitychange"));
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("причина бага: упавшая запись выглядела как успех", () => {
  it("переполненное хранилище: не успех, подписчики молчат, отчёт уходит", () => {
    const e = env(memoryStorage({ throwOn: FAV_KEY }));
    const onFailure = vi.fn();
    const store = createFavoritesStore(() => e, onFailure);
    const notify = vi.fn();
    store.subscribe(notify);

    const result = store.toggle("tefteli");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("QuotaExceededError");
    expect(notify).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(parseFavorites(store.snapshot())).toEqual([]);
  });

  it("setItem не бросил, но значение не сохранилось — ловится чтением обратно", () => {
    const e = env(memoryStorage({ dropWrites: true }));
    const onFailure = vi.fn();
    const store = createFavoritesStore(() => e, onFailure);
    expect(store.toggle("tefteli")).toEqual({ ok: false, reason: "записанное значение не сохранилось" });
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it("хранилище недоступно вовсе (запрет в настройках Safari)", () => {
    const target = new EventTarget();
    const onFailure = vi.fn();
    const store = createFavoritesStore(() => ({ storage: null, target, doc: null }), onFailure);
    expect(store.toggle("tefteli").ok).toBe(false);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});

describe("снимок и разбор", () => {
  it("на сервере окружения нет — пустой снимок, ничего не падает", () => {
    const store = createFavoritesStore(() => ({ storage: null, target: null, doc: null }));
    expect(store.snapshot()).toBe("");
    expect(() => store.subscribe(() => {})()).not.toThrow();
  });

  it("снимок — строка: одинаковое содержимое даёт равный снимок", () => {
    // useSyncExternalStore сравнивает снимки через Object.is. Массив на каждом
    // чтении был бы новым объектом и перерисовывал бы экран бесконечно.
    const e = env(memoryStorage());
    const store = createFavoritesStore(() => e);
    store.toggle("tefteli");
    expect(Object.is(store.snapshot(), store.snapshot())).toBe(true);
  });

  it("битое значение в хранилище не роняет экран", () => {
    expect(parseFavorites("{не json")).toEqual([]);
    expect(parseFavorites('{"a":1}')).toEqual([]);
    expect(parseFavorites('["a", 5, null, "b"]')).toEqual(["a", "b"]);
  });
});
