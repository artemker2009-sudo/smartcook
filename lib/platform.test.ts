import { describe, expect, it } from "vitest";

import { PLATFORMS, parsePlatform, parseVisitorKind, platformFromEnv } from "./platform";

describe("platformFromEnv", () => {
  it("нативная оболочка iOS — приложение App Store", () => {
    expect(platformFromEnv("native-ios")).toBe("ios_app");
  });

  it("TWA из RuStore — приложение Android", () => {
    expect(platformFromEnv("twa")).toBe("android_twa");
  });

  it("браузер и сайт с домашнего экрана — оба сайт", () => {
    expect(platformFromEnv("browser")).toBe("web");
    expect(platformFromEnv("pwa")).toBe("web");
  });

  it("среда ещё неизвестна — не записываем вовсе", () => {
    // Ключевой случай: "unknown" — это сервер и кадр гидрации. Засчитать такой
    // заход как «сайт» значит систематически занижать долю приложений.
    expect(platformFromEnv("unknown")).toBeNull();
  });

  it("нативный Android не подмешивается ни к iOS, ни к RuStore", () => {
    // Такой сборки у нас нет. Появится — ей нужно СВОЁ значение, а не чужое.
    expect(platformFromEnv("native-android")).toBeNull();
  });
});

describe("parsePlatform / parseVisitorKind", () => {
  it("пропускает только известные значения", () => {
    for (const p of PLATFORMS) expect(parsePlatform(p)).toBe(p);
    expect(parseVisitorKind("new")).toBe("new");
    expect(parseVisitorKind("returning")).toBe("returning");
  });

  it("мусор из тела запроса не проходит", () => {
    expect(parsePlatform("windows_phone")).toBeNull();
    expect(parsePlatform("")).toBeNull();
    expect(parsePlatform(null)).toBeNull();
    expect(parsePlatform(42)).toBeNull();
    expect(parsePlatform({ platform: "web" })).toBeNull();
    expect(parseVisitorKind("NEW")).toBeNull();
    expect(parseVisitorKind(true)).toBeNull();
  });
});
