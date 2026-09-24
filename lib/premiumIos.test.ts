import { describe, it, expect } from "vitest";
import { isPaymentUiBlocked } from "./premiumIos";
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
