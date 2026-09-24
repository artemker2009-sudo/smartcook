import { describe, it, expect } from "vitest";
import {
  moscowWeekStart,
  moscowNextWeekStart,
  isPremiumActive,
  extendPremium,
  extendPremiumByMonths,
  formatPremiumDate,
  payUntilText,
  pluralPodbor,
} from "./premiumPeriod";
import { PREMIUM_PLANS } from "./premiumPlans";

const month = PREMIUM_PLANS.find((p) => p.id === "month")!;
const year = PREMIUM_PLANS.find((p) => p.id === "year")!;
const forever = PREMIUM_PLANS.find((p) => p.id === "forever")!;

const DAY = 24 * 60 * 60 * 1000;

describe("moscowWeekStart", () => {
  // Понедельник 21.09.2026, 00:00 МСК = 20.09.2026, 21:00 UTC — это и есть
  // начало недели для всех проверок ниже.
  it("четверг — отматывает к понедельнику 00:00 МСК", () => {
    // Четверг 24.09.2026, 15:00 МСК = 12:00 UTC.
    const start = moscowWeekStart(new Date("2026-09-24T12:00:00Z"));
    expect(start.toISOString()).toBe("2026-09-20T21:00:00.000Z");
  });

  it("сам понедельник 00:30 МСК уже относится к новой неделе", () => {
    const start = moscowWeekStart(new Date("2026-09-20T21:30:00Z"));
    expect(start.toISOString()).toBe("2026-09-20T21:00:00.000Z");
  });

  it("воскресенье 23:30 МСК — ещё прошлая неделя, лимит не обнулился", () => {
    const start = moscowWeekStart(new Date("2026-09-20T20:30:00Z"));
    expect(start.toISOString()).toBe("2026-09-13T21:00:00.000Z");
  });

  it("воскресенье считается концом недели, а не началом", () => {
    // Воскресенье 27.09.2026, 23:00 МСК = 20:00 UTC.
    const start = moscowWeekStart(new Date("2026-09-27T20:00:00Z"));
    expect(start.toISOString()).toBe("2026-09-20T21:00:00.000Z");
  });

  it("следующая неделя ровно через 7 дней", () => {
    const now = new Date("2026-09-24T12:00:00Z");
    expect(moscowNextWeekStart(now).getTime() - moscowWeekStart(now).getTime()).toBe(7 * DAY);
  });
});

describe("isPremiumActive", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  it("нет записи — нет Премиума", () => {
    expect(isPremiumActive(null, now)).toBe(false);
  });
  it("навсегда — активен без даты", () => {
    expect(isPremiumActive({ premiumUntil: null, isForever: true }, now)).toBe(true);
  });
  it("срок в будущем — активен", () => {
    expect(isPremiumActive({ premiumUntil: new Date(now.getTime() + DAY), isForever: false }, now)).toBe(true);
  });
  it("срок в прошлом — не активен", () => {
    expect(isPremiumActive({ premiumUntil: new Date(now.getTime() - 1), isForever: false }, now)).toBe(false);
  });
});

describe("extendPremium — сроки складываются", () => {
  const now = new Date("2026-09-24T12:00:00Z");

  it("с нуля: месяц = сейчас + 30 дней", () => {
    const next = extendPremium(null, month, now);
    expect(next.isForever).toBe(false);
    expect(next.premiumUntil!.getTime()).toBe(now.getTime() + 30 * DAY);
  });

  it("поверх действующего: складывается к КОНЦУ текущего срока", () => {
    const current = { premiumUntil: new Date(now.getTime() + 10 * DAY), isForever: false };
    const next = extendPremium(current, month, now);
    expect(next.premiumUntil!.getTime()).toBe(now.getTime() + 40 * DAY);
  });

  it("поверх истёкшего: считается от СЕЙЧАС, оплаченное не сгорает", () => {
    const current = { premiumUntil: new Date(now.getTime() - 100 * DAY), isForever: false };
    const next = extendPremium(current, month, now);
    expect(next.premiumUntil!.getTime()).toBe(now.getTime() + 30 * DAY);
  });

  it("год — 365 дней", () => {
    expect(extendPremium(null, year, now).premiumUntil!.getTime()).toBe(now.getTime() + 365 * DAY);
  });

  it("навсегда — срок стирается, флаг поднимается", () => {
    const next = extendPremium({ premiumUntil: new Date(now.getTime() + 5 * DAY), isForever: false }, forever, now);
    expect(next).toEqual({ premiumUntil: null, isForever: true });
  });

  it("покупка поверх «навсегда» не понижает до срочного", () => {
    const next = extendPremium({ premiumUntil: null, isForever: true }, month, now);
    expect(next.isForever).toBe(true);
    expect(next.premiumUntil).toBeNull();
  });
});

describe("extendPremiumByMonths — админская выдача", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  it("3 месяца = 90 дней", () => {
    expect(extendPremiumByMonths(null, 3, now).premiumUntil!.getTime()).toBe(now.getTime() + 90 * DAY);
  });
  it("складывается с действующим", () => {
    const current = { premiumUntil: new Date(now.getTime() + 10 * DAY), isForever: false };
    expect(extendPremiumByMonths(current, 1, now).premiumUntil!.getTime()).toBe(now.getTime() + 40 * DAY);
  });
  it("навсегда", () => {
    expect(extendPremiumByMonths(null, "forever", now)).toEqual({ premiumUntil: null, isForever: true });
  });
});

describe("formatPremiumDate", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  it("текущий год — без года", () => {
    expect(formatPremiumDate(new Date("2026-10-24T12:00:00Z"), now)).toBe("24 октября");
  });
  it("другой год — с годом", () => {
    expect(formatPremiumDate(new Date("2027-09-24T12:00:00Z"), now)).toBe("24 сентября 2027");
  });
  it("дата считается по Москве, а не по UTC", () => {
    // 23:30 UTC = 02:30 МСК следующего дня.
    expect(formatPremiumDate(new Date("2026-10-24T23:30:00Z"), now)).toBe("25 октября");
  });
});

describe("payUntilText — подписи из макета", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  it("месяц", () => {
    expect(payUntilText(month, now)).toBe("Премиум до 24 октября. Автоплатежей нет.");
  });
  it("год", () => {
    expect(payUntilText(year, now)).toBe("Премиум до 24 сентября 2027. Автоплатежей нет.");
  });
  it("навсегда", () => {
    expect(payUntilText(forever, now)).toBe("Премиум без срока. Платите один раз.");
  });
});

describe("pluralPodbor", () => {
  it.each([
    [0, "подборов"],
    [1, "подбор"],
    [2, "подбора"],
    [4, "подбора"],
    [5, "подборов"],
    [11, "подборов"],
    [12, "подборов"],
    [21, "подбор"],
    [22, "подбора"],
    [25, "подборов"],
  ])("%i → %s", (n, expected) => {
    expect(pluralPodbor(n as number)).toBe(expected);
  });
});
