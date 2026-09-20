// Пересчёт количеств под выбранное число порций на экране рецепта каталога.
//
// ГЛАВНОЕ ОТЛИЧИЕ ОТ ЭКРАНА ПОИСКА, из-за которого нельзя скопировать вызов
// из RecipeView. Там написано scaleAmount(ing.amount, actualServings), то есть
// множитель равен АБСОЛЮТНОМУ числу порций: в recipes количества хранятся на
// одну порцию. В idea_recipes количества хранятся на ВЕСЬ рецепт — у тефтелей
// servings = 4 и «500 г» фарша это на четверых. Скопировать вызов один в один
// значит получить пятикратный фарш, и на четырёх порциях (множитель 1) этого
// не видно вообще. Поэтому множитель здесь — доля: выбранное / базовое.

import { scaleAmount } from "./utils";

/** Сколько порций можно выбрать. Границы одни на интерфейс и на пересчёт. */
export const SERVINGS_MIN = 1;
export const SERVINGS_MAX = 12;

// Количества, которые пересчитывать нельзя. Без числа они и так переживают
// scaleAmount (тот трогает только цифры), но «1 щепотка» и «1 ст. л. для
// жарки» цифру имеют, и их бы разнесло вместе со всем остальным.
//
// Сравниваем по ОСНОВАМ слов, а не по подстроке: на подстроках мы уже
// обожглись — «овощи» содержит «щи», и запечённая рыба уехала в супы.
const STOP_STEMS = ["вкус", "щепот", "жарк", "обжарк", "смазыв", "подач", "желан", "кончик"];

// Штучное: округляем вверх. Пол-яйца не кладут, и «0,8 шт» в списке продуктов
// читается как ошибка приложения, а не как точность.
//
// Распознаём по ОСНОВЕ, широко: «баночка» и «зубчики» тоже штучные, и
// округлить их вверх надо в любом случае, даже если склонять мы такую форму
// не умеем.
const PIECE_STEMS = ["штук", "зубч", "пучок", "пучк", "банк", "ломт", "веточ"];

type PieceWord = {
  /** Все формы, которые может написать редактор. */
  forms: string[];
  /** 1 зубчик */
  one: string;
  /** 2 зубчика */
  few: string;
  /** 5 зубчиков */
  many: string;
};

// Склонение штучных единиц по числу. Без него округление вверх давало
// «1 зубчика» и «2 штуки» превращалось в «1 штуки» — число верное, а строка
// читается как недоделка.
//
// «шт» здесь намеренно НЕТ: это сокращение, оно не склоняется ни при каком
// числе. Незнакомая форма («баночка») остаётся как написана — округление
// вверх к ней всё равно применится, а выдумывать за редактора склонение
// слова, которого нет в словаре, мы не будем.
const PIECE_WORDS: PieceWord[] = [
  {
    forms: ["зубчик", "зубчика", "зубчиков", "зубчики"],
    one: "зубчик",
    few: "зубчика",
    many: "зубчиков",
  },
  { forms: ["пучок", "пучка", "пучков", "пучки"], one: "пучок", few: "пучка", many: "пучков" },
  { forms: ["банка", "банки", "банок", "банку"], one: "банка", few: "банки", many: "банок" },
  {
    forms: ["ломтик", "ломтика", "ломтиков", "ломтики"],
    one: "ломтик",
    few: "ломтика",
    many: "ломтиков",
  },
  {
    forms: ["веточка", "веточки", "веточек", "веточку"],
    one: "веточка",
    few: "веточки",
    many: "веточек",
  },
  { forms: ["штука", "штуки", "штук", "штуку"], one: "штука", few: "штуки", many: "штук" },
];

/** Форма слова под число: 1 зубчик, 2 зубчика, 5 зубчиков, 11 зубчиков. */
function pluralForm(count: number, word: PieceWord): string {
  const last = Math.abs(count) % 10;
  const last100 = Math.abs(count) % 100;
  // 11–14 — исключение: «11 зубчиков», а не «11 зубчик».
  if (last100 >= 11 && last100 <= 14) return word.many;
  if (last === 1) return word.one;
  if (last >= 2 && last <= 4) return word.few;
  return word.many;
}

