import { NextResponse } from "next/server";

// Домены, с которых разрешено дергать эндпоинты генерации.
// Прямые запросы curl/Postman/скриптов без Origin/Referer нашего сайта отсекаются.
const ALLOWED_HOSTS = new Set(["smart-cook.pro", "www.smart-cook.pro"]);

function extractHost(headerValue: string | null): string | null {
  if (!headerValue) return null;
  try {
    return new URL(headerValue).host;
  } catch {
    return null;
  }
}

/**
 * Хост разрешён? Кроме боевых доменов пускаем СОБСТВЕННЫЙ хост preview-деплоя
 * Vercel: превью собирается с NODE_ENV=production, поэтому приёмка PR по
 * preview-ссылке упиралась в «недопустимый источник» на всех AI-роутах.
 *
 * Послабление узкое: только когда VERCEL_ENV=preview И хост совпадает с
 * адресом самого этого деплоя (VERCEL_URL — уникальный адрес деплоя,
 * VERCEL_BRANCH_URL — постоянный адрес ветки). Чужой сайт на *.vercel.app сюда
 * не попадает, а в проде (VERCEL_ENV=production) поведение не меняется вообще.
 */
function isAllowedHost(host: string, req: Request): boolean {
  if (ALLOWED_HOSTS.has(host)) return true;

  // Дальше — только адреса деплоев Vercel. Боевые домены сюда не попадают.
  if (!host.endsWith(".vercel.app")) return false;
  // На БОЕВОМ деплое адрес вида *.vercel.app не разрешаем: туда ходят через
  // smart-cook.pro, он уже проверен выше.
  if (process.env.VERCEL_ENV === "production") return false;

  // Собственный адрес этого preview-деплоя: уникальный, адрес ветки, либо —
  // если системные переменные Vercel в проекте не отдаются в рантайм — просто
  // совпадение с хостом, на который пришёл запрос (то есть страница с этого же
  // деплоя, а не чужой сайт).
  return (
    host === process.env.VERCEL_URL ||
    host === process.env.VERCEL_BRANCH_URL ||
    host === req.headers.get("host")
  );
}

export function isTrustedOrigin(req: Request): boolean {
  // В деве не блокируем — иначе локальная разработка сломается.
  if (process.env.NODE_ENV !== "production") return true;

  const originHost = extractHost(req.headers.get("origin"));
  if (originHost) return isAllowedHost(originHost, req);

  const refererHost = extractHost(req.headers.get("referer"));
  if (refererHost) return isAllowedHost(refererHost, req);

  // Ни Origin, ни Referer не пришли — так ведут себя скрипты/curl, а не браузер
  // с нашей страницы (браузер всегда шлет Origin на POST-запросы).
  return false;
}

/**
 * Вариант гарда для ПУБЛИЧНЫХ GET-эндпоинтов (напр. /api/daily).
 *
 * Отличие от isTrustedOrigin ровно одно — что делать, когда нет ни Origin, ни
 * Referer. У POST-роутов это верный признак скрипта: браузер на POST шлёт
 * Origin всегда. У GET всё наоборот — на SAME-ORIGIN GET браузер Origin НЕ
 * шлёт вовсе, а Referer могут срезать расширения приватности или
 * Referrer-Policy: no-referrer. Применить к GET строгую версию — значит
 * выключить рецепт дня на Главной у части живых людей.
 *
 * Поэтому: чужой источник отсекаем (cross-origin fetch из браузера Origin
 * присылает всегда), а «заголовков нет» трактуем как обычный браузерный
 * запрос со своей же страницы. Остаток — голый curl без заголовков — упирается
 * в rate-limit, и стоит он ноль: ответ отдаётся из суточного кэша.
 */
export function isTrustedOriginForRead(req: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;

  const originHost = extractHost(req.headers.get("origin"));
  if (originHost) return isAllowedHost(originHost, req);

  const refererHost = extractHost(req.headers.get("referer"));
  if (refererHost) return isAllowedHost(refererHost, req);

  return true;
}

export function originBlockedResponse() {
  return NextResponse.json(
    { error: "Запрос отклонен: недопустимый источник" },
    { status: 403 },
  );
}
