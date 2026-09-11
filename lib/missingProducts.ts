// Что из рецепта человеку реально надо купить.
//
// ЗАЧЕМ ЭТОТ МОДУЛЬ. Сначала блок «Чего не хватает» верил полю
// missing_ingredients из ответа модели — и врал. В режиме «строго из этого»
// модель специально подбирает блюдо из того, что на фото, и честно возвращает
// пустой список «докупить»; на реальных данных пустым он приходил у трети
// рецептов (59 из 191 за два месяца). Экран при этом бодро писал «Всё есть
// дома», хотя в самом рецепте стояли продукты, которых у человека не было.
//
// Поэтому недостающее считаем САМИ: вычитаем из ингредиентов рецепта то, что у
// человека есть (распознанные продукты с фото или перечисленные им руками), и
// докидываем то, что модель назвала сама. Ответ модели остаётся подсказкой, а
// не источником правды.
//
// Чистые функции, без DOM и сети — модуль тестируется и переиспользуется.

import { classifyWord, stem } from "./productWords";
import { splitIngredientList } from "./recipeValidation";

// Прилагательные окончания. stem() из productWords их не трогает (он заточен
// под существительные), поэтому «черный» так и оставался «черный», а «чёрного»
// становилось «черно» — и два написания одного слова переставали совпадать.
// Здесь срезаем их сами, ДО stem, и одинаково для обеих сторон сравнения.
const ADJECTIVE_ENDINGS = [
  "ого", "его", "ому", "ему", "ыми", "ими", "ая", "яя", "ое", "ее", "ые", "ие",
  "ый", "ий", "ой", "ым", "им", "ых", "их", "ую", "юю",
];

const MIN_BASE = 3;

/** Основа слова с учётом прилагательных: «растительное» → «растительн». */
function baseWord(raw: string): string {
  const low = raw.toLowerCase().replace(/ё/g, "е");
  for (const end of ADJECTIVE_ENDINGS) {
    if (low.length - end.length >= MIN_BASE && low.endsWith(end)) return low.slice(0, -end.length);
  }
  return stem(low);
}

/**
 * Основы значимых слов названия. Числа, единицы измерения, предлоги и союзы
 * выбрасываем: «Морковь (1 шт, 120 г)» и «морковь» должны сойтись.
 */
export function significantStems(name: string): Set<string> {
  const out = new Set<string>();
  const words = String(name || "")
    .toLowerCase()
    .replace(/[()[\]{}«»"'`.,;:!?/\\%+]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);

  for (const word of words) {
    const kind = classifyWord(word);
    if (kind === "unit" || kind === "quantity" || kind === "connector" || kind === "preposition") continue;
    if (/^\d/.test(word)) continue;
    const s = baseWord(word);
    if (s.length >= MIN_BASE) out.add(s);
  }
  return out;
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * Один ли это продукт. Совпадение — когда одно название уточняет другое:
 * «масло» ⊂ «масло растительное», «яйцо» ⊂ «яйцо куриное», «помидор» = «помидоры».
 *
 * А вот «перец болгарский» и «перец черный молотый» пересекаются только по
 * «перец», и ни одно не является уточнением другого — это РАЗНЫЕ продукты.
 * Именно это правило не даёт нам записать в «есть дома» половину магазина.
 */
export function sameProduct(a: string, b: string): boolean {
  const A = significantStems(a);
  const B = significantStems(b);
  if (A.size === 0 || B.size === 0) return false;
  let common = false;
  for (const v of A) if (B.has(v)) { common = true; break; }
  if (!common) return false;
  return isSubset(A, B) || isSubset(B, A);
}

// «Кладовка»: то, что есть на любой кухне и за чем никого не гоняем в магазин.
// Ровно эти же продукты промпт режима «строго из этого» считает имеющимися
// всегда. Правило — ВСЕ значимые слова названия должны попасть в этот набор,
// поэтому «перец черный молотый» отсеивается, а «перец болгарский» остаётся.
const PANTRY_STEMS = new Set([
  "сол", "перец", "черн", "молот", "сахар", "вод", "масл", "растительн",
  "подсолнечн", "специ", "приправ", "вкус",
]);

export function isPantryStaple(name: string): boolean {
  const stems = significantStems(name);
  if (stems.size === 0) return false;
  return isSubset(stems, PANTRY_STEMS);
}

export interface MissingResult {
  /** Что нужно купить. */
  items: string[];
  /**
   * Знаем ли мы, что у человека есть дома. false — сравнивать было не с чем
   * (рецепт из истории, по ссылке, поиск по названию блюда), и тогда писать
   * «Всё есть дома» НЕЛЬЗЯ: это была бы выдумка, а не хорошая новость.
   */
  comparable: boolean;
}

/**
 * detailed — ингредиенты рецепта (что нужно), known — продукты человека
 * (что есть), modelMissing — список «докупить» из ответа модели.
 */
export function computeMissing(input: {
  detailed?: { name?: string }[] | null;
  known?: string[] | null;
  modelMissing?: string[] | string | null;
}): MissingResult {
  const needed = (input.detailed || [])
    .map((i) => String(i?.name || "").trim())
    .filter(Boolean);
  const known = (input.known || []).map((k) => String(k || "").trim()).filter(Boolean);
  // Старые записи иногда хранят весь список одной склеенной строкой (баг AB).
  const modelMissing = splitIngredientList(input.modelMissing);
  const comparable = known.length > 0;

  const candidates: string[] = [];
  if (comparable) {
    // Всё, чего нет у человека, плюс подсказки модели — тоже проверенные по
    // тому, что у него есть (модель иногда просит докупить лежащее на фото).
    for (const name of [...needed, ...modelMissing]) {
      if (!known.some((k) => sameProduct(k, name))) candidates.push(name);
    }
  } else {
    candidates.push(...modelMissing);
  }

  const items: string[] = [];
  for (const name of candidates) {
    if (isPantryStaple(name)) continue;
    if (items.some((picked) => sameProduct(picked, name))) continue;
    items.push(name);
  }

  return { items, comparable };
}
