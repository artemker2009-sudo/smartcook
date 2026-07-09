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

// Приводит список продуктов к массиву ОТДЕЛЬНЫХ позиций. Баг AB: генерация
// иногда возвращала весь список покупок одной строкой ("свекла, картофель, …")
// или массивом из одного такого блоба — и «Нужно купить» рисовался одним
// гигантским чипом. Здесь раскладываем: строку/элементы бьём по запятой,
// точке-с-запятой, переносу строки и маркеру списка. Чистая функция без DOM —
// используется и на сервере (санитизация перед записью), и на клиенте (фолбэк
// для старых записей). Экспортируется для рендера чипов.
export function splitIngredientList(value: unknown): string[] {
  const entries: string[] = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : typeof value === "string"
      ? [value]
      : [];
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t) out.push(t);
  };
  for (const entry of entries) {
    // Делим по запятой/;/переносу/маркеру ТОЛЬКО на верхнем уровне скобок:
    // запятая внутри «(1 шт., 80 г)» — часть названия, её не трогаем, иначе
    // порезали бы корректные позиции детального списка на битые чипы.
    let buf = "";
    let depth = 0;
    for (const ch of entry) {
      if (ch === "(" || ch === "[") depth++;
      else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
      if ((ch === "," || ch === ";" || ch === "\n" || ch === "•") && depth === 0) {
        push(buf);
        buf = "";
      } else {
        buf += ch;
      }
    }
    push(buf);
  }
  return out;
}

function sanitizeIngredientList(value: unknown, maxItems: number, maxItemLength: number): string[] {
  return splitIngredientList(value)
    .slice(0, maxItems)
    .map((item) => sanitizeText(item, maxItemLength))
    .filter((item) => item.length > 0);
}

// cooking_time_minutes: целое число минут. Модель может не вернуть поле, вернуть
// строку ("35 мин"), 0 или мусор — во всех этих случаях храним null, чтобы UI
// не рисовал «0 мин». Верхний предел — защита от абсурдных значений.
const MAX_COOKING_TIME_MINUTES = 60 * 24 * 3; // 3 суток — заведомо больше любого рецепта
function sanitizeCookingTime(value: unknown): number | null {
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[^\d.,]/g, "").replace(",", "."))
        : NaN;
  if (!Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  if (rounded <= 0 || rounded > MAX_COOKING_TIME_MINUTES) return null;
  return rounded;
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
  cooking_time_minutes: number | null;
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
    cooking_time_minutes: sanitizeCookingTime(recipe?.cooking_time_minutes),
    calories: sanitizeText(recipe?.calories, MAX_SHORT_FIELD_LENGTH),
    steps: sanitizeStringList(recipe?.steps, MAX_LIST_ITEMS, MAX_LIST_ITEM_LENGTH),
    // missing_ingredients — через сплит-нормализацию (AB): если модель склеила
    // список в одну строку, раскладываем на отдельные позиции перед записью.
    missing_ingredients: sanitizeIngredientList(recipe?.missing_ingredients, MAX_LIST_ITEMS, MAX_LIST_ITEM_LENGTH),
    detailed_ingredients,
    ingredients: detailed_ingredients.map((i) => `${i.name} - ${i.amount}`),
  };
}
