import { describe, expect, it } from "vitest";

import {
  BASE_DICTIONARY_SIZE,
  buildDepartmentIndex,
  lookupDepartment,
  placeNames,
  uncoveredNames,
} from "./shoppingDepartments";
import type { ShoppingGroup } from "./shoppingList";

describe("lookupDepartment", () => {
  it("знает частые продукты без сети", () => {
    expect(lookupDepartment("сметана")).toBe("Молочное");
    expect(lookupDepartment("Молоко 2 л")).toBe("Молочное");
    expect(lookupDepartment("Сметана 20% 400г")).toBe("Молочное");
    expect(lookupDepartment("бананы")).toBe("Овощи-фрукты");
    expect(lookupDepartment("туалетная бумага")).toBe("Хозтовары");
  });

  it("не зависит от падежа и порядка слов", () => {
    expect(lookupDepartment("сметаны")).toBe("Молочное");
    expect(lookupDepartment("подсолнечное масло")).toBe("Бакалея");
    expect(lookupDepartment("масло")).toBe("Молочное");
  });

  it("многословное важнее одного слова", () => {
    expect(lookupDepartment("перец")).toBe("Овощи-фрукты");
    expect(lookupDepartment("перец чёрный молотый")).toBe("Бакалея");
    expect(lookupDepartment("куриное филе охлаждённое")).toBe("Мясо-рыба");
  });

  it("незнакомое — null, а не угадывание", () => {
    expect(lookupDepartment("хурма")).toBeNull();
    expect(lookupDepartment("подарок маме")).toBeNull();
    expect(lookupDepartment("")).toBeNull();
  });

  it("выученное на устройстве важнее базового словаря", () => {
    const learned = buildDepartmentIndex([
      ["хурма", "Овощи-фрукты"],
      ["масло", "Бакалея"],
    ]);
    expect(lookupDepartment("хурма", learned)).toBe("Овощи-фрукты");
    expect(lookupDepartment("масло", learned)).toBe("Бакалея");
  });

  it("базовый словарь — около двухсот позиций", () => {
    expect(BASE_DICTIONARY_SIZE).toBeGreaterThanOrEqual(200);
  });
});

describe("placeNames", () => {
  const groups: ShoppingGroup[] = [
    { department: "Овощи-фрукты", items: ["Бананы", "Огурцы"] },
    { department: "Молочное", items: ["Молоко 2 л", "Кефир"] },
    { department: "Хлеб", items: ["Батон"] },
  ];

  it("новая позиция — в конец своего отдела, остальные на месте", () => {
    const next = placeNames(groups, [{ name: "сметана", department: "Молочное" }]);
    expect(next).toEqual([
      { department: "Овощи-фрукты", items: ["Бананы", "Огурцы"] },
      { department: "Молочное", items: ["Молоко 2 л", "Кефир", "сметана"] },
      { department: "Хлеб", items: ["Батон"] },
    ]);
  });

  it("незнакомое временно в «Прочее» внизу, потом переезжает", () => {
    const temp = placeNames(groups, [{ name: "хурма", department: "Прочее" }]);
    expect(temp[temp.length - 1]).toEqual({ department: "Прочее", items: ["хурма"] });

    const moved = placeNames(temp, [{ name: "хурма", department: "Овощи-фрукты" }]);
    expect(moved[0]).toEqual({ department: "Овощи-фрукты", items: ["Бананы", "Огурцы", "хурма"] });
    expect(moved.some((g) => g.department === "Прочее")).toBe(false);
  });

  it("keepNames выбрасывает удалённое и пустые отделы", () => {
    const next = placeNames(groups, [], ["Бананы", "огурцы", "кефир"]);
    expect(next).toEqual([
      { department: "Овощи-фрукты", items: ["Бананы", "Огурцы"] },
      { department: "Молочное", items: ["Кефир"] },
    ]);
  });

  it("мусор с сервера не проходит", () => {
    const dirty = [
      { department: "Выдуманный", items: ["x"] },
      { department: "Хлеб", items: [42, "Батон"] },
    ] as unknown as ShoppingGroup[];
    expect(placeNames(dirty, [])).toEqual([{ department: "Хлеб", items: ["Батон"] }]);
  });
});

describe("uncoveredNames", () => {
  it("возвращает то, чего нет в раскладке, без учёта регистра", () => {
    const groups: ShoppingGroup[] = [{ department: "Молочное", items: ["Молоко"] }];
    expect(uncoveredNames(groups, ["молоко ", "Сметана", "сметана"])).toEqual(["Сметана"]);
  });
});
