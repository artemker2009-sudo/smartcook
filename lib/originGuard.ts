import { NextResponse } from "next/server";
import { SITE_HOSTS, SITE_URL } from "./site";

// Домены, с которых разрешено дергать эндпоинты генерации: основной
// smartcook.pro и старый smart-cook.pro (оба с www), см. lib/site.ts.
// Прямые запросы curl/Postman/скриптов без Origin/Referer нашего сайта отсекаются.
const ALLOWED_HOSTS = SITE_HOSTS;

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
  // боевые домены, они уже проверены выше.
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

/**
 * СТРОГАЯ проверка: запрос пришёл с БОЕВОГО домена?
 *
 * Отличие от isTrustedOrigin — послабления для превью здесь нет вовсе. Нужна
 * там, где запись попадает в статистику: заходы с *.vercel.app и с localhost
 * не должны смешиваться с настоящими. Иначе каждая приёмка PR и каждый запуск
 * на ноутбуке добавляют в отчёт по платформам «сайт», а доля приложений
 * занижается ровно на объём нашей же работы.
 *
 * Приложения проходят: и iOS-оболочка (Capacitor грузит сайт по server.url с
 * боевого домена), и Android-TWA (это Chrome на боевом домене) шлют Origin
 * настоящего домена — они здесь неотличимы от сайта и должны быть.
 *
 * В деве возвращает false ОСОЗНАННО, в отличие от isTrustedOrigin: локальный
 * запуск не должен попадать в боевую статистику (а база у нас одна, см.
 * «Локальное превью пишет в прод-БД»).
 */
export function isProductionOrigin(req: Request): boolean {
  const host =
    extractHost(req.headers.get("origin")) ?? extractHost(req.headers.get("referer"));
  return !!host && ALLOWED_HOSTS.has(host);
}

/**
 * Origin, на который безопасно ВЕРНУТЬ человека после ухода на внешний сервис
 * (сейчас — после оплаты в Robokassa). Тот же список хостов, что у
 * isTrustedOrigin, но здесь нужен не ответ «да/нет», а готовый адрес.
 *
 * Зачем вообще: Success/Fail URL в настройках Robokassa — один, на smartcook.pro.
 * А приложения (iOS-оболочка, Android-TWA) и часть людей живут на старом
 * smart-cook.pro — это ДРУГОЙ origin, и Web Storage с сессией у него свой.
 * Человек платил залогиненным, а возвращался на домен, где он гость, и видел
 * «Создайте аккаунт» вместо своего Премиума. Поэтому адрес возврата
 * передаётся в саму ссылку оплаты (SuccessUrl2/FailUrl2) — тем доменом, с
 * которого нажали «Оплатить».
 *
 * Чужой или отсутствующий Origin → канонический SITE_URL. Это не просто
 * запасной вариант: сюда приходит АДРЕС ВОЗВРАТА, то есть страница, на которую
 * Robokassa уведёт человека из своего интерфейса. Принять его с произвольного
 * хоста — значит согласиться уводить людей куда попало из платёжной формы.
 * Отсюда же берётся схема: не додумываем https, а используем ту, что в Origin.
 */
export function returnOrigin(req: Request): string {
  for (const header of ["origin", "referer"] as const) {
    const raw = req.headers.get(header);
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (isAllowedHost(url.host, req)) return url.origin;
    } catch {
      // Мусор в заголовке — просто пробуем следующий.
    }
  }
  return SITE_URL;
}

export function originBlockedResponse() {
  return NextResponse.json(
    { error: "Запрос отклонен: недопустимый источник" },
    { status: 403 },
  );
}
