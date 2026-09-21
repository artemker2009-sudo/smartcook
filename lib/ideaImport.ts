// Разбор и проверка файла импорта каталога «Идеи».
//
// ЧИСТАЯ функция: ни сети, ни Supabase, ни localStorage. Так поведение под
// красной линией задачи («директор залил 80 рецептов — ни один не пропал молча
// и ни один не перезаписал готовый») проверяется тестами, а не прокликиванием
// админки с реальным файлом.
//
// Формат описан в docs/ideas-import-format.md — документ и этот файл обязаны
// расходиться только через правку обоих.
//
// Три правила, из которых выведено всё остальное:
//   1. Импорт НИЧЕГО не публикует. is_published здесь не выставляется вовсе —
//      его ставит база своим default false, а роут не даёт его переопределить.
//   2. Импорт НИЧЕГО не перезаписывает. Существующий slug → пропуск с
//      причиной. Молча затереть вычитанный (а то и опубликованный) текст
//      случайно повторно залитым файлом — это потеря чужой работы.
//   3. Ошибка в одном рецепте не роняет файл. Иначе в файле на 80 рецептов
//      одну забытую запятую пришлось бы искать вслепую.

import {
  IDEA_ALLERGENS,
  IDEA_COOK_METHODS,
  IDEA_IMAGE_ASPECTS,
  IDEA_LIMITS,
  IDEA_MAIN_PRODUCTS,
  IDEA_MEALS,
  IDEA_SLUG_RE,
  type IdeaIngredient,
} from "./ideaRecipes";

/** Сколько рецептов принимаем за один импорт. */
export const MAX_IMPORT_RECIPES = 100;
/** Потолок размера файла. Считается в БАЙТАХ, не в символах — кириллица в UTF-8 двухбайтовая. */
export const MAX_IMPORT_BYTES = 1024 * 1024;

/** Строка, готовая к вставке. Поля, которыми распоряжается сервер, сюда не попадают. */
export type IdeaImportRow = {
  slug: string;
  title: string;
  description: string;
  servings: number;
  cooking_time_minutes: number;
  ingredients: IdeaIngredient[];
  steps: string[];
  meals: string[];
  main_product: string;
  cook_method: string | null;
  family: string | null;
  tags: string[];
  allergens: string[];
  image_aspect: string;
  sort_weight: number;
};

export type ImportSkip = { slug: string; reason: string };

export type ImportParseResult = {
  rows: IdeaImportRow[];
  skipped: ImportSkip[];
  warnings: string[];
  /** Файл негоден целиком (не массив, пустой, слишком большой). rows при этом пуст. */
  fatal?: string;
};

// Поля, которыми распоряжается СЕРВЕР. Если приехали в файле — молча
// игнорируем: выгрузка из другого места могла притащить их без злого умысла,
// и ругаться тут не на что. А вот принимать их нельзя ни в коем случае:
// is_published из файла означал бы публикацию в обход вычитки.
// thumb_url — тоже сервер: миниатюру делает генерация картинки или скрипт
// досоздания (lib/ideaThumb.ts), импорт её не задаёт.
const SERVER_OWNED = new Set([
  "id", "image_url", "thumb_url", "image_status", "is_published", "published_at",
  "created_at", "updated_at",
]);

const KNOWN_FIELDS = new Set([
  "slug", "title", "description", "servings", "cooking_time_minutes",
  "ingredients", "steps", "meals", "main_product", "cook_method",
  "family", "tags", "allergens", "image_aspect", "sort_weight",
]);

/**
 * Чистка текста: управляющие символы и схлопывание пробелов.
 *
 * НЕ РЕЖЕТ по длине — это принципиально. Для пользовательского ввода обрезка
 * правильна (человек увидит результат сразу), а здесь текст вычитан редактором,
 * и молча укоротить его хуже, чем сказать «длиннее 400 символов, исправьте».
 * Длину проверяет вызывающий и отдаёт внятную причину.
 */
