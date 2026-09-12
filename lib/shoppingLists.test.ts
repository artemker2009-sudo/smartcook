import { describe, it, expect } from "vitest";
import { defaultListName, listChipLabel, splitListTitle, type ShoppingListRecord } from "./shoppingLists";

function list(name: string): ShoppingListRecord {
  return { id: name, name, createdAt: 0, items: [], sort: null };
}

describe("splitListTitle", () => {
  it("легаси-имя по умолчанию делится на название и дату", () => {
    expect(splitListTitle("Покупки, 31 августа")).toEqual({ title: "Покупки", subtitle: "31 августа" });
  });

  it("имя без запятой остаётся одной строкой", () => {
    expect(splitListTitle("Дача")).toEqual({ title: "Дача", subtitle: null });
  });

  it("делит по ПЕРВОЙ запятой, остальное уходит в подпись", () => {
    expect(splitListTitle("Дача, 1 мая, вечер")).toEqual({ title: "Дача", subtitle: "1 мая, вечер" });
  });

  it("висячая запятая не создаёт пустую строку", () => {
    expect(splitListTitle("Покупки,")).toEqual({ title: "Покупки,", subtitle: null });
    expect(splitListTitle(", 31 августа")).toEqual({ title: ", 31 августа", subtitle: null });
  });
});

describe("defaultListName", () => {
  it("первый список — «Мой список»", () => {
    expect(defaultListName([])).toBe("Мой список");
    // Без аргумента (резервное имя серверного роута общего списка) — то же.
    expect(defaultListName()).toBe("Мой список");
  });

  it("дальше нумерует, не повторяя занятые имена", () => {
    expect(defaultListName([list("Мой список")])).toBe("Список 2");
    expect(defaultListName([list("Мой список"), list("Список 2")])).toBe("Список 3");
  });

  it("берёт ПЕРВЫЙ свободный номер, а не следующий по количеству", () => {
    // Список 2 удалили — новый должен занять его номер, а не стать вторым
    // «Списком 3».
    expect(defaultListName([list("Мой список"), list("Список 3")])).toBe("Список 2");
  });

  it("не спорит с именем, которое человек дал сам", () => {
    expect(defaultListName([list("Дача")])).toBe("Мой список");
  });
});

describe("listChipLabel", () => {
  it("легаси-имя по умолчанию различается в чипе датой, а не словом «Покупки»", () => {
    expect(listChipLabel("Покупки, 11 сентября")).toBe("11 сентября");
    expect(listChipLabel("Мои покупки, 1 мая")).toBe("1 мая");
  });

  it("своё имя показывается целиком", () => {
    expect(listChipLabel("Дача, 1 мая")).toBe("Дача, 1 мая");
    expect(listChipLabel("Мой список")).toBe("Мой список");
    expect(listChipLabel("Пятёрочка")).toBe("Пятёрочка");
  });
});
