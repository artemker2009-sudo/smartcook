// Протокол стрима объединённого фото-вызова (/api/photo-recipe). Модуль
// НАМЕРЕННО без единого импорта: его тянут и серверный роут, и клиентский
// SearchApp — любая клиентская зависимость здесь сломала бы сборку роута.
//
// Тело ответа: <текст JSON модели>\0<служебный JSON>. Байт \0 не встречается в
// валидном JSON (управляющие символы там всегда экранированы), поэтому граница
// однозначна и искать её можно в любом месте потока.

export const STREAM_META_SEPARATOR = "\u0000";

export interface StreamMeta {
  // id рецепта в таблице recipes (нужен для «поделиться» и избранного).
  recipeId: number | null;
  // Ошибка, случившаяся уже ПОСЛЕ отправки заголовков: статус ответа в этот
  // момент поменять нельзя, поэтому она приезжает здесь.
  error: string | null;
}

// Этапы ожидания, которые видит человек. Порядок = порядок ключей в схеме
// ответа модели, см. RESPONSE_SCHEMA в app/api/photo-recipe/route.ts.
export type PhotoStage = "look" | "dishes" | "recipe";

export const PHOTO_STAGE_LABELS: Record<PhotoStage, string> = {
  look: "Смотрю, что есть…",
  dishes: "Подбираю три ужина…",
  recipe: "Пишу рецепт…",
};

/**
 * Текущий этап по уже накопленному куску ответа модели. Именно «по факту
 * текста», а не по таймеру: если модель задумалась на списке продуктов, человек
 * и должен видеть «Смотрю, что есть…», а не бодрое враньё про рецепт.
 *
 * Ищем ключи в порядке от позднего к раннему: как только в потоке появился
 * `"recipe"`, мы точно прошли и продукты, и блюда.
 */
export function stageFromStream(accumulated: string): PhotoStage {
  if (accumulated.includes('"recipe"')) return "recipe";
  if (accumulated.includes('"dishes"')) return "dishes";
  return "look";
}

/**
 * Делит тело ответа на JSON модели и служебный хвост. Хвоста может не быть
 * (соединение оборвали на середине) — тогда meta = null, и вызывающий сам
 * решает, что показать.
 */
export function splitStreamPayload(body: string): { modelText: string; meta: StreamMeta | null } {
  const at = body.indexOf(STREAM_META_SEPARATOR);
  if (at === -1) return { modelText: body, meta: null };

  const modelText = body.slice(0, at);
  const tail = body.slice(at + STREAM_META_SEPARATOR.length);
  try {
    const parsed = JSON.parse(tail);
    return {
      modelText,
      meta: {
        recipeId: typeof parsed?.recipeId === "number" ? parsed.recipeId : null,
        error: typeof parsed?.error === "string" ? parsed.error : null,
      },
    };
  } catch {
    return { modelText, meta: null };
  }
}
