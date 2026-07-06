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

export function isTrustedOrigin(req: Request): boolean {
  // В деве/превью не блокируем — иначе локальная разработка сломается.
  if (process.env.NODE_ENV !== "production") return true;

  const originHost = extractHost(req.headers.get("origin"));
  if (originHost) return ALLOWED_HOSTS.has(originHost);

  const refererHost = extractHost(req.headers.get("referer"));
  if (refererHost) return ALLOWED_HOSTS.has(refererHost);

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
