import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Страж безопасной зоны на экране рецепта каталога «Идеи» (/ideas/[slug]).
 *
 * ЧТО СЛОМАЛОСЬ. Экран начинается фотографией блюда во всю ширину, и раньше
 * она шла от самой верхней кромки окна. На iPhone с вырезом или Dynamic Island
 * первые ~59px занимают часы и сам островок: они оказывались поверх еды, а
 * круглые «назад», «поделиться» и сердечко — под островком, и «назад» было
 * физически не нажать.
 *
 * КАК ЧИНИТСЯ. Вырез отрабатывает СТРАНИЦА: `.idea-page` получает
 * `padding-top: var(--safe-top)`, и над фотографией остаётся полоса фона —
 * ровно как на остальных экранах приложения. Кнопки при этом отсчитываются от
 * САМОЙ ФОТОГРАФИИ и вырез в себе не повторяют: второе слагаемое опустило бы
 * их на высоту выреза дважды. Именно это тут и сторожится.
 *
 * ПОЧЕМУ ТЕСТ ЧИТАЕТ CSS, А НЕ ЖМЁТ КНОПКУ. Баг живёт в паре чисел и
 * проявляется только там, где env(safe-area-inset-top) не ноль. jsdom не
 * считает ни env(), ни calc(), ни раскладку вообще — поведением это не
 * ловится в принципе. Сторожим правило, а не последствие.
 *
 * ВТОРАЯ ПОЛОВИНА ТЕСТА ВАЖНЕЕ ПЕРВОЙ. Требование основателя: на Android, в
 * TWA из RuStore и на iPhone без выреза (SE, 8) вид обязан остаться прежним
 * пиксель в пиксель. Поэтому здесь не проверка «в правиле есть слово safe», а
 * счёт: одни и те же выражения вычисляются при вырезе 0 и при вырезе 59px
 * (iPhone 15/16/17), и при нуле обязаны дать РОВНО прежние значения.
 */

const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf-8");

/** Тело CSS без комментариев: в них те же свойства встречаются как пояснения. */
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

