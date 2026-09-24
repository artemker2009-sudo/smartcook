import { describe, it, expect } from "vitest";
import { isPaymentUiBlocked, podborLimitCopy } from "./premiumIos";
import { detectInstallEnv, type EnvSignals } from "./installEnv";

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

  it("сайт: есть число подборов, цена и кнопка на /premium", () => {
    const copy = podborLimitCopy(web, 3);
    expect(copy.title).toBe("Подборы на этой неделе закончились");
    expect(copy.text).toBe(
      "Бесплатно — 3 подбора в неделю, новые — в понедельник. С Премиумом — без лимита, от 49 ₽.",
    );
    expect(copy.action).toBe("Оформить Премиум");
    expect(copy.href).toBe("/premium");
    expect(copy.dismiss).toBe("Подожду до понедельника");
  });

  it("сайт: число подборов берётся из настройки и склоняется", () => {
    expect(podborLimitCopy(web, 1).text).toContain("1 подбор в неделю");
    expect(podborLimitCopy(web, 5).text).toContain("5 подборов в неделю");
  });

  // Главная проверка правила App Store 3.1.1: в iOS-варианте не должно быть НИ
  // цены, НИ слова «Премиум», НИ ссылки — ни в одном из четырёх текстов.
  it("iOS: ни цены, ни слова «Премиум», ни ссылки", () => {
    const copy = podborLimitCopy(ios, 3);
    const all = [copy.title, copy.text, copy.action, copy.dismiss ?? ""].join(" ");

    expect(all).not.toMatch(/Премиум/i);
    expect(all).not.toMatch(/₽/);
    expect(all).not.toMatch(/\d+\s*(₽|руб)/i);
    expect(all).not.toMatch(/оплат|плат[иа]|подписк/i);
    expect(copy.href).toBeNull();
    expect(copy.dismiss).toBeNull();
  });

  it("iOS: текст — про понедельник, кнопка — «Понятно»", () => {
    const copy = podborLimitCopy(ios, 3);
    expect(copy.title).toBe("Подборы на эту неделю закончились");
    expect(copy.text).toBe("Новые — в понедельник.");
    expect(copy.action).toBe("Понятно");
  });

  it("iOS: число бесплатных подборов в текст не попадает вовсе", () => {
    // Оно безобидно, но в нейтральном варианте его нет по макету — и заодно
    // это страховка от того, что кто-то склеит iOS-текст из сайтового.
    expect(podborLimitCopy(ios, 7).text).not.toContain("7");
  });
});
