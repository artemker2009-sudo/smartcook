// Разбор ответа модели, распознавшей список покупок по фото
// (/api/shopping/recognize). Вынесено из роута отдельным изоморфным модулем,
// чтобы покрыть тестами без импорта OpenAI-клиента.
//
// Доверия к модели нет: она может вернуть не-JSON, выдумать сотню позиций или
// отдать мусор вместо названий. Поэтому здесь и обрезка, и прогон через тот же
// parseNames, что и при вставке текста руками, — дальше по приложению фото
// ничем не отличается от вставленного списка.

import { MAX_SHOPPING_ITEMS, parseNames } from "./shoppingList";

// Сколько строк ответа вообще рассматриваем до разбора. Защита от «модель
// вернула роман»: сам список всё равно упрётся в MAX_SHOPPING_ITEMS.
const MAX_RAW_LINES = 200;

export type RecognizeResult = { noList: true; items: [] } | { noList: false; items: string[] };

const NO_LIST: RecognizeResult = { noList: true, items: [] };

function extractLines(parsed: unknown): string[] {
  if (!parsed || typeof parsed !== "object") return [];
  const items = (parsed as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_RAW_LINES).filter((x): x is string => typeof x === "string");
}

/**
 * Превращает сырой ответ модели в позиции списка.
 *
 * Возвращает noList в трёх случаях: модель сама сказала «списка нет», ответ не
 * разобрался, или после разбора не осталось ни одной позиции. Пустых чипов
 * пользователю не показываем — вместо них честное «Не нашёл список на фото».
 */
export function parseRecognizedList(content: unknown): RecognizeResult {
  if (typeof content !== "string" || !content.trim()) return NO_LIST;

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return NO_LIST;
  }

  if ((parsed as { no_list?: unknown })?.no_list === true) return NO_LIST;

  const lines = extractLines(parsed);
  if (lines.length === 0) return NO_LIST;

  // Тот же разбор, что и у вставленного текста: словарь продуктов, количества,
  // маркеры списка, санитизация и лимит длины позиции.
  const items = parseNames(lines.join("\n")).slice(0, MAX_SHOPPING_ITEMS);
  if (items.length === 0) return NO_LIST;

  return { noList: false, items };
}