function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

/** Ошибка проверки поля. Текст уходит прямо в отчёт, поэтому пишется для человека. */
class FieldError extends Error {}

function fail(message: string): never {
  throw new FieldError(message);
}

function requiredText(raw: unknown, field: string, max: number): string {
  if (typeof raw !== "string") fail(`${field}: ожидается строка`);
  const value = cleanText(raw);
  if (!value) fail(`${field}: пусто`);
  if (value.length > max) fail(`${field}: ${value.length} символов, максимум ${max}`);
  return value;
}

function requiredInt(raw: unknown, field: string, min: number, max: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) fail(`${field}: ожидается число`);
  if (!Number.isInteger(raw)) fail(`${field}: ожидается целое число, пришло ${raw}`);
  if (raw < min || raw > max) fail(`${field}: ${raw}, допустимо от ${min} до ${max}`);
  return raw;
}

/** Значения из закрытого словаря. Повторы запрещены: {обед, обед} — это опечатка. */
function dictArray(
  raw: unknown,
  field: string,
  dict: readonly string[],
  { min, max }: { min: number; max: number },
): string[] {
  if (!Array.isArray(raw)) fail(`${field}: ожидается массив`);
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") fail(`${field}: элементы должны быть строками`);
    const value = cleanText(item).toLowerCase();
    if (!dict.includes(value)) {
      fail(`${field}: значение «${item}» не из словаря (допустимо: ${dict.join(", ")})`);
    }
    if (out.includes(value)) fail(`${field}: значение «${value}» повторяется`);
    out.push(value);
  }
  if (out.length < min) fail(`${field}: нужно хотя бы ${min} значение`);
  if (out.length > max) fail(`${field}: ${out.length} значений, максимум ${max}`);
  return out;
}

function freeTextArray(raw: unknown, field: string, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(raw)) fail(`${field}: ожидается массив`);
  if (raw.length > maxItems) fail(`${field}: ${raw.length} штук, максимум ${maxItems}`);
  const out: string[] = [];
  raw.forEach((item, i) => {
    if (typeof item !== "string") fail(`${field}: элемент ${i + 1} — не строка`);
    const value = cleanText(item);
    if (!value) fail(`${field}: элемент ${i + 1} пустой`);
    if (value.length > maxLen) fail(`${field}: элемент ${i + 1} длиннее ${maxLen} символов`);
    out.push(value);
  });
  return out;
}

/**
 * Ингредиенты. Форма [{name, amount}] — ровно как recipes.detailed_ingredients,
 * чтобы экран рецепта и режим «Готовим!» переиспользовались без переделки.
 *
 * База эту форму НЕ проверяет: CHECK не умеет подзапросов, там стоит только
 * «массив нужного размера». Значит единственная проверка формы — здесь.
 */
function ingredientList(raw: unknown, field: string): IdeaIngredient[] {
  if (!Array.isArray(raw)) fail(`${field}: ожидается массив`);
  if (raw.length === 0) fail(`${field}: пусто`);
  if (raw.length > IDEA_LIMITS.ingredientsMax) {
    fail(`${field}: ${raw.length} штук, максимум ${IDEA_LIMITS.ingredientsMax}`);
  }
  return raw.map((item, i) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      fail(`${field}: элемент ${i + 1} — не объект {name, amount}`);
    }
    const src = item as Record<string, unknown>;
    if (!("name" in src)) fail(`${field}: элемент ${i + 1} без поля name`);
    const name = cleanText(src.name);
    if (!name) fail(`${field}: элемент ${i + 1} с пустым name`);
    if (name.length > IDEA_LIMITS.ingredientNameMax) {
      fail(`${field}: элемент ${i + 1}, name длиннее ${IDEA_LIMITS.ingredientNameMax} символов`);
    }
    // amount обязателен как ПОЛЕ, но пустая строка допустима: «по вкусу»
    // лучше писать словами, однако запрещать пустое значение не за что.
    if (!("amount" in src)) fail(`${field}: элемент ${i + 1} без поля amount`);
    if (typeof src.amount !== "string") fail(`${field}: элемент ${i + 1}, amount — не строка`);
    const amount = cleanText(src.amount);
    if (amount.length > IDEA_LIMITS.ingredientAmountMax) {
      fail(`${field}: элемент ${i + 1}, amount длиннее ${IDEA_LIMITS.ingredientAmountMax} символов`);
    }
    return { name, amount };
  });
}

