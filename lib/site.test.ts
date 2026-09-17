import { describe, it, expect, vi, afterEach } from "vitest";

// SITE_URL вычисляется при загрузке модуля (как и в сборке, где
// NEXT_PUBLIC_SITE_URL встраивается при build), поэтому каждый кейс
// подставляет env и заново импортирует модуль.
async function load(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
  else vi.stubEnv("NEXT_PUBLIC_SITE_URL", value);
  return import("./site");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("lib/site", () => {
  it("берёт адрес из NEXT_PUBLIC_SITE_URL и срезает завершающий слэш", async () => {
    const site = await load("https://smartcook.pro/");
    expect(site.SITE_URL).toBe("https://smartcook.pro");
    expect(site.SITE_HOST).toBe("smartcook.pro");
    expect(site.siteUrl("/recipe/42")).toBe("https://smartcook.pro/recipe/42");
    expect(site.siteUrl("shopping")).toBe("https://smartcook.pro/shopping");
    expect(site.siteUrl("/")).toBe("https://smartcook.pro");
    expect(site.siteUrl("/#website")).toBe("https://smartcook.pro/#website");
  });

  it("без переменной — боевой smartcook.pro, а не пустая строка или localhost", async () => {
    const site = await load(undefined);
    expect(site.SITE_URL).toBe("https://smartcook.pro");
  });

  it("мусор в переменной не роняет модуль — откат на боевой адрес", async () => {
    expect((await load("[SENSITIVE]")).SITE_URL).toBe("https://smartcook.pro");
    expect((await load("smartcook.pro")).SITE_URL).toBe("https://smartcook.pro");
    expect((await load("javascript:alert(1)")).SITE_URL).toBe("https://smartcook.pro");
  });

  it("старый smart-cook.pro всегда в списке настоящих хостов, вместе с www", async () => {
    const site = await load("https://smartcook.pro");
    expect([...site.SITE_HOSTS].sort()).toEqual(
      ["smart-cook.pro", "smartcook.pro", "www.smart-cook.pro", "www.smartcook.pro"],
    );
  });
});
