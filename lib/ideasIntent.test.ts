import { describe, expect, it, vi } from "vitest";
import {
  INTENT_KEY,
  INTENT_TTL_MS,
  createIntentStore,
  parseIntent,
  type IntentEnv,
} from "./ideasIntent";

const NOW = Date.parse("2026-09-23T12:00:00Z");

function memoryEnv(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const target = {
    addEventListener: (type: string, fn: (event: Event) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (event: Event) => void) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (event: Event) => {
      listeners.get(event.type)?.forEach((fn) => fn(event));
      return true;
    },
  };
  const env: IntentEnv = {
    storage: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
    },
    target,
    doc: { addEventListener: () => {}, removeEventListener: () => {} },
  };
  return { env, data };
}

describe("разбор записи", () => {
  it("свежая запись читается целиком", () => {
    const raw = JSON.stringify({ slug: "grechka", title: "Гречка", thumb: "t.webp", at: NOW });
    expect(parseIntent(raw, NOW + 1000)).toEqual({
      slug: "grechka",
      title: "Гречка",
      thumb: "t.webp",
      at: NOW,
    });
  });

  it("старше недели — как будто записи нет", () => {
    const raw = JSON.stringify({ slug: "a", title: "Блюдо", at: NOW });
    expect(parseIntent(raw, NOW + INTENT_TTL_MS - 1)).not.toBeNull();
    expect(parseIntent(raw, NOW + INTENT_TTL_MS + 1)).toBeNull();
  });

  it("мусор и половинчатые записи не роняют экран", () => {
    expect(parseIntent(null, NOW)).toBeNull();
    expect(parseIntent("", NOW)).toBeNull();
    expect(parseIntent("не json", NOW)).toBeNull();
    expect(parseIntent("[1,2,3]", NOW)).toBeNull();
    expect(parseIntent(JSON.stringify({ slug: "a", at: NOW }), NOW)).toBeNull();
    expect(parseIntent(JSON.stringify({ title: "Б", at: NOW }), NOW)).toBeNull();
    expect(parseIntent(JSON.stringify({ slug: "a", title: "Б" }), NOW)).toBeNull();
  });

  it("часы уехали вперёд — запись считаем свежей, а не выбрасываем", () => {
    const raw = JSON.stringify({ slug: "a", title: "Блюдо", at: NOW + 86400000 });
    expect(parseIntent(raw, NOW)).not.toBeNull();
  });
});

describe("запись намерения", () => {
  it("кладёт в хранилище и будит подписчиков", () => {
    const { env, data } = memoryEnv();
    const store = createIntentStore(() => env);
    const notify = vi.fn();
    store.subscribe(notify);

    expect(store.remember({ slug: "grechka", title: "Гречка", thumb: "t.webp" }, NOW)).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(parseIntent(data.get(INTENT_KEY), NOW)).toEqual({
      slug: "grechka",
      title: "Гречка",
      thumb: "t.webp",
      at: NOW,
    });
  });

  it("новое намерение вытесняет прежнее — запись одна", () => {
    const { env, data } = memoryEnv();
    const store = createIntentStore(() => env);
    store.remember({ slug: "a", title: "Первое" }, NOW);
    store.remember({ slug: "b", title: "Второе" }, NOW + 1000);
    expect(data.size).toBe(1);
    expect(parseIntent(data.get(INTENT_KEY), NOW + 1000)?.slug).toBe("b");
  });

  it("сбой хранилища — без записи, без события, с отчётом", () => {
    const { env } = memoryEnv();
    const broken: IntentEnv = {
      ...env,
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    };
    const onFailure = vi.fn();
    const store = createIntentStore(() => broken, onFailure);
    const notify = vi.fn();
    store.subscribe(notify);

    expect(store.remember({ slug: "a", title: "Блюдо" }, NOW)).toBe(false);
    expect(notify).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it("запись без названия не сохраняется — плашке нечего показывать", () => {
    const { env, data } = memoryEnv();
    const store = createIntentStore(() => env);
    expect(store.remember({ slug: "a", title: "   " }, NOW)).toBe(false);
    expect(data.size).toBe(0);
  });

  it("снимок — сырая строка: один и тот же при неизменном хранилище", () => {
    const { env } = memoryEnv();
    const store = createIntentStore(() => env);
    store.remember({ slug: "a", title: "Блюдо" }, NOW);
    // Object.is по снимку — иначе useSyncExternalStore крутил бы рендер вечно.
    expect(store.snapshot()).toBe(store.snapshot());
  });
});
