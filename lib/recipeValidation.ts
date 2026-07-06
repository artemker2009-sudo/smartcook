// Санитизация полей рецепта перед записью в БД. Источник данных — ответ
// OpenAI (не буквально "пользовательский ввод"), но мы всё равно не
// доверяем его форме: обрезаем длину и убираем управляющие символы, чтобы
// в историю/ленту не могли попасть гигантские или "битые" значения.
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_SHORT_FIELD_LENGTH = 50; // time, calories
const MAX_LIST_ITEMS = 60;
const MAX_LIST_ITEM_LENGTH = 300;

const ALLOWED_CONTROL_CODES = new Set([9, 10, 13]); // tab, \n, \r

function stripControlChars(value: string): string {
  let result = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    const isControlCode = code <= 31 || code === 127;
    if (!isControlCode || ALLOWED_CONTROL_CODES.has(code)) {
      result += value[i];
    }
  }
  return result;
}

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return stripControlChars(value).trim().slice(0, maxLength);
}

function sanitizeStringList(value: unknown, maxItems: number, maxItemLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxItems)
    .map((item) => sanitizeText(item, maxItemLength))
    .filter((item) => item.length > 0);
}

function sanitizeDetailedIngredients(value: unknown): { name: string; amount: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_LIST_ITEMS)
    .map((item) => ({
      name: sanitizeText(item?.name, MAX_LIST_ITEM_LENGTH),
      amount: sanitizeText(item?.amount, MAX_LIST_ITEM_LENGTH),
    }))
    .filter((item) => item.name.length > 0);
}

export interface SanitizedRecipeFields {
  title: string;
  description: string;
  time: string;
  calories: string;
  steps: string[];
  missing_ingredients: string[];
  detailed_ingredients: { name: string; amount: string }[];
  ingredients: string[];
}

// Возвращает null, если после санитизации у рецепта не осталось названия —
// такую запись сохранять в историю бессмысленно (и небезопасно).
export function sanitizeRecipeForStorage(recipe: any): SanitizedRecipeFields | null {
  const title = sanitizeText(recipe?.title, MAX_TITLE_LENGTH);
  if (!title) return null;

  const detailed_ingredients = sanitizeDetailedIngredients(recipe?.detailed_ingredients);

  return {
    title,
    description: sanitizeText(recipe?.description, MAX_DESCRIPTION_LENGTH),
    time: sanitizeText(recipe?.time, MAX_SHORT_FIELD_LENGTH),
    calories: sanitizeText(recipe?.calories, MAX_SHORT_FIELD_LENGTH),
    steps: sanitizeStringList(recipe?.steps, MAX_LIST_ITEMS, MAX_LIST_ITEM_LENGTH),
    missing_ingredients: sanitizeStringList(recipe?.missing_ingredients, MAX_LIST_ITEMS, MAX_LIST_ITEM_LENGTH),
    detailed_ingredients,
    ingredients: detailed_ingredients.map((i) => `${i.name} - ${i.amount}`),
  };
}