/**
 * Семейство блюда. Формат тот же, что у slug (латиница, цифры, дефисы) —
 * значение попадёт в адреса и параметры фильтров. Пусто/нет поля → null:
 * у большинства рецептов семейства нет, и это нормальное состояние.
 */
function optionalFamily(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") fail("family: ожидается строка или null");
  const value = cleanText(raw).toLowerCase();
  if (!value) return null;
  if (value.length > IDEA_LIMITS.familyMax) {
    fail(`family: ${value.length} символов, максимум ${IDEA_LIMITS.familyMax}`);
  }
  if (!IDEA_SLUG_RE.test(value)) {
    fail("family: только латиница в нижнем регистре, цифры и дефисы");
  }
  return value;
}

function optionalDictValue(raw: unknown, field: string, dict: readonly string[]): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") fail(`${field}: ожидается строка или null`);
  const value = cleanText(raw).toLowerCase();
  if (!dict.includes(value)) {
    fail(`${field}: значение «${raw}» не из словаря (допустимо: ${dict.join(", ")})`);
  }
  return value;
}

/** Разбор ОДНОГО рецепта. Бросает FieldError с причиной для отчёта. */
function parseOne(src: Record<string, unknown>): IdeaImportRow {
  const slug = requiredText(src.slug, "slug", IDEA_LIMITS.slug).toLowerCase();
  if (!IDEA_SLUG_RE.test(slug)) {
    fail("slug: только латиница в нижнем регистре, цифры и дефисы");
  }

  const mainProductRaw = src.main_product;
  if (typeof mainProductRaw !== "string") fail("main_product: ожидается строка");
  const mainProduct = cleanText(mainProductRaw).toLowerCase();
  if (!IDEA_MAIN_PRODUCTS.includes(mainProduct as (typeof IDEA_MAIN_PRODUCTS)[number])) {
    fail(
      `main_product: значение «${mainProductRaw}» не из словаря ` +
        `(допустимо: ${IDEA_MAIN_PRODUCTS.join(", ")})`,
    );
  }

  const sortWeightRaw = src.sort_weight;
  const sortWeight =
    sortWeightRaw === undefined || sortWeightRaw === null
      ? 0
      : requiredInt(sortWeightRaw, "sort_weight", -10000, 10000);

  return {
    slug,
    title: requiredText(src.title, "title", IDEA_LIMITS.title),
    description: requiredText(src.description, "description", IDEA_LIMITS.description),
    servings: requiredInt(src.servings, "servings", IDEA_LIMITS.servingsMin, IDEA_LIMITS.servingsMax),
    cooking_time_minutes: requiredInt(
      src.cooking_time_minutes,
      "cooking_time_minutes",
      IDEA_LIMITS.timeMin,
      IDEA_LIMITS.timeMax,
    ),
    ingredients: ingredientList(src.ingredients, "ingredients"),
    steps: freeTextArray(src.steps, "steps", IDEA_LIMITS.stepsMax, IDEA_LIMITS.stepMax),
    meals: dictArray(src.meals, "meals", IDEA_MEALS, { min: 1, max: IDEA_MEALS.length }),
    main_product: mainProduct,
    cook_method: optionalDictValue(src.cook_method, "cook_method", IDEA_COOK_METHODS),
    family: optionalFamily(src.family),
    tags:
      src.tags === undefined || src.tags === null
        ? []
        : freeTextArray(src.tags, "tags", IDEA_LIMITS.tagsMax, IDEA_LIMITS.tagMax),
    allergens:
      src.allergens === undefined || src.allergens === null
        ? []
        : dictArray(src.allergens, "allergens", IDEA_ALLERGENS, { min: 0, max: IDEA_ALLERGENS.length }),
    image_aspect:
      optionalDictValue(src.image_aspect, "image_aspect", IDEA_IMAGE_ASPECTS) ?? "square",
    sort_weight: sortWeight,
  };
}

