// Что из рецепта человеку реально надо купить.
//
// ЗАЧЕМ ЭТОТ МОДУЛЬ. Сначала блок «Чего не хватает» верил полю
// missing_ingredients из ответа модели — и врал. В режиме «строго из этого»
// модель специально подбирает блюдо из того, что на фото, и честно возвращает
// пустой список «докупить»; на реальных данных пустым он приходил у трети
// рецептов (59 из 191 за два месяца). Экран при этом бодро писал «Всё есть
// дома», хотя в самом рецепте стояли продукты, которых у человека не было.
//
// ДВА СЛУЧАЯ, и они решают всё:
//
// (а) Продукты человека ИЗВЕСТНЫ — фото холодильника, перечисление руками,
//     текстовый запрос списком продуктов, демо-чип главной. Тогда
//     купить = ингредиенты рецепта − продукты человека − кладовка,
//     а то, что вычлось, показываем строкой «Уже есть у вас: …».
//
// (б) Продуктов человека НЕТ — рецепт по названию блюда, из истории, по
//     ссылке, рецепт дня. Сравнивать не с чем, поэтому
//     купить = ВСЕ ингредиенты рецепта − кладовка. Подсказку модели
//     missing_ingredients здесь не используем вовсе: раньше блок опирался
//     на неё и показывал «борщ: купите свёклу» — одну позицию из десяти.
//     Модель отвечает на вопрос «чего не хватает у человека», а в этом
//     случае у человека нет ничего.
//
// Ответ модели остаётся подсказкой в случае (а) и запасным вариантом, когда
// ингредиентов рецепта нет вовсе, — но никогда источником правды.
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
// всегда. ПРАВИТЬ ТОЛЬКО ЗДЕСЬ — это единственный список на всё приложение.
//
// Пишем полными названиями, как они приходят в рецептах: из них ниже
// собираются основы слов. Поэтому «перец черный молотый» в списке нужен
// целиком — тогда кладовкой считается и «перец», и «перец молотый», но НЕ
// «перец болгарский» (у него есть своё слово, которого в кладовке нет).
export const PANTRY_ITEMS = [
  "соль",
  "перец черный молотый",
  "вода",
  "растительное масло",
  "подсолнечное масло",
  "сахар",
  "уксус",
  // Были в кладовке и раньше: за «специями по вкусу» в магазин не ходят.
  "специи",
  "приправы",
  "по вкусу",
];

const PANTRY_STEMS = new Set<string>();
for (const item of PANTRY_ITEMS) {
  for (const s of significantStems(item)) PANTRY_STEMS.add(s);
}

/** Кладовка — когда ВСЕ значимые слова названия нашлись в PANTRY_ITEMS. */
export function isPantryStaple(name: string): boolean {
  const stems = significantStems(name);
  if (stems.size === 0) return false;
  return isSubset(stems, PANTRY_STEMS);
}

export interface MissingResult {
  /** Что нужно купить. */
  items: string[];
  /**
   * Что из нужного у человека уже есть — его же словами («лук», «морковь»).
   * Непусто только в случае (а); в случае (б) сравнивать не с чем.
   */
  have: string[];
  /**
   * Сколько продуктов всего в счёте: items + have. Это знаменатель строки
   * «Не хватает N из M». Считаем именно так, а не по длине списка
   * ингредиентов, чтобы арифметика на экране сходилась: кладовка в счёт не
   * идёт (за солью никого не гоняем), а подсказка модели — идёт.
   */
  total: number;
  /**
   * Знаем ли мы, что у человека есть дома. false — сравнивать было не с чем
   * (рецепт из истории, по ссылке, поиск по названию блюда), и тогда ни
   * «Всё есть дома», ни счётчик «N из M» писать НЕЛЬЗЯ: это была бы выдумка.
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

  // Случай (а): ингредиенты рецепта плюс подсказки модели — она иногда
  // называет то, чего в техкарте нет (соус, гарнир), и это честная покупка.
  // Случай (б): ВЕСЬ рецепт, без подсказок модели. Её список тут отвечает не
  // на тот вопрос. Запасной вариант — когда ингредиентов рецепта нет вовсе
  // (старые записи рецепта дня): лучше список модели, чем пустой блок.
  const source = comparable
    ? [...needed, ...modelMissing]
    : needed.length > 0
      ? needed
      : modelMissing;

  const items: string[] = [];
  const have: string[] = [];
  for (const name of source) {
    if (isPantryStaple(name)) continue;
    // Показываем то, что человек назвал сам («лук»), а не как продукт записан
    // в техкарте («Лук репчатый (1 шт., 80 г)») — так он узнаёт свои продукты.
    const owned = comparable ? known.find((k) => sameProduct(k, name)) : undefined;
    if (owned) {
      if (!have.some((picked) => sameProduct(picked, owned))) have.push(owned);
      continue;
    }
    if (items.some((picked) => sameProduct(picked, name))) continue;
    items.push(name);
  }

  return { items, have, total: items.length + have.length, comparable };
}
