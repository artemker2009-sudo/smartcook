import { describe, it, expect } from "vitest";
import {
  detectPlatform,
  isSnoozed,
  snoozeValue,
  DISMISS_DAYS,
  CLICK_DAYS,
} from "./installBanner";

const NOW = 1_756_000_000_000; // фиксированный «сейчас», тесты не зависят от часов
const DAY = 24 * 60 * 60 * 1000;

describe("detectPlatform", () => {
  it("iPhone и iPad — ios", () => {
    expect(
      detectPlatform(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
      )
    ).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)")).toBe("ios");
  });

  it("Android — android", () => {
    expect(
      detectPlatform(
        "Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
      )
    ).toBe("android");
  });

  it("десктоп — other, плашку там не показываем", () => {
    expect(
      detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36")
    ).toBe("other");
    // Mac без тача — настоящий десктоп.
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 0)).toBe(
      "other"
    );
  });

  // iPadOS 13+ по умолчанию притворяется десктопным Safari — ловим по тачу.
  it("iPad с десктопным userAgent всё равно ios", () => {
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 5)).toBe(
      "ios"
    );
  });
});

describe("isSnoozed", () => {
  it("пустой ключ — паузы нет", () => {
    expect(isSnoozed(null, NOW)).toBe(false);
    expect(isSnoozed("", NOW)).toBe(false);
  });

  it("момент в будущем — молчим", () => {
    expect(isSnoozed(String(NOW + DAY), NOW)).toBe(true);
  });

  it("момент в прошлом — можно показывать снова", () => {
    expect(isSnoozed(String(NOW - 1), NOW)).toBe(false);
  });

  it("мусор в ключе не запирает плашку навсегда", () => {
    expect(isSnoozed("завтра", NOW)).toBe(false);
    expect(isSnoozed("NaN", NOW)).toBe(false);
  });
});

describe("snoozeValue", () => {
  it("крестик молчит ровно 14 дней", () => {
    const raw = snoozeValue(NOW, DISMISS_DAYS);
    expect(isSnoozed(raw, NOW + 13 * DAY)).toBe(true);
    expect(isSnoozed(raw, NOW + 15 * DAY)).toBe(false);
  });

  it("клик по установке молчит дольше крестика", () => {
    const dismissed = Number(snoozeValue(NOW, DISMISS_DAYS));
    const clicked = Number(snoozeValue(NOW, CLICK_DAYS));
    expect(clicked).toBeGreaterThan(dismissed);
  });
});
