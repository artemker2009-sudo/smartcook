import { afterEach, describe, it, expect, vi } from "vitest";
import { readRows, SupabaseReadError } from "./supabaseRead";

function respond(status: number, body: string) {
  return vi.fn(async () => new Response(body, { status, headers: { "Content-Type": "application/json" } }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("успешный ответ — это данные, даже пустые", () => {
  it("пустой каталог ([] со статусом 200) — это пустой массив, не ошибка", async () => {
    vi.stubGlobal("fetch", respond(200, "[]"));
    await expect(readRows("idea_recipes?select=slug", { revalidate: 300 })).resolves.toEqual([]);
  });

  it("строки возвращаются как есть", async () => {
    vi.stubGlobal("fetch", respond(200, '[{"slug":"tefteli"}]'));
    await expect(readRows("idea_recipes?select=slug", { revalidate: 300 })).resolves.toEqual([
      { slug: "tefteli" },
    ]);
  });

  it("окно ревалидации доходит до fetch — иначе ISR не работает вовсе", async () => {
    const fetchMock = respond(200, "[]");
    vi.stubGlobal("fetch", fetchMock);
    await readRows("articles_public?select=slug", { revalidate: 3600 });
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { next?: { revalidate?: number } };
    expect(init.next?.revalidate).toBe(3600);
  });
});

// Раньше каждый из этих случаев превращался в [] — и на статической странице
// с revalidate кэшировалась пустота до следующего окна.
describe("сбой запроса — исключение, а НЕ пустой массив", () => {
  it("HTTP 500", async () => {
    vi.stubGlobal("fetch", respond(500, '{"message":"upstream"}'));
    const error = await readRows("idea_recipes?select=slug", { revalidate: 300 }).catch((e) => e);
    expect(error).toBeInstanceOf(SupabaseReadError);
    expect(error.status).toBe(500);
  });

  it("HTTP 503 от прокси с HTML вместо JSON", async () => {
    vi.stubGlobal("fetch", respond(503, "<html>Service Unavailable</html>"));
    await expect(readRows("x?select=a", { revalidate: 60 })).rejects.toBeInstanceOf(SupabaseReadError);
  });

  it("обрыв сети", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(readRows("x?select=a", { revalidate: 60 })).rejects.toThrow(/сеть недоступна/);
  });

  it("200, но тело не JSON", async () => {
    vi.stubGlobal("fetch", respond(200, "<html>captive portal</html>"));
    await expect(readRows("x?select=a", { revalidate: 60 })).rejects.toThrow(/не JSON/);
  });

  it("200, но объект вместо массива", async () => {
    vi.stubGlobal("fetch", respond(200, '{"code":"PGRST000"}'));
    await expect(readRows("x?select=a", { revalidate: 60 })).rejects.toThrow(/не массив/);
  });

  it("в тексте ошибки таблица, но не фильтры запроса", async () => {
    vi.stubGlobal("fetch", respond(500, "{}"));
    const error = await readRows("recipes?select=id&id=eq.123", { revalidate: 60 }).catch((e) => e);
    expect(error.message).toBe("recipes: HTTP 500");
  });
});