function escapeSelector(selector: string): string {
  return selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Значение свойства из правила верхнего уровня с данным селектором. */
function declaration(selector: string, property: string): string {
  // Правило ищем с начала строки — иначе `.container` поймался бы внутри
  // `.some .container {`, где значения другие.
  const found = CSS_CODE.match(new RegExp(`^${escapeSelector(selector)} \\{([^}]*)\\}`, "m"));
  if (!found) throw new Error(`В globals.css нет правила верхнего уровня ${selector}`);
  return property_(found[1], selector, property);
}

/**
 * То же, но для правила внутри медиазапроса: там `.idea-page` переопределяется
 * целиком. Блоков с одной и той же шириной в файле несколько, поэтому берём
 * тот, в котором есть нужный селектор.
 */
function declarationInMedia(media: string, selector: string, property: string): string {
  const blocks = [
    ...CSS_CODE.matchAll(new RegExp(`@media ${escapeSelector(media)} \\{([\\s\\S]*?)\\n\\}`, "g")),
  ];
  if (blocks.length === 0) throw new Error(`В globals.css нет медиазапроса ${media}`);
  const rule = new RegExp(`(?:^|\\n)\\s*${escapeSelector(selector)} \\{([^}]*)\\}`);
  for (const block of blocks) {
    const found = block[1].match(rule);
    if (found) return property_(found[1], `${media} → ${selector}`, property);
  }
  throw new Error(`В медиазапросе ${media} нет правила ${selector}`);
}

function property_(body: string, where: string, property: string): string {
  const match = body.match(new RegExp(`(?:^|[;{])\\s*${property}\\s*:\\s*([^;]+)[;\\s]`));
  if (!match) throw new Error(`В правиле ${where} нет свойства ${property}`);
  return match[1].trim();
}

/**
 * Считает длину в пикселях при заданном вырезе.
 *
 * Намеренно крошечный вычислитель: полноценный парсер CSS здесь был бы оружием
 * не по цели. Значения токенов берутся из самого globals.css — иначе тест
 * разъедется с ним при первой же правке шкалы отступов.
 */
function px(value: string, safeTopPx: number): number {
  const resolved = (value.match(/^calc\((.+)\)$/)?.[1] ?? value)
    .replace(/var\(--safe-top\)/g, `${safeTopPx}px`)
    .replace(/var\((--[\w-]+)\)/g, (_, token: string) => {
      const declared = CSS_CODE.match(new RegExp(`${token}\\s*:\\s*([0-9.]+)px`));
      if (!declared) throw new Error(`В globals.css не найден токен ${token}`);
      return `${declared[1]}px`;
    });
  const terms = resolved.split("+").map((term) => Number.parseFloat(term.trim()));
  if (terms.some((term) => Number.isNaN(term))) throw new Error(`Не удалось посчитать: ${value}`);
  return terms.reduce((sum, term) => sum + term, 0);
}

/** Первое слагаемое сокращённого `padding` — верхнее. */
function paddingTop(shorthand: string, safeTopPx: number): number {
  return px(shorthand.split(/\s+(?![^(]*\))/)[0], safeTopPx);
}

/** Вырез iPhone 15/16/17 c Dynamic Island в CSS-пикселях. */
const ISLAND = 59;
/** Отступ фотографии от верха страницы, var(--space-2). */
const HERO_GAP = 8;
/** Отступ кнопок от кромки фотографии, var(--space-2). */
const BUTTON_GAP = 8;

/** Где оказывается верх фотографии и верх круглой кнопки при заданном вырезе. */
function layout(safeTopPx: number) {
  const pagePadding = paddingTop(declaration(".idea-page", "padding"), safeTopPx);
  const heroTop = pagePadding + px(declaration(".idea-hero", "margin-top"), safeTopPx);
  return {
    heroTop,
    backTop: heroTop + px(declaration(".idea-round-back", "top"), safeTopPx),
    actionsTop: heroTop + px(declaration(".idea-hero-actions", "top"), safeTopPx),
  };
}

describe("--safe-top", () => {
  it("равен вырезу, а без выреза — нулю", () => {
    // Запасное значение обязательно: без него на браузере, не знающем env(),
    // переменная стала бы невалидной, а следом — и всё, что её использует.
    expect(CSS).toContain("--safe-top: env(safe-area-inset-top, 0px);");
  });

  it("работает только при viewport-fit=cover — он задан в root layout", () => {
    // Без него браузер отдаёт нули на любом устройстве, и правка молча
    // перестанет действовать, оставшись в CSS.
    const layoutSource = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf-8");
    expect(layoutSource).toMatch(/viewportFit:\s*"cover"/);
  });
});

describe("страницу рецепта «Идей» сдвигает вниз именно .idea-page", () => {
  it("верхний отступ страницы равен вырезу", () => {
    expect(paddingTop(declaration(".idea-page", "padding"), ISLAND)).toBe(ISLAND);
    expect(paddingTop(declaration(".idea-page", "padding"), 0)).toBe(0);
  });

  it("на планшете и в ландшафте отступ не теряется", () => {
    // Правило в медиазапросе переопределяет padding ЦЕЛИКОМ, поэтому вырез
    // обязан быть и там — иначе от 768px фотография снова лезет под часы.
    const wide = declarationInMedia("(min-width: 768px)", ".idea-page", "padding");
    expect(paddingTop(wide, ISLAND)).toBe(ISLAND);
    expect(paddingTop(wide, 0)).toBe(0);
  });

  it("боковые поля и скругление снимка не тронуты", () => {
    expect(declaration(".idea-page", "padding")).toContain("var(--space-2h)");
    expect(declaration(".idea-hero-img", "border-radius")).toBe("24px");
  });
});

describe("кнопки поверх фотографии не прибавляют вырез второй раз", () => {
  const buttons = [
    [".idea-round-back", "назад"],
    [".idea-hero-actions", "поделиться и сердечко"],
  ] as const;

  it.each(buttons)("%s (%s) отсчитывается от фотографии, а не от окна", (selector) => {
    // Главная ловушка этой правки: вырез уже отработала страница. Стоит
    // вернуть сюда var(--safe-top) — и кнопки уедут вниз на 59px дважды.
    expect(declaration(selector, "top")).toBe("var(--space-2)");
  });

  it.each(buttons)("%s (%s): горизонтальный отступ прежний", (selector) => {
    const side = selector === ".idea-round-back" ? "left" : "right";
    expect(declaration(selector, side)).toBe("var(--space-2)");
  });
});

describe("что получается на экране", () => {
  it("без выреза всё ровно как было: фото на 8, кнопки на 16", () => {
    // Android, TWA из RuStore, iPhone SE/8, десктоп.
    expect(layout(0)).toEqual({ heroTop: HERO_GAP, backTop: 16, actionsTop: 16 });
  });

  it("с вырезом фото уходит ниже безопасной зоны ровно на её высоту", () => {
    const withIsland = layout(ISLAND);
    expect(withIsland.heroTop).toBe(ISLAND + HERO_GAP);
    // Часы и островок стоят НАД фоном страницы, а не над едой.
    expect(withIsland.heroTop).toBeGreaterThan(ISLAND);
    // Сдвиг ровно на вырез — ни больше, ни меньше.
    expect(withIsland.heroTop - layout(0).heroTop).toBe(ISLAND);
  });

  it("кнопки не уезжают дважды: они ниже фото ровно на свой отступ", () => {
    const withIsland = layout(ISLAND);
    expect(withIsland.backTop).toBe(ISLAND + HERO_GAP + BUTTON_GAP);
    expect(withIsland.actionsTop).toBe(withIsland.backTop);
    expect(withIsland.backTop - withIsland.heroTop).toBe(BUTTON_GAP);
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
