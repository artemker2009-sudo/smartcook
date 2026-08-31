import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Очередь дёргает сетевые обёртки — подменяем их целиком: проверяем поведение
// очереди (порядок, остановку, сохранение остатка), а не работу fetch.
vi.mock("./sharedShoppingList", () => ({
  addSharedItems: vi.fn(),
  patchSharedItem: vi.fn(),
  clearSharedChecked: vi.fn(),
}));

import { addSharedItems, clearSharedChecked, patchSharedItem } from "./sharedShoppingList";
import { TEMP_ITEM_PREFIX, enqueue, flushPending, loadPending, pendingCount } from "./sharedShoppingQueue";

const LIST = "list-1";
const REF = "member-1";

// Минимальный localStorage: vitest-окружение здесь без браузера.
function installLocalStorage() {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  vi.stubGlobal("window", { localStorage: mock });
  vi.stubGlobal("localStorage", mock);
}

beforeEach(() => {
  installLocalStorage();
  vi.mocked(addSharedItems).mockReset();
  vi.mocked(patchSharedItem).mockReset();
  vi.mocked(clearSharedChecked).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("очередь офлайна", () => {
  it("копит мутации и считает их", () => {
    enqueue(LIST, { kind: "add", names: ["молоко"] });
    enqueue(LIST, { kind: "patch", itemId: "i1", checked: true });
    expect(pendingCount(LIST)).toBe(2);
  });

  it("отправляет всё по порядку и опустошает очередь", async () => {
    vi.mocked(addSharedItems).mockResolvedValue({ added: 1, duplicate: 0, limited: false });
    vi.mocked(patchSharedItem).mockResolvedValue(undefined);

    enqueue(LIST, { kind: "add", names: ["молоко"] });
    enqueue(LIST, { kind: "patch", itemId: "i1", checked: true });

    const ok = await flushPending(LIST, REF);

    expect(ok).toBe(true);
    expect(pendingCount(LIST)).toBe(0);
    expect(addSharedItems).toHaveBeenCalledWith(LIST, REF, ["молоко"]);
    expect(patchSharedItem).toHaveBeenCalledWith(LIST, "i1", REF, { checked: true });
  });

  it("на сетевой ошибке останавливается и СОХРАНЯЕТ остаток", async () => {
    vi.mocked(addSharedItems).mockResolvedValue({ added: 1, duplicate: 0, limited: false });
    vi.mocked(patchSharedItem).mockRejectedValue(new Error("сеть"));

    enqueue(LIST, { kind: "add", names: ["молоко"] });
    enqueue(LIST, { kind: "patch", itemId: "i1", checked: true });
    enqueue(LIST, { kind: "clear" });

    const ok = await flushPending(LIST, REF);

    expect(ok).toBe(false);
    // Первая ушла, вторая упала — она и «очистить» ждут следующей попытки.
    // Порядок важен: «очистить» не должна обгонять неотправленную галочку.
    const rest = loadPending(LIST);
    expect(rest).toHaveLength(2);
    expect(rest[0]).toMatchObject({ kind: "patch", itemId: "i1" });
    expect(rest[1]).toMatchObject({ kind: "clear" });
    expect(clearSharedChecked).not.toHaveBeenCalled();
  });

  it("выбрасывает правки позиций, которых сервер ещё не знает", async () => {
    vi.mocked(patchSharedItem).mockResolvedValue(undefined);

    enqueue(LIST, { kind: "patch", itemId: `${TEMP_ITEM_PREFIX}123`, checked: true });

    const ok = await flushPending(LIST, REF);

    expect(ok).toBe(true);
    expect(patchSharedItem).not.toHaveBeenCalled();
    expect(pendingCount(LIST)).toBe(0);
  });

  it("пустая очередь — успех без сетевых вызовов", async () => {
    await expect(flushPending(LIST, REF)).resolves.toBe(true);
    expect(addSharedItems).not.toHaveBeenCalled();
  });

  it("мусор в хранилище не роняет разбор", () => {
    localStorage.setItem(`smartcook_shared_pending_${LIST}`, "не json");
    expect(loadPending(LIST)).toEqual([]);
  });
});
