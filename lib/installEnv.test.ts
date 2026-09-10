import { describe, it, expect } from "vitest";

import {
  canPromptInstall,
  detectInstallEnv,
  isInstalledEnv,
  type EnvSignals,
  type InstallEnv,
} from "./installEnv";

// Обычный браузер: ни одного признака установленного приложения.
const BROWSER: EnvSignals = {
  displayModes: [],
  navigatorStandalone: false,
  referrer: "",
  capacitorNative: false,
  capacitorPlatform: "web",
};

const env = (patch: Partial<EnvSignals>): InstallEnv =>
  detectInstallEnv({ ...BROWSER, ...patch });

describe("detectInstallEnv", () => {
  it("пустая вкладка Chrome/Safari — browser", () => {
    expect(env({})).toBe("browser");
  });

  it("реферер из чужого приложения не считается установкой", () => {
    // Переход по ссылке из ВКонтакте или почты — это обычный браузер.
    expect(env({ referrer: "https://vk.com/" })).toBe("browser");
  });

  it("TWA из RuStore — android-app:// в реферере", () => {
    expect(env({ referrer: "android-app://pro.smart_cook.twa", displayModes: ["standalone"] }))
      .toBe("twa");
  });

  it("TWA, деградировавшая в Custom Tab, всё равно TWA", () => {
    // display-mode остался browser — единственный признак это реферер, и
    // потерять его нельзя: человек пришёл из установленного приложения.
    expect(env({ referrer: "android-app://pro.smart_cook.twa" })).toBe("twa");
  });

  it("нативный iOS (Capacitor) — native-ios", () => {
    expect(env({ capacitorNative: true, capacitorPlatform: "ios" })).toBe("native-ios");
  });

  it("нативная оболочка перевешивает всё остальное", () => {
    // Capacitor инжектит глобал сам — это самый надёжный сигнал.
    expect(env({ capacitorNative: true, capacitorPlatform: "ios", displayModes: [] }))
      .toBe("native-ios");
  });

  it("PWA на Android — display-mode standalone", () => {
    expect(env({ displayModes: ["standalone"] })).toBe("pwa");
  });

  it("PWA на iOS — navigator.standalone, display-mode там не работает", () => {
    expect(env({ navigatorStandalone: true })).toBe("pwa");
  });

  it("minimal-ui и fullscreen — тоже установленное приложение", () => {
    // Браузер вправе отдать не standalone: иконка на экране уже есть, звать
    // поставить иконку незачем.
    expect(env({ displayModes: ["minimal-ui"] })).toBe("pwa");
    expect(env({ displayModes: ["fullscreen"] })).toBe("pwa");
  });
});

describe("canPromptInstall", () => {
  it("плашка уместна только в обычном браузере", () => {
    expect(canPromptInstall("browser")).toBe(true);
  });

  it("во всех установленных средах молчим", () => {
    for (const e of ["twa", "native-ios", "native-android", "pwa"] as const) {
      expect(canPromptInstall(e)).toBe(false);
    }
  });

  it("пока среда неизвестна — молчим (нет мигания на сервере и при гидрации)", () => {
    expect(canPromptInstall("unknown")).toBe(false);
  });
});

describe("isInstalledEnv", () => {
  it("browser и unknown — не установленное приложение", () => {
    expect(isInstalledEnv("browser")).toBe(false);
    // unknown не считаем установкой: он влияет только на показ плашки
    // (через canPromptInstall), а не на аналитику display_mode.
    expect(isInstalledEnv("unknown")).toBe(false);
  });

  it("четыре вида установленного приложения", () => {
    for (const e of ["twa", "native-ios", "native-android", "pwa"] as const) {
      expect(isInstalledEnv(e)).toBe(true);
    }
  });
});
