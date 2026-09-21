import { describe, it, expect } from "vitest";
import { isTabReselect } from "./tabBarEvents";

describe("повторный тап по вкладке", () => {
  it("на корне раздела — обновить на месте", () => {
    expect(isTabReselect("/ideas", "/ideas")).toBe(true);
  });

  it("на экране рецепта — обычный переход в ленту, а не перехват", () => {
    // Вкладка «Идеи» подсвечена и на /ideas/<slug> (startsWith). Раньше
    // перехват шёл по подсветке, и тап по «Идеям» на рецепте не делал ничего.
    expect(isTabReselect("/ideas/tefteli-v-tomatnom-souse", "/ideas")).toBe(false);
  });

  it("чужой раздел — не повторный тап", () => {
    expect(isTabReselect("/search", "/ideas")).toBe(false);
  });
});
