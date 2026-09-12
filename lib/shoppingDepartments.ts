// Отдел магазина для продукта — БЕЗ сети, по словарю.
//
// Зачем: в разложенный по отделам список добавили «сметану». Раньше раскладка
// от этого целиком устаревала, чип предлагал «обновить отделы», а нажатие
// стоило ещё один вызов модели — ради одной строки, отдел которой очевиден.
// Теперь новый продукт сначала ищется здесь: базовый словарь частых продуктов
// плюс «выученное» из уже сделанных раскладок на этом устройстве. Нашли —
// позиция встаёт в свой отдел сразу. Не нашли — временно в «Прочее», и модель
// спрашивают только про неё (см. components/shopping/useAutoPlace).
//
// Файл общий для клиента и сервера: сервер общего списка тоже сначала смотрит
// в базовый словарь и зовёт модель только для того, чего здесь нет.
//
// Импорты внутри lib/ — относительные: vitest не знает алиаса @/.

import { stem, looksLikeAdjective } from "./productWords";
import { OTHER_DEPARTMENT, SHOPPING_DEPARTMENTS, type ShoppingDepartment, type ShoppingGroup } from "./shoppingList";
import { splitQuantity } from "./shoppingQuantity";

export type Placement = { name: string; department: ShoppingDepartment };

/** Ключ позиции для сравнения — ровно как в ListScreen и в дедупе. */
export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

const ALLOWED = new Set<string>(SHOPPING_DEPARTMENTS);

export function isDepartment(value: unknown): value is ShoppingDepartment {
  return typeof value === "string" && ALLOWED.has(value);
}

// --- Базовый словарь ----------------------------------------------------------
//
// Около двухсот самых частых позиций. Отделы — те же, что просит у модели
// lib/shoppingSort (список SHOPPING_DEPARTMENTS). Многословные записи нужны там,
// где одно слово обманывает: «масло» — это сливочное (Молочное), а «масло
// подсолнечное» — Бакалея; «перец» — овощ, «перец чёрный» — специя.
//
// Спорные позиции (кукуруза, котлеты, горошек) намеренно НЕ внесены: пусть их
// отнесёт модель, чем словарь уверенно ошибётся.

const BASE: Record<Exclude<ShoppingDepartment, "Прочее">, string[]> = {
  "Овощи-фрукты": [
    "картофель", "картошка", "морковь", "морковка", "лук", "лук репчатый", "лук зеленый", "зеленый лук",
    "лук-порей", "порей", "чеснок", "капуста", "цветная капуста", "пекинская капуста", "брокколи",
    "огурец", "огурцы", "помидор", "помидоры", "томаты", "томат", "черри", "перец", "перец болгарский",
    "болгарский перец", "кабачок", "кабачки", "цукини", "баклажан", "баклажаны", "свекла", "редис",
    "редиска", "редька", "тыква", "зелень", "укроп", "петрушка", "кинза", "базилик", "салат",
    "листья салата", "руккола", "шпинат", "сельдерей", "имбирь", "грибы", "шампиньоны", "авокадо",
    "лимон", "лимоны", "лайм", "апельсин", "апельсины", "мандарин", "мандарины", "грейпфрут",
    "яблоко", "яблоки", "груша", "груши", "банан", "бананы", "виноград", "киви", "ананас", "персик",
    "персики", "нектарин", "нектарины", "абрикос", "абрикосы", "слива", "сливы", "черешня", "вишня",
    "клубника", "малина", "черника", "голубика", "арбуз", "дыня", "гранат", "манго",
  ],
  "Молочное": [
    "молоко", "кефир", "ряженка", "простокваша", "варенец", "сметана", "творог", "творожок", "сливки",
    "сыр", "сырок", "сырки", "брынза", "моцарелла", "пармезан", "фета", "творожный сыр",
    "плавленый сыр", "сыр плавленый", "масло", "масло сливочное", "сливочное масло", "маргарин",
    "йогурт", "йогурты", "айран", "сгущенка", "сгущенное молоко", "яйцо", "яйца",
  ],
  "Мясо-рыба": [
    "мясо", "курица", "куриное филе", "филе", "грудка", "куриная грудка", "окорочка", "крылышки",
    "голень", "бедра", "фарш", "говядина", "свинина", "баранина", "телятина", "индейка", "утка",
    "печень", "сало", "бекон", "колбаса", "сосиски", "сардельки", "ветчина", "буженина", "карбонад",
    "шашлык", "стейк", "ребра", "рыба", "лосось", "семга", "форель", "треска", "минтай", "хек",
    "скумбрия", "сельдь", "селедка", "горбуша", "креветки", "кальмары", "мидии", "икра",
    "крабовые палочки",
  ],
  "Бакалея": [
    "сахар", "соль", "мука", "рис", "гречка", "овсянка", "овсяные хлопья", "геркулес", "пшено",
    "перловка", "манка", "булгур", "кускус", "киноа", "макароны", "спагетти", "лапша", "вермишель",
    "фасоль", "горох", "чечевица", "нут", "масло подсолнечное", "масло растительное",
    "масло оливковое", "уксус", "соевый соус", "кетчуп", "майонез", "горчица", "томатная паста",
    "специи", "перец черный", "паприка", "корица", "лавровый лист", "ванилин", "разрыхлитель", "сода",
    "дрожжи", "крахмал", "чай", "кофе", "какао", "мед", "варенье", "джем", "шоколад", "конфеты",
    "печенье", "вафли", "пряники", "сухари", "мюсли", "орехи", "грецкие орехи", "арахис", "миндаль",
    "семечки", "изюм", "курага", "чернослив", "тушенка", "оливки", "маслины", "шпроты", "зефир",
    "мармелад", "чипсы", "желатин",
  ],
  "Заморозка": [
    "пельмени", "вареники", "мороженое", "замороженные овощи", "овощная смесь", "блинчики",
    "наггетсы", "лед",
  ],
  "Хлеб": [
    "хлеб", "батон", "багет", "лаваш", "булочки", "булка", "лепешки", "хлебцы", "тортилья",
    "тортильи", "круассаны", "баранки", "сушки", "пита",
  ],
  "Напитки": [
    "вода", "минералка", "минеральная вода", "газировка", "сок", "морс", "компот", "лимонад", "кола",
    "квас", "пиво", "вино", "шампанское", "водка", "коньяк",
  ],
  "Хозтовары": [
    "туалетная бумага", "бумажные полотенца", "салфетки", "влажные салфетки", "мыло", "шампунь",
    "гель для душа", "зубная паста", "зубная щетка", "стиральный порошок", "порошок",
    "средство для посуды", "губки", "мешки для мусора", "пакеты для мусора", "фольга",
    "пищевая пленка", "пергамент", "бумага для выпечки", "отбеливатель", "кондиционер для белья",
    "дезодорант", "прокладки", "подгузники", "ватные диски", "батарейки", "спички",
    "капсулы для стирки", "таблетки для посудомойки",
  ],
};

