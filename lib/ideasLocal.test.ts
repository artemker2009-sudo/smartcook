import { describe, it, expect } from "vitest";
import { putHave, toggleInList } from "./ideasLocal";

describe("избранное каталога", () => {
  it("добавляет и убирает", () => {
    expect(toggleInList([], "a")).toEqual(["a"]);
    expect(toggleInList(["a"], "a")).toEqual([]);
  });

  it("новое уходит в конец, вытесняется самое старое", () => {
    expect(toggleInList(["a", "b"], "c", 2)).toEqual(["b", "c"]);
  });
});

describe("отметки «есть дома»", () => {
  it("хранит имена, а не индексы", () => {
    expect(putHave({}, "syrniki", ["Творог"])).toEqual({ syrniki: ["Творог"] });
  });

  it("пустой набор отметок не хранится вовсе", () => {
    expect(putHave({ syrniki: ["Творог"] }, "syrniki", [])).toEqual({});
  });

  it("словарь не растёт бесконечно — вытесняет самый старый рецепт", () => {
    const map = putHave(putHave({}, "a", ["x"]), "b", ["y"]);
    expect(putHave(map, "c", ["z"], 2)).toEqual({ b: ["y"], c: ["z"] });
  });

  it("повторная отметка того же рецепта делает его самым свежим", () => {
    const map = putHave(putHave({}, "a", ["x"]), "b", ["y"]);
    const next = putHave(map, "a", ["x2"], 2);
    expect(Object.keys(next)).toEqual(["b", "a"]);
  });
});
