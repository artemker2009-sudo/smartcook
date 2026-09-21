// Картинки блюд — через НАШ домен: /img/… вместо *.supabase.co.
//
// ЗАЧЕМ. Файлы бакета отдаёт Cloudflare, а мобильные операторы РФ режут его
// диапазоны — ровно поэтому сайт идёт через RU-прокси. Картинки же ходили в
// обход прокси, напрямую. Замер с российских узлов check-host.net 21.09.2026:
// московский узел — 4 таймаута по 25 секунд из 4 попыток на адреса
// Cloudflare, при этом наш домен с того же узла открывался за 0,6 с. Отсюда
// «картинки появляются через 15–20 секунд» на телефоне.
//
// КАК. В базе адреса НЕ меняются. Здесь они переписываются при показе, а
// rewrite в next.config.ts отдаёт /img/<путь> из ОДНОГО бакета recipe-images.
// Шаблон пути ниже — единственный источник правды и для этой функции, и для
// rewrite: функция никогда не выдаст адрес, который rewrite не обслужит.
//
// ЧИСТЫЙ модуль: его импортируют и next.config.ts, и компоненты, и тесты.

/** Префикс наших адресов картинок. */
export const IMG_PREFIX = "/img/";

/** Путь внутри бакета в адресе Supabase. Бакет — ровно один. */
export const BUCKET_PATH = "/storage/v1/object/public/recipe-images/";

/**
 * Путь файла внутри бакета, в синтаксисе path-to-regexp (без якорей).
 *
 * Строго: сегменты из [a-z0-9_-], начинаются с буквы или цифры, расширение
 * картинки. Ни точек внутри (значит, никаких «..»), ни двойных слэшей, ни
 * заглавных, ни процентного кодирования. Все 105 реальных файлов бакета под
 * шаблон подходят (проверено по базе).
 */
export const IMG_PATH_PATTERN =
  "[a-z0-9][a-z0-9_\\-]*(?:/[a-z0-9][a-z0-9_\\-]*)*\\.(?:webp|png|jpe?g)";

/**
 * Файлы, чьё содержимое НЕ МЕНЯЕТСЯ: метка времени (13 цифр) в самом имени —
 * так называются картинки «Идей». Только им можно immutable на год.
 *
 * Остальные — dish-cache/2.webp, 1543.webp — ПЕРЕЗАПИСЫВАЮТСЯ НА МЕСТЕ
 * (upload с upsert: true), а новую версию отличает только ?v=. Хуже того, в
 * базе встречаются старые ?v= на уже перезаписанный файл: dish-cache/2.webp в
 * recipes и в dish_cache записан с разными v. Навесить на такие адреса
 * immutable на год значит год показывать вернувшемуся человеку старую
 * картинку — в том числе ту, что перегенерировали из-за ошибки.
 */
export const IMMUTABLE_PATH_PATTERN =
  "(?:[a-z0-9][a-z0-9_\\-]*/)*[a-z0-9][a-z0-9_\\-]*-\\d{13}\\.(?:webp|png|jpe?g)";

const PATH_RE = new RegExp(`^${IMG_PATH_PATTERN}$`);
const VERSION_RE = /^\d{1,16}$/;

function supabaseHost(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yjfqwwiqwoighjdlkodg.supabase.co";
  try {
    return new URL(raw).hostname;
  } catch {
    return "";
  }
}

/**
 * Адрес картинки бакета recipe-images → «/img/<путь>[?v=…]». Для всего
 * остального — null: чужой хост, другой бакет (витрина лежит в feed_photos),
 * путь не по шаблону, blob:/data: превью.
 *
 * Из query переносится ТОЛЬКО v, и только цифрами: это версия
 * перезаписанного файла, без неё браузер показал бы из кэша старую картинку.
 */
export function ownImagePath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== supabaseHost()) return null;
  if (!url.pathname.startsWith(BUCKET_PATH)) return null;
  const path = url.pathname.slice(BUCKET_PATH.length);
  if (!PATH_RE.test(path)) return null;
  const version = url.searchParams.get("v");
  return `${IMG_PREFIX}${path}${version && VERSION_RE.test(version) ? `?v=${version}` : ""}`;
}

/** Для <img src>: наш адрес, если можно, иначе исходный. */
export function displayImageUrl(raw: string | null | undefined): string {
  return ownImagePath(raw) ?? raw ?? "";
}

/**
 * Для og:image и JSON-LD — абсолютный адрес ЧЕРЕЗ НАШ ДОМЕН, чтобы превью
 * ссылки в мессенджере тоже грузилось из России. siteOrigin передаётся
 * снаружи (SITE_URL из lib/site.ts), чтобы модуль оставался без зависимостей.
 */
export function absoluteImageUrl(raw: string | null | undefined, siteOrigin: string): string {
  const own = ownImagePath(raw);
  if (!own) return raw ?? "";
  return `${siteOrigin.replace(/\/+$/, "")}${own}`;
}