/** Привести штучную единицу в строке количества к нужной форме. */
function declinePieces(amount: string, count: number): string {
  return amount.replace(/[а-яё]+/gi, (word) => {
    const entry = PIECE_WORDS.find((w) => w.forms.includes(word.toLowerCase()));
    return entry ? pluralForm(count, entry) : word;
  });
}

const NUMBER = /\d+(?:[.,]\d+)?/;
const NUMBER_ALL = /\d+(?:[.,]\d+)?/g;

/** Слова количества. Точки и дефисы — разделители: «ст. л.» это два слова. */
function words(amount: string): string[] {
  return amount
    .toLowerCase()
    .split(/[^0-9a-zа-яё]+/i)
    .filter(Boolean);
}

function hasStopWord(amount: string): boolean {
  return words(amount).some((w) => STOP_STEMS.some((stem) => w.startsWith(stem)));
}

function isPiece(amount: string): boolean {
  return words(amount).some(
    (w) => w === "шт" || PIECE_STEMS.some((stem) => w.startsWith(stem)),
  );
}

/**
 * Количество ингредиента под выбранное число порций.
 *
 * base — servings рецепта (на сколько порций написаны количества).
 * Равные значения возвращают строку БУКВА В БУКВУ: по умолчанию человек видит
 * ровно то, что написал редактор, включая дроби вида «0,5 шт».
 */
export function scaleIdeaAmount(amount: string, chosen: number, base: number): string {
  const raw = (amount || "").trim();
  if (!raw) return "";
  if (!Number.isFinite(chosen) || !Number.isFinite(base) || base <= 0) return raw;
  if (chosen === base) return raw;
  if (hasStopWord(raw)) return raw;

  const multiplier = chosen / base;

  if (isPiece(raw)) {
    const numbers = raw.match(NUMBER_ALL) || [];
    // Ровно одно число. «1-2 шт» — это уже пожелание, а не количество, и
    // округлять там нечего; такие строки уходят общим путём.
    if (numbers.length === 1) {
      const value = parseFloat(numbers[0].replace(",", "."));
      if (Number.isFinite(value)) {
        // Эпсилон — против 2 * 1.5 = 2.9999999996 и лишней округлённой штуки.
        // В меньшую сторону не опускаемся ниже одной штуки: ноль лука в
        // рецепте с луком — это не «уменьшили порции», это поломка.
        const count = Math.max(1, Math.ceil(value * multiplier - 1e-9));
        return declinePieces(raw.replace(NUMBER, String(count)), count);
      }
    }
  }

  return scaleAmount(raw, multiplier);
}

/**
 * Строка для списка покупок: «Фарш говяжий 375 г».
 *
 * Позиция списка — ОДНА строка (ShoppingItem.name), название и количество там
 * не разделены; lib/shoppingQuantity.ts разбирает их только для показа.
 * Поэтому выбранное число порций уезжает в список само собой, отдельного
 * механизма не нужно.
 */
export function ingredientLine(name: string, amount: string): string {
  return [String(name || "").trim(), String(amount || "").trim()].filter(Boolean).join(" ");
}

/** Зажать число порций в допустимые границы. */
export function clampServings(value: number): number {
  if (!Number.isFinite(value)) return SERVINGS_MIN;
  return Math.min(SERVINGS_MAX, Math.max(SERVINGS_MIN, Math.round(value)));
}

const SERVING_WORD: PieceWord = {
  forms: ["порция", "порции", "порций"],
  one: "порция",
  few: "порции",
  many: "порций",
};

/** «2 порции», «5 порций». Тот же закон склонения, что у штучных единиц. */
export function formatServings(count: number): string {
  return `${count} ${pluralForm(count, SERVING_WORD)}`;
}
