import { describe, expect, it } from "vitest";

import { splitQuantity } from "./shoppingQuantity";

describe("splitQuantity", () => {
  it("отделяет количество словами", () => {
    expect(splitQuantity("Сыр российский 200 г")).toEqual({ label: "Сыр российский", qty: "200 г" });
    expect(splitQuantity("Молоко 2 л")).toEqual({ label: "Молоко", qty: "2 л" });
    expect(splitQuantity("Яйца 10 шт")).toEqual({ label: "Яйца", qty: "10 шт" });
  });

  it("не путается в названии с процентами", () => {
    expect(splitQuantity("Сметана 20% 400 г")).toEqual({ label: "Сметана 20%", qty: "400 г" });
  });

  it("раскрывает слипшееся количество", () => {
    expect(splitQuantity("Кефир 1л")).toEqual({ label: "Кефир", qty: "1 л" });
    expect(splitQuantity("Мука 500г")).toEqual({ label: "Мука", qty: "500 г" });
    expect(splitQuantity("Сосиски 10шт.")).toEqual({ label: "Сосиски", qty: "10 шт" });
  });

  it("берёт голое число в конце", () => {
    expect(splitQuantity("Яблоки 3")).toEqual({ label: "Яблоки", qty: "3" });
    expect(splitQuantity("Лимон 0,5")).toEqual({ label: "Лимон", qty: "0,5" });
  });

  it("оставляет название целиком, когда разбор не уверен", () => {
    // Ни единицы, ни числа в конце.
    expect(splitQuantity("Хлеб бородинский")).toEqual({ label: "Хлеб бородинский", qty: "" });
    expect(splitQuantity("Уксус (бальзамический или яблочный)")).toEqual({
      label: "Уксус (бальзамический или яблочный)",
      qty: "",
    });
    // «звезды» — не единица измерения, число трогать нельзя.
    expect(splitQuantity("Пельмени 3 звезды")).toEqual({ label: "Пельмени 3 звезды", qty: "" });
    // Одно слово — разбирать нечего.
    expect(splitQuantity("Огурцы")).toEqual({ label: "Огурцы", qty: "" });
  });

  it("не оставляет название пустым", () => {
    // Вся строка — количество: увести её вправо нельзя, слева будет пусто.
    expect(splitQuantity("2 кг")).toEqual({ label: "2 кг", qty: "" });
    expect(splitQuantity("10 шт")).toEqual({ label: "10 шт", qty: "" });
  });

  it("не уводит вправо длинный хвост", () => {
    expect(splitQuantity("Вода 1000000 миллилитров")).toEqual({
      label: "Вода 1000000 миллилитров",
      qty: "",
    });
  });

  it("переживает пустую строку и пробелы", () => {
    expect(splitQuantity("")).toEqual({ label: "", qty: "" });
    expect(splitQuantity("  Молоко   2 л  ")).toEqual({ label: "Молоко", qty: "2 л" });
  });
});
