import { describe, it, expect } from "vitest";
import { chipsFadeVisible } from "./chipsFade";

describe("затухание у строки чипов", () => {
  it("скрыто, когда чипы влезают целиком (десктоп, короткий набор)", () => {
    expect(chipsFadeVisible({ scrollWidth: 358, clientWidth: 358, scrollLeft: 0 })).toBe(false);
    expect(chipsFadeVisible({ scrollWidth: 300, clientWidth: 1100, scrollLeft: 0 })).toBe(false);
  });

  it("пиксель субпиксельного округления прокруткой не считается", () => {
    expect(chipsFadeVisible({ scrollWidth: 359, clientWidth: 358, scrollLeft: 0 })).toBe(false);
  });

  it("видно, когда есть что прокручивать", () => {
    expect(chipsFadeVisible({ scrollWidth: 520, clientWidth: 390, scrollLeft: 0 })).toBe(true);
    expect(chipsFadeVisible({ scrollWidth: 520, clientWidth: 390, scrollLeft: 60 })).toBe(true);
  });

  it("скрыто, когда строку докрутили до конца", () => {
    expect(chipsFadeVisible({ scrollWidth: 520, clientWidth: 390, scrollLeft: 130 })).toBe(false);
    expect(chipsFadeVisible({ scrollWidth: 520, clientWidth: 390, scrollLeft: 129.5 })).toBe(false);
  });
});
