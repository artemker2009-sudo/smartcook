import { describe, it, expect } from "vitest";
import { isPaymentUiBlocked, podborLimitCopy } from "./premiumIos";
import { detectInstallEnv, type EnvSignals } from "./installEnv";
import { PREMIUM_PLANS } from "./premiumPlans";

const BROWSER: EnvSignals = {
  displayModes: [],
  navigatorStandalone: false,
  referrer: "",
  capacitorNative: false,
  capacitorPlatform: "web",
};

const env = (patch: Partial<EnvSignals>) => detectInstallEnv({ ...BROWSER, ...patch });

describe("isPaymentUiBlocked — правило App Store 3.1.1", () => {
  it("нативный iOS — оплату показывать нельзя", () => {
    const e = env({ capacitorNative: true, capacitorPlatform: "ios" });
    expect(e).toBe("native-ios");
    expect(isPaymentUiBlocked(e)).toBe(true);
  });

  it("обычный браузер — можно", () => {
    expect(isPaymentUiBlocked(env({}))).toBe(false);
  });

  it("PWA с домашнего экрана — можно (это тот же сайт)", () => {
    expect(isPaymentUiBlocked(env({ displayModes: ["standalone"] }))).toBe(false);
  });

  it("iOS Safari с домашнего экрана — можно: это не приложение из App Store", () => {
    expect(isPaymentUiBlocked(env({ navigatorStandalone: true }))).toBe(false);
  });

  it("Android TWA из RuStore — можно, правило Apple её не касается", () => {
    const e = env({ referrer: "android-app://pro.smart_cook.twa" });
    expect(e).toBe("twa");
    expect(isPaymentUiBlocked(e)).toBe(false);
  });

  it("нативный Android (если однажды соберём) — можно", () => {
    expect(isPaymentUiBlocked(env({ capacitorNative: true, capacitorPlatform: "android" }))).toBe(false);
  });

  it("«ещё не знаем» — можно: иначе /premium не попала бы в HTML первого ответа", () => {
    expect(isPaymentUiBlocked("unknown")).toBe(false);
  });
});

describe("podborLimitCopy — тексты шторки", () => {
  const ios = env({ capacitorNative: true, capacitorPlatform: "ios" });
  const web = env({});
  const year = PREMIUM_PLANS.find((p) => p.days === 365)!;

  it("сайт: заголовок и текст по макету limit-web", () => {
    const copy = podborLimitCopy(web, 3);
    expect(copy.title).toBe("Следующий подбор — с Премиумом");
    expect(copy.text).toBe(
      "3 бесплатных подбора на этой неделе закончились, новые будут в понедельник. " +
        "С Премиумом подбирайте сколько угодно.",
    );
  });

  it("сайт: число подборов из настройки, склоняются и слова, и глагол", () => {
    // Глагол — отдельная ловушка: при лимите 1 получалось «1 бесплатный
    // подбор закончились». В макете число 3, поэтому там это не видно.
    expect(podborLimitCopy(web, 1).text).toContain("1 бесплатный подбор на этой неделе закончился,");
    expect(podborLimitCopy(web, 3).text).toContain("3 бесплатных подбора на этой неделе закончились,");
    expect(podborLimitCopy(web, 5).text).toContain("5 бесплатных подборов на этой неделе закончились,");
    expect(podborLimitCopy(web, 11).text).toContain("11 бесплатных подборов на этой неделе закончились,");
    expect(podborLimitCopy(web, 21).text).toContain("21 бесплатный подбор на этой неделе закончился,");
  });

  it("сайт: плашка с ценой берёт обе строки из тарифа, а не из текста", () => {
    const copy = podborLimitCopy(web, 3);
    expect(copy.price).not.toBeNull();
    expect(copy.price!.headline).toBe(year.sub);
    expect(copy.price!.note).toBe(`${year.priceRub}\u00A0₽ за целый год · автоплатежей нет`);
  });

  it("сайт: три действия — оплата, «Идеи», закрыть", () => {
    const copy = podborLimitCopy(web, 3);
    expect(copy.primary).toEqual({ label: "Подбирать без лимита", href: "/premium" });
    expect(copy.secondary).toEqual({ label: "Пока посмотреть «Идеи»", href: "/ideas" });
    expect(copy.dismiss).toBe("Подожду до понедельника");
  });

  // Главная проверка правила App Store 3.1.1: в iOS-варианте не должно быть НИ
  // цены, НИ слова «Премиум», НИ ссылки на оплату — ни в одном тексте.
  it("iOS: ни цены, ни слова «Премиум», ни ссылки на оплату", () => {
    const copy = podborLimitCopy(ios, 3);
    const all = [copy.title, copy.text, copy.primary.label, copy.dismiss].join(" ");

    expect(all).not.toMatch(/Премиум/i);
    expect(all).not.toMatch(/₽/);
    expect(all).not.toMatch(/\d+\s*(₽|руб)/i);
    expect(all).not.toMatch(/оплат|плат[иа]|подписк|тариф/i);
    expect(copy.price).toBeNull();
    expect(copy.primary.href).toBe("/ideas");
    expect(copy.secondary).toBeNull();
  });

  it("iOS: заголовок, текст и кнопки по макету limit-ios", () => {
    const copy = podborLimitCopy(ios, 3);
    expect(copy.title).toBe("На этой неделе подборы закончились");
    expect(copy.text).toBe(
      "Новые появятся в понедельник. А пока загляните в «Идеи» — там рецепты с фото, " +
        "их можно смотреть без ограничений.",
    );
    expect(copy.primary.label).toBe("Открыть «Идеи»");
    expect(copy.dismiss).toBe("Понятно");
  });

  it("iOS: число бесплатных подборов в текст не попадает вовсе", () => {
    expect(podborLimitCopy(ios, 7).text).not.toContain("7");
  });
});
