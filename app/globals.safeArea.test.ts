import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Страж безопасной зоны для кнопок, лежащих ПОВЕРХ картинки от самого верха.
 *
 * ЧТО СЛОМАЛОСЬ. На экране рецепта каталога «Идеи» (/ideas/[slug]) снимок
 * блюда начинается у верхней кромки окна, а «назад», «поделиться» и сердечко
 * лежат поверх него с отступом в 8px. На iPhone с вырезом или Dynamic Island
 * эти первые ~59px занимают часы и сам островок: все три кнопки оказывались
 * под ними, и «назад» было физически не нажать — выйти с экрана можно было
 * только свайпом.
 *
 * ПОЧЕМУ ТЕСТ ЧИТАЕТ CSS, А НЕ ЖМЁТ КНОПКУ. Баг живёт ровно в одном числе —
 * в `top` у абсолютно позиционированной кнопки, и проявляется только там, где
 * env(safe-area-inset-top) не ноль. jsdom не считает ни env(), ни calc(), ни
 * раскладку вообще, поэтому поведением это не ловится в принципе: поднимать
 * пришлось бы настоящий браузер на настоящем устройстве с вырезом. Сторожим
 * правило, а не последствие.
 *
 * ВТОРАЯ ПОЛОВИНА ТЕСТА ВАЖНЕЕ ПЕРВОЙ. Требование основателя: на Android, в
 * TWA из RuStore и на iPhone без выреза (SE, 8) вид обязан остаться прежним
 * пиксель в пиксель. Поэтому здесь не просто проверка «в правиле есть слово
 * safe», а счёт: тот же самый calc() вычисляется при вырезе 0 и при вырезе
 * 59px (iPhone 15/16). При нуле обязано получиться РОВНО прежние 8px.
 */

const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf-8");

/** Тело CSS без комментариев: в них те же свойства встречаются как пояснения. */
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** Значение свойства из правила верхнего уровня с данным селектором. */
function declaration(selector: string, property: string): string {
  // Правило ищем с начала строки — иначе `.container` поймался бы внутри
  // `.some .container {` или в медиазапросе, где значения другие.
  const rule = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`, "m");
  const found = CSS_CODE.match(rule);
  if (!found) throw new Error(`В globals.css нет правила верхнего уровня ${selector}`);
  const match = found[1].match(new RegExp(`(?:^|[;{])\\s*${property}\\s*:\\s*([^;]+);`));
  if (!match) throw new Error(`В правиле ${selector} нет свойства ${property}`);
  return match[1].trim();
}

/**
 * Считает `calc(var(--safe-top) + var(--space-N))` при заданном вырезе.
 *
 * Намеренно крошечный вычислитель: полноценный парсер CSS здесь был бы
 * оружием не по цели, а значения токенов берутся из самого globals.css —
 * иначе тест разъедется с ним при первой же правке шкалы отступов.
 */
function topPx(value: string, safeTopPx: number): number {
  const calc = value.match(/^calc\((.+)\)$/);
  if (!calc) throw new Error(`Ожидался calc(), получено: ${value}`);
  const resolved = calc[1]
    .replace(/var\(--safe-top\)/g, `${safeTopPx}px`)
    .replace(/var\((--space-[\w-]+)\)/g, (_, token: string) => {
      const declared = CSS.match(new RegExp(`${token}\\s*:\\s*([0-9.]+)px`));
      if (!declared) throw new Error(`В globals.css не найден токен ${token}`);
      return `${declared[1]}px`;
    });
  const terms = resolved.split("+").map((term) => Number.parseFloat(term.trim()));
  if (terms.some((term) => Number.isNaN(term))) {
    throw new Error(`Не удалось посчитать: ${resolved}`);
  }
  return terms.reduce((sum, term) => sum + term, 0);
}

/** Вырез iPhone 15/16 c Dynamic Island в CSS-пикселях. */
const DYNAMIC_ISLAND = 59;
/** Прежний отступ кнопок от края картинки, var(--space-2). */
const BASELINE = 8;

describe("--safe-top", () => {
  it("равен вырезу, а без выреза — нулю", () => {
    // Запасное значение обязательно: без него на браузере, не знающем env(),
    // переменная стала бы невалидной, calc() следом — тоже, и `top` схлопнулся
    // бы в auto, то есть кнопки уехали бы вообще не туда.
    expect(CSS).toContain("--safe-top: env(safe-area-inset-top, 0px);");
  });

  it("работает только при viewport-fit=cover — он задан в root layout", () => {
    // Без него браузер отдаёт нули на любом устройстве, и правка молча
    // перестанет действовать, оставшись в CSS.
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf-8");
    expect(layout).toMatch(/viewportFit:\s*"cover"/);
  });
});

describe("кнопки поверх картинки на /ideas/[slug]", () => {
  const overlays = [
    [".idea-round-back", "назад"],
    [".idea-hero-actions", "поделиться и сердечко"],
  ] as const;

  it.each(overlays)("%s (%s) отступает от выреза", (selector) => {
    const top = declaration(selector, "top");
    expect(top).toContain("var(--safe-top)");
  });

  it.each(overlays)("%s (%s): на экране с вырезом кнопка ниже островка", (selector) => {
    const top = declaration(selector, "top");
    expect(topPx(top, DYNAMIC_ISLAND)).toBe(DYNAMIC_ISLAND + BASELINE);
    // Сама кнопка 44px: её верх обязан начинаться НЕ ВЫШЕ нижней кромки
    // островка, иначе тап по ней по-прежнему съедает система.
    expect(topPx(top, DYNAMIC_ISLAND)).toBeGreaterThanOrEqual(DYNAMIC_ISLAND);
  });

  it.each(overlays)("%s (%s): без выреза всё ровно как было", (selector) => {
    // Android, TWA из RuStore, iPhone SE/8, десктоп.
    expect(topPx(declaration(selector, "top"), 0)).toBe(BASELINE);
  });

  it("горизонтальные отступы не тронуты: вырез сверху, а не по бокам", () => {
    expect(declaration(".idea-round-back", "left")).toBe("var(--space-2)");
    expect(declaration(".idea-hero-actions", "right")).toBe("var(--space-2)");
  });
});

/**
 * Остальные экраны, где контент идёт от верхней кромки, безопасную зону уже
 * учитывают. Тест держит это, чтобы правка соседнего правила не вернула баг
 * туда, где его сегодня нет.
 */
describe("соседние полноэкранные раскладки не теряют вырез", () => {
  it.each([
    [".container", "внутренние страницы, включая /recipe/[id]"],
    [".cook-screen", "режим готовки"],
    [".cook-drawer-inner", "панель «Состав» в режиме готовки"],
  ])("%s (%s)", (selector) => {
    expect(declaration(selector, "padding")).toContain("env(safe-area-inset-top)");
  });
});
