import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEPARTMENT_PINS_KEY,
  MAX_DEPARTMENT_PINS,
  applyPins,
  loadPins,
  mergePins,
  pinDepartment,
  pinKey,
  pinsIndex,
  savePins,
  type DepartmentPin,
} from "./shoppingDepartmentPins";
import { lookupDepartment, buildDepartmentIndex } from "./shoppingDepartments";
import type { ShoppingGroup } from "./shoppingList";

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

beforeEach(installLocalStorage);
afterEach(() => vi.unstubAllGlobals());

describe("pinKey", () => {
  it("приводит название к тому же виду, что и словарь отделов", () => {
    expect(pinKey("Хумус")).toBe("хумус");
    expect(pinKey("  Хумус 200 г  ")).toBe("хумус");
    expect(pinKey("Сметана 20% 400г")).toBe("сметана 20%");
  });
});

describe("pinDepartment", () => {
  it("запоминает исправление и заменяет прежнее для того же продукта", () => {
    pinDepartment("Хумус 200 г", "Бакалея", 1);
    expect(loadPins()).toEqual([{ name: "хумус", department: "Бакалея", at: 1 }]);

    pinDepartment("хумус", "Заморозка", 2);
    expect(loadPins()).toEqual([{ name: "хумус", department: "Заморозка", at: 2 }]);
  });

  it("не запоминает «Прочее» — это отказ выбрать отдел, а не решение", () => {
    pinDepartment("хумус", "Прочее", 1);
    expect(loadPins()).toEqual([]);
  });

  it("при переполнении вытесняет самые старые, а не свежие", () => {
    // Без пробела перед номером: «продукт 5» — это «продукт» с количеством 5,
    // и все двести записей схлопнулись бы в одну (см. pinKey).
    for (let i = 0; i < MAX_DEPARTMENT_PINS + 5; i++) pinDepartment(`продукт№${i}`, "Бакалея", i);
    const pins = loadPins();
    expect(pins).toHaveLength(MAX_DEPARTMENT_PINS);
    expect(pins[0].name).toBe("продукт№5");
    expect(pins[pins.length - 1].name).toBe(`продукт№${MAX_DEPARTMENT_PINS + 4}`);
  });

  it("переживает мусор в хранилище", () => {
    localStorage.setItem(
      DEPARTMENT_PINS_KEY,
      JSON.stringify([{ name: "хумус", department: "Отдел взлома" }, "мусор", null, { department: "Бакалея" }]),
    );
    expect(loadPins()).toEqual([]);
  });
});

describe("lookupDepartment с исправлениями", () => {
  it("исправление сильнее и словаря, и выученного", () => {
    const learned = buildDepartmentIndex([["масло", "Заморозка"]]);
    const pins = pinsIndex([{ name: "масло", department: "Хозтовары", at: 1 }]);

    // Базовый словарь знает «масло» как Молочное, выученное — как Заморозку.
    expect(lookupDepartment("масло")).toBe("Молочное");
    expect(lookupDepartment("масло", learned)).toBe("Заморозка");
    expect(lookupDepartment("масло", learned, pins)).toBe("Хозтовары");
  });

  it("не зависит от падежа и количества", () => {
    const pins = pinsIndex([{ name: "хумус", department: "Бакалея", at: 1 }]);
    expect(lookupDepartment("Хумус 200 г", null, pins)).toBe("Бакалея");
    expect(lookupDepartment("хумусом", null, pins)).toBe("Бакалея");
  });

  it("растягивается на уточнённое название", () => {
    const pins = pinsIndex([{ name: "хумус", department: "Бакалея", at: 1 }]);
    expect(lookupDepartment("хумус классический", null, pins)).toBe("Бакалея");
  });

  it("без исправлений ведёт себя ровно как раньше", () => {
    expect(lookupDepartment("сметана", null, null)).toBe("Молочное");
    expect(lookupDepartment("перец чёрный молотый", null, null)).toBe("Бакалея");
    expect(lookupDepartment("хурма", null, null)).toBeNull();
  });
});

describe("applyPins", () => {
  const groups: ShoppingGroup[] = [
    { department: "Овощи-фрукты", items: ["огурцы", "помидоры"] },
    { department: "Прочее", items: ["хумус"] },
  ];
  const names = ["огурцы", "помидоры", "хумус"];

  it("переносит позицию поверх готовой раскладки", () => {
    const pins = pinsIndex([{ name: "хумус", department: "Бакалея", at: 1 }]);
    expect(applyPins(groups, names, pins)).toEqual([
      { department: "Овощи-фрукты", items: ["огурцы", "помидоры"] },
      { department: "Бакалея", items: ["хумус"] },
    ]);
  });

  it("ничего не делает, когда всё уже на местах: тот же массив, без пересчёта", () => {
    const pins = pinsIndex([{ name: "огурцы", department: "Овощи-фрукты", at: 1 }]);
    expect(applyPins(groups, names, pins)).toBe(groups);
    expect(applyPins(groups, names, null)).toBe(groups);
  });

  it("перебивает раскладку модели, а не только словарь", () => {
    // Ровно тот случай, ради которого исправления живут отдельно от
    // «выученного»: полный пересчёт вернул модель, и она снова ошиблась.
    const fromModel: ShoppingGroup[] = [{ department: "Молочное", items: ["хумус", "сметана"] }];
    const pins = pinsIndex([{ name: "хумус", department: "Бакалея", at: 1 }]);
    expect(applyPins(fromModel, ["хумус", "сметана"], pins)).toEqual([
      { department: "Молочное", items: ["сметана"] },
      { department: "Бакалея", items: ["хумус"] },
    ]);
  });
});

describe("mergePins", () => {
  const local: DepartmentPin[] = [{ name: "хумус", department: "Бакалея", at: 200 }];

  it("побеждает то исправление, которое сделали позже", () => {
    const older: DepartmentPin[] = [{ name: "хумус", department: "Заморозка", at: 100 }];
    const newer: DepartmentPin[] = [{ name: "хумус", department: "Заморозка", at: 300 }];
    expect(mergePins(local, older)).toEqual(local);
    expect(mergePins(local, newer)).toEqual(newer);
  });

  it("при равном времени остаётся устройство: источник правды — оно", () => {
    expect(mergePins(local, [{ name: "хумус", department: "Заморозка", at: 200 }])).toEqual(local);
  });

  it("складывает разные продукты и режет по капу", () => {
    const many: DepartmentPin[] = Array.from({ length: MAX_DEPARTMENT_PINS }, (_, i) => ({
      name: `продукт№${i}`,
      department: "Бакалея" as const,
      at: i,
    }));
    const merged = mergePins(local, many);
    expect(merged).toHaveLength(MAX_DEPARTMENT_PINS);
    // Самое свежее исправление (at: 200) не должно вытесниться старыми.
    expect(merged.some((p) => p.name === "хумус")).toBe(true);
  });

  it("не теряет исправление, которого нет на сервере", () => {
    expect(mergePins(local, [])).toEqual(local);
    savePins(mergePins(local, []));
    expect(loadPins()).toEqual(local);
  });
});
