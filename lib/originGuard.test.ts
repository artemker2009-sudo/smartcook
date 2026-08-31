import { describe, it, expect, vi, afterEach } from "vitest";
import { isTrustedOrigin } from "./originGuard";

// В тестах NODE_ENV=test, а гард в не-проде пропускает всё — поэтому каждый
// кейс явно поднимает NODE_ENV=production, иначе проверка была бы фиктивной.
function req(headers: Record<string, string>): Request {
  return new Request("https://example.test/api/shopping/recognize", { method: "POST", headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isTrustedOrigin", () => {
  it("в деве пропускает всё", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isTrustedOrigin(req({ origin: "https://evil.example" }))).toBe(true);
  });

  it("боевой домен разрешён, чужой — нет", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isTrustedOrigin(req({ origin: "https://smart-cook.pro" }))).toBe(true);
    expect(isTrustedOrigin(req({ origin: "https://www.smart-cook.pro" }))).toBe(true);
    expect(isTrustedOrigin(req({ origin: "https://evil.example" }))).toBe(false);
  });

  it("без Origin и Referer — отказ (так ходят скрипты, не браузер)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isTrustedOrigin(req({}))).toBe(false);
  });

  it("на preview-деплое разрешён собственный адрес деплоя и адрес ветки", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "smartcook-lv3gk06xq-artems-projects-f11c3a7b.vercel.app");
    vi.stubEnv("VERCEL_BRANCH_URL", "smartcook-git-feat-shopping-photo-artems.vercel.app");

    expect(isTrustedOrigin(req({ origin: "https://smartcook-lv3gk06xq-artems-projects-f11c3a7b.vercel.app" }))).toBe(true);
    expect(isTrustedOrigin(req({ origin: "https://smartcook-git-feat-shopping-photo-artems.vercel.app" }))).toBe(true);
    // Чужой сайт на vercel.app — по-прежнему нет.
    expect(isTrustedOrigin(req({ origin: "https://someone-else.vercel.app" }))).toBe(false);
  });

  it("в проде адрес preview-деплоя не разрешён", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_URL", "smartcook-lv3gk06xq-artems-projects-f11c3a7b.vercel.app");
    expect(isTrustedOrigin(req({ origin: "https://smartcook-lv3gk06xq-artems-projects-f11c3a7b.vercel.app" }))).toBe(false);
  });

  it("Referer используется, когда Origin не пришёл", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isTrustedOrigin(req({ referer: "https://smart-cook.pro/shopping" }))).toBe(true);
    expect(isTrustedOrigin(req({ referer: "https://evil.example/page" }))).toBe(false);
  });
});
