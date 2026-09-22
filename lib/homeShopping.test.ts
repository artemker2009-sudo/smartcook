import { describe, expect, it } from "vitest";
import { formatBoughtLine, mainListCounts } from "./homeShopping";
import type { ShoppingListRecord } from "./shoppingLists";
import type { SharedListPointer } from "./sharedShoppingList";

function list(id: string, items: boolean[], updatedAt: number): ShoppingListRecord {
  return {
    id,
    name: id,
    createdAt: updatedAt,
    updatedAt,
    items: items.map((checked, i) => ({ id: `${id}-${i}`, name: `Продукт ${i}`, checked })),
  };
}

function pointer(id: string, counts: { total: number; done: number } | undefined, at: number): SharedListPointer {
  return { id, name: id, memberRef: "m", role: "member", joinedAt: at, counts, updatedAt: at };
}

describe("главный список Главной", () => {
  it("берёт самый свежий непустой — как верхняя карточка в «Покупках»", () => {
    const counts = mainListCounts({
      lists: [list("a", [true, false, false], 100), list("b", [true, true, false, false], 200)],
    });
    expect(counts).toEqual({ total: 4, done: 2 });
    expect(formatBoughtLine(counts!)).toBe("2 из 4 куплено");
  });

  it("закреплённый список важнее свежего — порядок тот же, что в хабе", () => {
    expect(
      mainListCounts({
        lists: [list("a", [true, false], 100), list("b", [false, false, false], 900)],
        pinned: new Set(["a"]),
      }),
    ).toEqual({ total: 2, done: 1 });
  });

  it("пустые списки пропускает: «0 из 0 куплено» — шум", () => {
    expect(
      mainListCounts({ lists: [list("empty", [], 900), list("a", [false], 100)] }),
    ).toEqual({ total: 1, done: 0 });
  });

  it("списков нет вовсе — строки нет", () => {
    expect(mainListCounts({ lists: [] })).toBeNull();
    expect(mainListCounts({ lists: [list("empty", [], 100)] })).toBeNull();
  });

  it("общий список участвует наравне, но только с известным счётчиком", () => {
    expect(
      mainListCounts({
        lists: [list("a", [true, false], 100)],
        pointers: [pointer("shared", { total: 9, done: 3 }, 500)],
      }),
    ).toEqual({ total: 9, done: 3 });

    // Счётчик ещё не известен (список не открывали) — берём локальный.
    expect(
      mainListCounts({
        lists: [list("a", [true, false], 100)],
        pointers: [pointer("shared", undefined, 500)],
      }),
    ).toEqual({ total: 2, done: 1 });
  });

  it("локальный список, ставший общим, не считается дважды", () => {
    expect(
      mainListCounts({
        lists: [list("local", [true, true, true], 900)],
        pointers: [pointer("shared", { total: 1, done: 0 }, 100)],
        hidden: new Set(["local"]),
      }),
    ).toEqual({ total: 1, done: 0 });
  });
});
