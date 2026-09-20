import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Страж против «мёртвых кнопок Редактировать» в админке.
 *
 * ЧТО СЛОМАЛОСЬ. Кнопка «Редактировать» в разделе «Каталог» выглядела
 * нерабочей: клик по любому блюду не давал никакой реакции, остальная страница
 * при этом была живой. Обработчик срабатывал, состояние менялось, форма
 * правки рендерилась — но НАД текущим положением списка, а попытка показать её
 * делалась через `window.scrollTo({ top: 0 })`.
 *
 * ПОЧЕМУ ЭТО НЕ РАБОТАЕТ. Корень админки — `flex h-screen overflow-hidden`,
 * прокручивается не документ, а `<main className="... overflow-y-auto">`.
 * Документ по высоте равен экрану и не скроллится вообще, поэтому
 * `window.scrollTo` — пустая операция. Замер в браузере на той же структуре
 * контейнеров: после `window.scrollTo({top:0})` `main.scrollTop` остался 2500,
 * после `form.scrollIntoView()` стал 20.
 *
 * Человек, стоящий в середине списка, не видел ни-че-го — и справедливо считал
 * кнопку сломанной. Симптом «не реагирует» тут не про обработчик события, а
 * про то, что результат работы оказался за пределами видимой области.
 *
 * ПОЧЕМУ ТЕСТ ЧИТАЕТ ИСХОДНИК. Поймать это поведением можно было бы только
 * подняв всю страницу админки (3800 строк, авторизация, сеть) в jsdom, который
 * к тому же не считает реальные размеры и прокрутку — то есть именно ту часть,
 * из-за которой баг и возник, jsdom не воспроизводит. Поэтому сторожим правило,
 * а не последствие: в этом файле нельзя опираться на прокрутку ОКНА.
 */

const PAGE = join(process.cwd(), "app/admin/page.tsx");

/** Убираем комментарии: в них window.scrollTo упоминается намеренно — как объяснение. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

describe("админка: прокрутка", () => {
  it("не вызывает window.scrollTo — окно в админке не прокручивается", () => {
    const code = stripComments(readFileSync(PAGE, "utf8"));
    expect(
      code.includes("window.scrollTo"),
      "В app/admin/page.tsx снова появился window.scrollTo. Он тут не работает: " +
        "прокручивается <main>, а не документ. Показывайте элемент через " +
        "ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }).",
    ).toBe(false);
  });

  it("формы правки показываются через scrollIntoView", () => {
    const code = readFileSync(PAGE, "utf8");
    // Обе формы, где живёт «Редактировать»: каталог и заметки.
    const calls = code.match(/scrollIntoView\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(code).toContain("ideaFormRef");
    expect(code).toContain("articleFormRef");
  });

  it("правило всё ещё уместно: скролл лежит на <main>, а не на документе", () => {
    const code = readFileSync(PAGE, "utf8");
    // Если вёрстку оболочки однажды перестроят и документ начнёт
    // прокручиваться, этот тест упадёт — и тот, кто перестраивал, перечитает
    // объяснение выше, а не обнаружит сюрприз на проде.
    expect(code).toContain("flex h-screen bg-zinc-50 overflow-hidden");
    expect(code).toContain('<main className="flex-1 overflow-y-auto p-10">');
  });
});
