import { describe, it, expect } from "vitest";
import { splitListTitle, defaultListName } from "./shoppingLists";

describe("splitListTitle", () => {
  it("имя по умолчанию делится на название и дату", () => {
    expect(splitListTitle("Покупки, 31 августа")).toEqual({ title: "Покупки", subtitle: "31 августа" });
  });

  it("работает с любым именем по умолчанию", () => {
    const { title, subtitle } = splitListTitle(defaultListName(new Date(2026, 0, 5)));
    expect(title).toBe("Покупки");
    expect(subtitle).toBeTruthy();
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
