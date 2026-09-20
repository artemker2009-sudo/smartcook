// «Подходит мне»: сопоставление профиля вкуса с рецептами каталога.
//
// ЧИСТЫЙ модуль без "server-only" и без сети.
//
// ЧТО ЭТО НЕ ЕСТЬ. Это ПОДБОР, а не гарантия безопасности. Мы скрываем блюда,
// про которые сами написали, что в них есть аллерген, и блюда, в названиях
// ингредиентов которых нашлось нелюбимое слово. Мы не анализируем состав
// продуктов и не знаем, что положил производитель в колбасу. Поэтому
// формулировка в интерфейсе мягкая, а AiRecipeDisclaimer на экране рецепта
// остаётся.
//
// СОПОСТАВЛЕНИЕ — ПО ОСНОВАМ СЛОВ, ТОЧНЫМ РАВЕНСТВОМ. Берём готовый
// significantStems из lib/missingProducts.ts: он уже режет прилагательные,
// единицы, числа, предлоги и скобки, и уже работает в «Что нужно купить».
// Равенство основ, а не совпадение по началу строки: иначе «сыр» поймал бы
// «сырники» — ровно та ошибка, на которой мы уже спотыкались с «овощи/щи».

import { significantStems } from "./missingProducts";
import { IDEA_ALLERGENS, type IdeaAllergen } from "./ideaRecipes";

/**
 * Словарь синонимов: как люди пишут в профиле → наш тег аллергена.
 *
 * Название самого тега всегда входит в свои синонимы — человек может написать
 * ровно «молоко», и это должно сработать без отдельной строки.
 *
 * Многословные синонимы («сливочное масло») срабатывают только целиком: все их
 * основы должны найтись в том, что написал человек. Поэтому «масло» само по
 * себе НЕ считается молочным — сливочное и растительное это разные вещи, а в
 * профиле пишут и так, и так. Решение основателя.
 */
export const ALLERGEN_SYNONYMS: Record<IdeaAllergen, string[]> = {
  молоко: [
    "молоко", "молочное", "молочка", "молочные продукты", "лактоза", "казеин",
    "сливки", "сыр", "творог", "сметана", "кефир", "йогурт", "ряженка",
    "простокваша", "сгущёнка", "мороженое", "сливочное масло", "сливочный",
    "топлёное масло", "гхи",
  ],
  яйца: ["яйца", "яйцо", "яичный", "белок", "желток", "меланж", "майонез"],
  глютен: [
    "глютен", "клейковина", "мучное", "пшеница", "пшеничная мука", "мука",
    "хлеб", "батон", "булка", "макароны", "паста", "лапша", "манка", "манная",
    "булгур", "кускус", "сухари", "панировка", "отруби", "ячмень", "перловка",
    "рожь",
    // Овёс сам по себе безглютеновый, вопрос в загрязнении на производстве.
    // Перестраховываемся: в рецептах каталога помечается так же.
    "овёс", "овсянка", "овсяные хлопья",
  ],
  орехи: ["орехи", "орех", "грецкий", "фундук", "миндаль", "кешью", "фисташки", "пекан"],
  арахис: ["арахис", "арахисовая паста"],
  рыба: [
    "рыба", "рыбный", "треска", "лосось", "сёмга", "форель", "минтай", "хек",
    "тунец", "сельдь", "скумбрия", "горбуша", "судак", "щука", "анчоус", "икра",
  ],
  морепродукты: [
    "морепродукты", "креветки", "кальмар", "мидии", "краб", "крабовые палочки",
    "осьминог", "гребешок", "устрицы", "морской коктейль",
  ],
  соя: ["соя", "соевый соус", "тофу", "эдамаме"],
  кунжут: ["кунжут", "тахини", "кунжутное масло"],
  мёд: ["мёд", "медовый"],
};

/** Основы синонима, посчитанные один раз на модуль. */
const SYNONYM_STEMS: { allergen: IdeaAllergen; stems: Set<string> }[] = [];
for (const allergen of IDEA_ALLERGENS) {
  for (const synonym of ALLERGEN_SYNONYMS[allergen]) {
    SYNONYM_STEMS.push({ allergen, stems: significantStems(synonym) });
  }
}

function isSubset(small: Set<string>, big: Set<string>): boolean {
  if (small.size === 0) return false;
  for (const s of small) if (!big.has(s)) return false;
  return true;
}

export type TasteMatcher = {
  /** Теги аллергенов, которые нашлись в профиле по словарю. */
  allergens: IdeaAllergen[];
  /**
   * Слова, для которых тега не нашлось («клубника», «цитрусовые»), и все
   * нелюбимые продукты. Сравниваются напрямую с названиями ингредиентов.
   *
   * Это важнее, чем кажется: без этой ветки аллергия, которой нет в словаре,
   * просто ПРОПАДАЛА БЫ — фильтр молча ничего не скрывал, а человек думал бы,
   * что его услышали.
   */
  words: Set<string>[];
  /** Пуст ли профиль — от этого зависит, показывать ли чип вообще. */
  isEmpty: boolean;
};

/**
 * Разбирает профиль вкуса: аллергии по словарю → теги, остальное → слова.
 * Нелюбимые продукты всегда идут словами: синонимы там не нужны, человек
 * пишет ровно то, чего не хочет видеть.
 */
export function buildTasteMatcher(profile: {
  allergies?: string[] | null;
  dislikes?: string[] | null;
}): TasteMatcher {
  const allergens = new Set<IdeaAllergen>();
  const words: Set<string>[] = [];

  for (const raw of profile.allergies ?? []) {
    const stems = significantStems(String(raw || ""));
    if (stems.size === 0) continue;

    const matched = SYNONYM_STEMS.filter((s) => isSubset(s.stems, stems));
    if (matched.length > 0) {
      for (const m of matched) allergens.add(m.allergen);
    } else {
      // Слова из словаря нет — не теряем, сравним с ингредиентами.
      words.push(stems);
    }
  }

  for (const raw of profile.dislikes ?? []) {
    const stems = significantStems(String(raw || ""));
    if (stems.size > 0) words.push(stems);
  }

  return {
    allergens: [...allergens],
    words,
    isEmpty: allergens.size === 0 && words.length === 0,
  };
}

/** Есть ли у слова совпадение хотя бы с одним названием ингредиента. */
function matchesIngredients(word: Set<string>, ingredientStems: Set<string>): boolean {
  for (const s of word) if (ingredientStems.has(s)) return true;
  return false;
}

/**
 * Скрывать ли карточку при включённом «Подходит мне».
 *
 * Два независимых основания: тег аллергена, проставленный нами при вычитке
 * рецепта, и совпадение слова с названием ингредиента.
 */
export function hidesCard(
  card: { allergens?: string[] | null; ingredientNames?: string[] | null },
  taste: TasteMatcher,
): boolean {
  const cardAllergens = card.allergens ?? [];
  if (taste.allergens.some((a) => cardAllergens.includes(a))) return true;

  if (taste.words.length === 0) return false;

  const ingredientStems = new Set<string>();
  for (const name of card.ingredientNames ?? []) {
    for (const s of significantStems(name)) ingredientStems.add(s);
  }
  if (ingredientStems.size === 0) return false;

  return taste.words.some((w) => matchesIngredients(w, ingredientStems));
}
