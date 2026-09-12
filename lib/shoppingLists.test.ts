import { describe, it, expect } from "vitest";
import {
  defaultListName,
  formatUpdatedAt,
  listDisplayName,
  listUpdatedAt,
  splitListTitle,
  type ShoppingListRecord,
} from "./shoppingLists";

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
  it("нумерует списки без слова «Покупки» и без даты в имени", () => {
    expect(defaultListName([])).toBe("Список 1");
    // Без аргумента (резервное имя серверного роута общего списка) — то же.
    expect(defaultListName()).toBe("Список 1");
    expect(defaultListName([list("Список 1")])).toBe("Список 2");
    expect(defaultListName([list("Список 1"), list("Список 2")])).toBe("Список 3");
  });

  it("берёт ПЕРВЫЙ свободный номер, а не следующий по количеству", () => {
    // «Список 1» удалили — новый должен занять его номер, а не стать вторым
    // «Списком 3».
    expect(defaultListName([list("Список 2"), list("Список 3")])).toBe("Список 1");
  });

  it("не спорит с именем, которое человек дал сам", () => {
    expect(defaultListName([list("Дача")])).toBe("Список 1");
  });
});

describe("listDisplayName", () => {
  it("от легаси-имени по умолчанию остаётся дата, а не слово «Покупки»", () => {
    expect(listDisplayName("Покупки, 11 сентября")).toBe("11 сентября");
    expect(listDisplayName("Мои покупки, 1 мая")).toBe("1 мая");
  });

  it("своё имя показывается целиком", () => {
    expect(listDisplayName("Дача, 1 мая")).toBe("Дача, 1 мая");
    expect(listDisplayName("Список 2")).toBe("Список 2");
    expect(listDisplayName("Пятёрочка")).toBe("Пятёрочка");
  });
});

describe("listUpdatedAt", () => {
  it("у старой записи без updatedAt берёт дату создания", () => {
    expect(listUpdatedAt({ createdAt: 1000 })).toBe(1000);
  });

  it("мусор в updatedAt игнорируется", () => {
    expect(listUpdatedAt({ createdAt: 1000, updatedAt: Number.NaN })).toBe(1000);
    expect(listUpdatedAt({ createdAt: 1000, updatedAt: 2000 })).toBe(2000);
  });
});

describe("formatUpdatedAt", () => {
  const now = new Date(2026, 8, 12, 18, 0);

  it("сегодняшняя правка — со временем", () => {
    expect(formatUpdatedAt(new Date(2026, 8, 12, 17, 10).getTime(), now)).toBe("обновлён сегодня 17:10");
  });

  it("вчерашняя — тоже со временем", () => {
    expect(formatUpdatedAt(new Date(2026, 8, 11, 9, 30).getTime(), now)).toBe("обновлён вчера 09:30");
  });

  it("давняя — одной датой, без минут", () => {
    expect(formatUpdatedAt(new Date(2026, 7, 6, 9, 30).getTime(), now)).toBe("обновлён 6 августа");
  });

  it("мусор не ломает подпись", () => {
    expect(formatUpdatedAt(Number.NaN, now)).toBe("");
  });
});