// --- Индекс -------------------------------------------------------------------

/** Слова позиции без количества, в нижнем регистре, ё→е, только буквы. */
function contentWords(name: string): string[] {
  return splitQuantity(name)
    .label.toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zа-я-]+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length >= 2);
}

function exactKey(words: string[]): string {
  return words.join(" ");
}

// Порядок слов не важен: «масло подсолнечное» = «подсолнечное масло», и
// падеж тоже: «сметаны» = «сметана».
function stemsKey(words: string[]): string {
  return words.map(stem).sort().join(" ");
}

export type DepartmentIndex = {
  exact: Map<string, ShoppingDepartment>;
  stems: Map<string, ShoppingDepartment>;
};

export function buildDepartmentIndex(entries: Iterable<[string, ShoppingDepartment]>): DepartmentIndex {
  const exact = new Map<string, ShoppingDepartment>();
  const stems = new Map<string, ShoppingDepartment>();
  for (const [name, department] of entries) {
    const words = contentWords(name);
    if (words.length === 0) continue;
    exact.set(exactKey(words), department);
    const sk = stemsKey(words);
    if (!stems.has(sk)) stems.set(sk, department);
  }
  return { exact, stems };
}

const BASE_INDEX = buildDepartmentIndex(
  Object.entries(BASE).flatMap(([department, names]) =>
    names.map((name) => [name, department as ShoppingDepartment] as [string, ShoppingDepartment]),
  ),
);

/** Размер базового словаря — для теста и для честного числа в описании PR. */
export const BASE_DICTIONARY_SIZE = Object.values(BASE).reduce((n, names) => n + names.length, 0);

/**
 * Отдел для позиции или null, если уверенно сказать нельзя.
 *
 * Порядок проверок — от точного к грубому, и «выученное» на каждом шаге
 * раньше базового: раскладка, которую уже сделала модель для ЭТОГО человека,
 * знает его продукты лучше общего словаря.
 *   1. точное название («сметана 20%» → «сметана»);
 *   2. все слова по основам в любом порядке («подсолнечное масло»);
 *   3. любая пара слов по основам («перец чёрный молотый» → «перец чёрный»);
 *   4. одно слово по основе, существительные раньше прилагательных
 *      («куриное филе» → «филе»).
 */
export function lookupDepartment(name: string, learned?: DepartmentIndex | null): ShoppingDepartment | null {
  const words = contentWords(name);
  if (words.length === 0) return null;
  const indexes = learned ? [learned, BASE_INDEX] : [BASE_INDEX];

  const exact = exactKey(words);
  for (const index of indexes) {
    const hit = index.exact.get(exact);
    if (hit) return hit;
  }

  const all = stemsKey(words);
  for (const index of indexes) {
    const hit = index.stems.get(all);
    if (hit) return hit;
  }

  if (words.length > 2) {
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j < words.length; j++) {
        const hit = BASE_INDEX.stems.get(stemsKey([words[i], words[j]]));
        if (hit) return hit;
      }
    }
  }

  if (words.length > 1) {
    const ordered = [...words.filter((w) => !looksLikeAdjective(w)), ...words.filter((w) => looksLikeAdjective(w))];
    for (const word of ordered) {
      const hit = BASE_INDEX.stems.get(stem(word));
      if (hit) return hit;
    }
  }

  return null;
}