/**
 * Проверка ОДНОГО рецепта с человекочитаемой причиной отказа.
 *
 * Тот же код, что и на импорте, — и это главное: форма правки в админке и
 * загрузка файла не должны расходиться в том, что считают допустимым. Иначе
 * рецепт, прошедший импорт, нельзя сохранить после правки запятой.
 */
export function parseIdeaRecipe(
  src: unknown,
): { ok: true; row: IdeaImportRow } | { ok: false; error: string } {
  if (!src || typeof src !== "object" || Array.isArray(src)) {
    return { ok: false, error: "Ожидается объект рецепта" };
  }
  try {
    return { ok: true, row: parseOne(src as Record<string, unknown>) };
  } catch (error) {
    return { ok: false, error: error instanceof FieldError ? error.message : "Не удалось разобрать рецепт" };
  }
}

/**
 * Разбор всего файла.
 *
 * `raw` — уже распарсенный JSON (сам JSON.parse делает вызывающий: ошибку
 * разбора надо показать человеку отдельно от ошибок проверки).
 */
export function parseIdeasImport(raw: unknown): ImportParseResult {
  if (!Array.isArray(raw)) {
    return { rows: [], skipped: [], warnings: [], fatal: "Ожидается массив рецептов в корне файла" };
  }
  if (raw.length === 0) {
    return { rows: [], skipped: [], warnings: [], fatal: "Файл пустой — ни одного рецепта" };
  }
  if (raw.length > MAX_IMPORT_RECIPES) {
    return {
      rows: [],
      skipped: [],
      warnings: [],
      fatal: `${raw.length} рецептов за раз, максимум ${MAX_IMPORT_RECIPES} — разбейте файл`,
    };
  }

  const rows: IdeaImportRow[] = [];
  const skipped: ImportSkip[] = [];
  const unknownFields = new Set<string>();
  const seen = new Set<string>();

  raw.forEach((item, index) => {
    // Чем назвать рецепт в отчёте, если slug кривой или отсутствует: номером
    // строки. Иначе человек получает «ошибка проверки» без единой зацепки.
    const label =
      item && typeof item === "object" && typeof (item as Record<string, unknown>).slug === "string"
        ? ((item as Record<string, unknown>).slug as string)
        : `рецепт №${index + 1}`;

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      skipped.push({ slug: label, reason: "ошибка проверки: элемент не объект" });
      return;
    }

    const src = item as Record<string, unknown>;
    for (const key of Object.keys(src)) {
      if (!KNOWN_FIELDS.has(key) && !SERVER_OWNED.has(key)) unknownFields.add(key);
    }

    let row: IdeaImportRow;
    try {
      row = parseOne(src);
    } catch (error) {
      const reason = error instanceof FieldError ? error.message : "не удалось разобрать";
      skipped.push({ slug: label, reason: `ошибка проверки: ${reason}` });
      return;
    }

    // Дубль ВНУТРИ файла. Первый выигрывает — иначе непонятно, какой из двух
    // текстов редактор считал итоговым.
    if (seen.has(row.slug)) {
      skipped.push({ slug: row.slug, reason: "дубль в файле" });
      return;
    }
    seen.add(row.slug);
    rows.push(row);
  });

  const warnings = unknownFields.size
    ? [
        `Неизвестные поля в файле (проигнорированы): ${Array.from(unknownFields).sort().join(", ")}. ` +
          "Чаще всего это опечатка в названии нужного поля.",
      ]
    : [];

  return { rows, skipped, warnings };
}
