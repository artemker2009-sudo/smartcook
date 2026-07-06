// Общие лимиты на длину пользовательского текста, который уходит в промпт OpenAI.
// Нужны, чтобы никто не мог раздуть расходы на токены одним огромным запросом.
export const MAX_TEXT_LENGTH = 500;
export const MAX_LIST_ITEMS = 30;
export const MAX_LIST_ITEM_LENGTH = 100;

// Более длинные, но всё еще ограниченные поля (описание банкета, пожелания и т.п.).
export const MAX_LONG_TEXT_LENGTH = 1000;

export function isTextTooLong(value: unknown, maxLength = MAX_TEXT_LENGTH): boolean {
  return typeof value === "string" && value.length > maxLength;
}

export function isStringListTooLong(
  value: unknown,
  maxItems = MAX_LIST_ITEMS,
  maxItemLength = MAX_LIST_ITEM_LENGTH,
): boolean {
  if (!Array.isArray(value)) return false;
  if (value.length > maxItems) return true;
  return value.some((item) => typeof item === "string" && item.length > maxItemLength);
}