// --- Раскладка ----------------------------------------------------------------

/** Позиции, которых нет ни в одном отделе раскладки (без дублей). */
export function uncoveredNames(groups: ShoppingGroup[], names: string[]): string[] {
  const covered = new Set<string>();
  for (const group of groups) {
    for (const item of group.items) if (typeof item === "string") covered.add(nameKey(item));
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const key = nameKey(name);
    if (!key || covered.has(key) || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

/**
 * Кладёт позиции в их отделы, НЕ трогая порядок остальных: новая позиция встаёт
 * в конец своего отдела, уже разложенные остаются где были. Позиция, которая
 * уже лежала в другом отделе (временно в «Прочее»), переезжает.
 *
 * keepNames — текущий набор позиций: всё, чего в нём нет (удалённое), из
 * раскладки выпадает. Неизвестный отдел и мусор вместо строк отбрасываются —
 * группы с сервера приходят как unknown.
 */
export function placeNames(
  groups: ShoppingGroup[],
  placements: Placement[],
  keepNames?: string[],
): ShoppingGroup[] {
  const keep = keepNames ? new Set(keepNames.map(nameKey)) : null;
  const moving = new Set(placements.map((p) => nameKey(p.name)));
  const seen = new Set<string>();
  const byDept = new Map<ShoppingDepartment, string[]>();

  const push = (department: ShoppingDepartment, name: string) => {
    const key = nameKey(name);
    if (!key || seen.has(key) || (keep && !keep.has(key))) return;
    seen.add(key);
    const bucket = byDept.get(department);
    if (bucket) bucket.push(name);
    else byDept.set(department, [name]);
  };

  for (const group of Array.isArray(groups) ? groups : []) {
    if (!group || !isDepartment(group.department) || !Array.isArray(group.items)) continue;
    for (const item of group.items) {
      if (typeof item !== "string" || moving.has(nameKey(item))) continue;
      push(group.department, item);
    }
  }
  for (const p of placements) {
    push(isDepartment(p.department) ? p.department : OTHER_DEPARTMENT, p.name);
  }

  return SHOPPING_DEPARTMENTS.map((department) => ({ department, items: byDept.get(department) ?? [] })).filter(
    (group) => group.items.length > 0,
  );
}

/** Отдел каждой позиции из готовой раскладки (ключ — nameKey). */
export function departmentsFromGroups(groups: ShoppingGroup[]): Map<string, ShoppingDepartment> {
  const map = new Map<string, ShoppingDepartment>();
  for (const group of Array.isArray(groups) ? groups : []) {
    if (!group || !isDepartment(group.department) || !Array.isArray(group.items)) continue;
    for (const item of group.items) if (typeof item === "string") map.set(nameKey(item), group.department);
  }
  return map;
}

// --- Выученное на устройстве (только клиент) ------------------------------------
//
// Всё, что уже разложила модель на этом телефоне, — в локальный словарь. Второй
// раз «хурма» в «Овощи-фрукты» уезжает без сети.
//
// «Прочее» не запоминаем: это не знание, а отказ модели выбрать — пусть в
// следующий раз попробует снова.

const LEARNED_KEY = "smartcook_shopping_departments_v1";
// Сотни позиций хватает с запасом: столько разных продуктов у одного человека
// не бывает, а хранилище общее со списками.
const MAX_LEARNED = 400;

function readLearned(): Array<[string, ShoppingDepartment]> {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LEARNED_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is [string, ShoppingDepartment] =>
        Array.isArray(row) && typeof row[0] === "string" && row[0].length <= 100 && isDepartment(row[1]),
    );
  } catch {
    return [];
  }
}

export function loadLearnedIndex(): DepartmentIndex {
  return buildDepartmentIndex(readLearned());
}

/** Запоминает отделы из раскладки. true — словарь изменился. */
export function learnDepartments(groups: ShoppingGroup[]): boolean {
  if (typeof window === "undefined") return false;
  const current = new Map(readLearned());
  let changed = false;
  for (const [key, department] of departmentsFromGroups(groups)) {
    if (department === OTHER_DEPARTMENT) continue;
    const label = splitQuantity(key).label;
    if (current.get(label) === department) continue;
    // Удаляем и ставим заново — свежие записи в конце, при переполнении
    // вытесняются самые старые.
    current.delete(label);
    current.set(label, department);
    changed = true;
  }
  if (!changed) return false;
  try {
    localStorage.setItem(LEARNED_KEY, JSON.stringify([...current].slice(-MAX_LEARNED)));
  } catch {
    // Переполнено / приватный режим — словарь просто не запомнится.
  }
  return true;
}
