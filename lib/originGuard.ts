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
function isAllowedHost(host: string): boolean {
  if (ALLOWED_HOSTS.has(host)) return true;
  if (process.env.VERCEL_ENV !== "preview") return false;
  return host === process.env.VERCEL_URL || host === process.env.VERCEL_BRANCH_URL;
}

export function isTrustedOrigin(req: Request): boolean {
  // В деве не блокируем — иначе локальная разработка сломается.
  if (process.env.NODE_ENV !== "production") return true;

  const originHost = extractHost(req.headers.get("origin"));
  if (originHost) return isAllowedHost(originHost);

  const refererHost = extractHost(req.headers.get("referer"));
  if (refererHost) return isAllowedHost(refererHost);

  // Ни Origin, ни Referer не пришли — так ведут себя скрипты/curl, а не браузер
  // с нашей страницы (браузер всегда шлет Origin на POST-запросы).
  return false;
}

export function originBlockedResponse() {
  return NextResponse.json(
    { error: "Запрос отклонен: недопустимый источник" },
    { status: 403 },
  );
}
