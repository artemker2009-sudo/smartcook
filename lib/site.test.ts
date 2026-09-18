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

// Окружение тестов — node, window здесь нет (это и есть серверная ветка).
// Клиентские кейсы подставляют минимальный window.location: shareOrigin читает
// его в момент вызова, поэтому пересобирать модуль не нужно.
function onHost(url: string) {
  const u = new URL(url);
  (globalThis as { window?: unknown }).window = { location: { host: u.host, origin: u.origin } };
}

function onServer() {
  delete (globalThis as { window?: unknown }).window;
}

afterEach(() => {
  vi.unstubAllEnvs();
  onServer();
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

describe("shareUrl — ссылка «поделиться» от текущего origin", () => {
  it("на старом smart-cook.pro отдаёт smart-cook.pro, а не канон", async () => {
    const site = await load("https://smartcook.pro");
    onHost("https://smart-cook.pro/recipe/42");
    // Это и есть чинимая яма: в iOS-оболочке и в установленном PWA origin —
    // старый домен, и ссылка на канон уводила бы на пустое хранилище.
    expect(site.shareUrl("/recipe/42")).toBe("https://smart-cook.pro/recipe/42");
    expect(site.shareUrl("/shopping/join/abc")).toBe("https://smart-cook.pro/shopping/join/abc");
  });

  it("на основном smartcook.pro отдаёт smartcook.pro", async () => {
    const site = await load("https://smartcook.pro");
    onHost("https://smartcook.pro/recipe/42");
    expect(site.shareUrl("/recipe/42")).toBe("https://smartcook.pro/recipe/42");
  });

  it("на превью-домене и на localhost откатывается на SITE_URL", async () => {
    const site = await load("https://smartcook.pro");

    // Без проверки по SITE_HOSTS превью рассылал бы ссылки на *.vercel.app —
    // они за Vercel Authentication, получатель увидел бы форму входа.
    onHost("https://recipe-ai-git-feature.vercel.app/recipe/42");
    expect(site.shareUrl("/recipe/42")).toBe("https://smartcook.pro/recipe/42");

    // В SITE_HOSTS хосты без портов, поэтому localhost:3000 не совпадёт никогда.
    onHost("http://localhost:3000/recipe/42");
    expect(site.shareUrl("/recipe/42")).toBe("https://smartcook.pro/recipe/42");

    onHost("http://127.0.0.1:3000/recipe/42");
    expect(site.shareUrl("/recipe/42")).toBe("https://smartcook.pro/recipe/42");
  });

  it("похожий, но чужой хост не проходит", async () => {
    const site = await load("https://smartcook.pro");
    for (const host of [
      "https://smartcook.pro.evil.example",
      "https://evil-smartcook.pro",
      "https://sub.smartcook.pro",
    ]) {
      onHost(`${host}/recipe/42`);
      expect(site.shareUrl("/recipe/42")).toBe("https://smartcook.pro/recipe/42");
    }
  });

  it("www наших доменов — свой же хост", async () => {
    const site = await load("https://smartcook.pro");
    onHost("https://www.smart-cook.pro/recipe/42");
    expect(site.shareUrl("/recipe/42")).toBe("https://www.smart-cook.pro/recipe/42");
  });

  it("на сервере (window нет) — всегда канон", async () => {
    const site = await load("https://smartcook.pro");
    onServer();
    expect(site.shareUrl("/recipe/42")).toBe("https://smartcook.pro/recipe/42");
  });

  it("склейка пути такая же, как у siteUrl", async () => {
    const site = await load("https://smartcook.pro");
    onHost("https://smart-cook.pro/");
    expect(site.shareUrl("/")).toBe("https://smart-cook.pro");
    expect(site.shareUrl()).toBe("https://smart-cook.pro");
    expect(site.shareUrl("shopping")).toBe("https://smart-cook.pro/shopping");
    expect(site.shareUrl("/search?daily=true")).toBe("https://smart-cook.pro/search?daily=true");
  });

  it("siteUrl остаётся каноническим — canonical, og:url и sitemap не поехали", async () => {
    const site = await load("https://smartcook.pro");
    onHost("https://smart-cook.pro/recipe/42");
    expect(site.siteUrl("/recipe/42")).toBe("https://smartcook.pro/recipe/42");
  });
});
