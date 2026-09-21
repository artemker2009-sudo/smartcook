import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Сторож: серверные страницы читают Supabase ТОЛЬКО через lib/supabaseRead.ts.
//
// Прямой fetch к /rest/v1/ в странице — это почти всегда тот самый паттерн
// «сбой → вернуть [] или null», из-за которого статическая страница кэширует
// пустоту на всё окно ревалидации. Он был в восьми местах сразу: каждый
// писал свой fetch по образцу соседа.
//
// Исключение одно и осознанное: /api/app-epoch — аварийный рубильник кэша,
// cache: "no-store", и его null означает «чистить нечего», а не «пусто».

const ROOT = join(__dirname, "..", "app");
const ALLOWED = new Set([join("api", "app-epoch", "route.ts")]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("страницы не читают Supabase в обход readRows", () => {
  const files = sourceFiles(ROOT);

  it("файлы найдены (иначе сторож молча ничего не проверяет)", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("нет прямых запросов к /rest/v1/", () => {
    const offenders = files
      .filter((file) => !ALLOWED.has(file.slice(ROOT.length + 1)))
      .filter((file) => readFileSync(file, "utf8").includes("/rest/v1/"))
      .map((file) => file.slice(ROOT.length + 1));
    expect(offenders).toEqual([]);
  });

  it("нет fetch с revalidate мимо помощника", () => {
    const offenders = files
      .filter((file) => /next:\s*\{\s*revalidate/.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(ROOT.length + 1));
    expect(offenders).toEqual([]);
  });
});
