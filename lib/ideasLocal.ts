// Локальная память раздела «Идеи»: избранное и отметки «есть дома».
//
// Оба хранилища — СВОИ сущности, а не поля рецептов. Избранное каталога
// намеренно не трогает recipes.is_favorite: та таблица про рецепты, которые
// человек получил от модели по своим продуктам, у неё другой владелец
// (session_id) и другая судьба. Смешивать их значит однажды показать в
// избранном каталога чужой сгенерированный рецепт.
//
// Ключи с версией в имени: схема здесь наверняка ещё поменяется, а молча
// прочитанный старый формат — это сломанный экран у человека, который ничего
// не делал.
//
// ЧИСТЫЕ функции отделены от доступа к localStorage: тестируется логика
// (вытеснение, переключение), а не браузерное хранилище.
//
// Чтение и запись ИЗБРАННОГО живут в lib/ideasFavorites.ts — с подпиской на
// изменения. Здесь остались ключ и чистое переключение.

import { browserStorage, reportStorageFailure, verifiedWrite } from "./storageWrite";

export const FAV_KEY = "sc_ideas_fav_v1";
export const HAVE_KEY = "sc_ideas_have_v1";

/** Потолок избранного. Больше — вытесняем самое старое. */
export const MAX_FAVORITES = 300;
/**
 * Для скольких рецептов помним галочки «есть дома». Словарь растёт молча и
 * навсегда, а localStorage не резиновый: 5 МБ на домен, и делим мы их со
 * списками покупок.
 */
export const MAX_HAVE_RECIPES = 200;

export type HaveMap = Record<string, string[]>;

/** Добавить или убрать slug. Новый уходит в КОНЕЦ — вытесняем с начала. */
export function toggleInList(list: string[], slug: string, max = MAX_FAVORITES): string[] {
  const without = list.filter((item) => item !== slug);
  if (without.length === list.length) {
    const next = [...without, slug];
    return next.length > max ? next.slice(next.length - max) : next;
  }
  return without;
}

/**
 * Запомнить отметки «есть дома» для рецепта.
 *
 * Храним ИМЕНА, а не индексы: редактор может поменять порядок ингредиентов
 * или добавить новый, и индексы тогда зачеркнут не то. Пустой набор отметок
 * не храним вовсе — это то же самое, что ничего не отмечено.
 */
export function putHave(
  map: HaveMap,
  slug: string,
  names: string[],
  max = MAX_HAVE_RECIPES,
): HaveMap {
  const next: HaveMap = {};
  // Пересобираем в порядке вставки, без текущего рецепта: так он окажется
  // последним и вытеснится последним.
  for (const key of Object.keys(map)) {
    if (key !== slug) next[key] = map[key];
  }
  if (names.length > 0) next[slug] = names;

  const keys = Object.keys(next);
  if (keys.length <= max) return next;
  const trimmed: HaveMap = {};
  for (const key of keys.slice(keys.length - max)) trimmed[key] = next[key];
  return trimmed;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = browserStorage()?.getItem(key) ?? null;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    // Приватный режим, переполненное или битое хранилище — просто не помним.
    return fallback;
  }
}

export function readHave(): HaveMap {
  const map = readJson<HaveMap>(HAVE_KEY, {});
  return map && typeof map === "object" && !Array.isArray(map) ? map : {};
}

/**
 * Запомнить отметки «есть дома». Сбой записи НЕ глотается молча: он уходит в
 * error_reports. Человеку при этом ничего не показываем — галочка на экране
 * уже стоит, пропадёт она только при следующем заходе, и тост на каждое
 * нажатие был бы хуже самой потери.
 */
export function writeHave(map: HaveMap): void {
  const value = JSON.stringify(map);
  const result = verifiedWrite(browserStorage(), HAVE_KEY, value);
  if (!result.ok) reportStorageFailure(HAVE_KEY, result.reason, value.length);
}
