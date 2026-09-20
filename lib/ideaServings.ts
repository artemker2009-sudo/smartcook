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
const PIECE_STEMS = ["штук", "зубч", "пучок", "пучк", "банк", "ломт"];

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
      return raw.replace(NUMBER, (match) => {
        const value = parseFloat(match.replace(",", "."));
        if (!Number.isFinite(value)) return match;
        // Эпсилон — против 2 * 1.5 = 2.9999999996 и лишней округлённой штуки.
        const scaled = Math.ceil(value * multiplier - 1e-9);
        // В меньшую сторону не опускаемся ниже одной штуки: ноль лука в
        // рецепте с луком — это не «уменьшили порции», это поломка.
        return String(Math.max(1, scaled));
      });
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

/** «2 порции», «5 порций». */
export function formatServings(count: number): string {
  const last = count % 10;
  const last100 = count % 100;
  if (last100 >= 11 && last100 <= 14) return `${count} порций`;
  if (last === 1) return `${count} порция`;
  if (last >= 2 && last <= 4) return `${count} порции`;
  return `${count} порций`;
}
