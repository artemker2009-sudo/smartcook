import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yjfqwwiqwoighjdlkodg.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_E7Fj9ZiOZTyNHAQQKo7Y0A_E8-ExX6Z";

const SUPABASE_HOST = (() => {
  try {
    return new URL(SUPABASE_URL).host;
  } catch {
    return "";
  }
})();

// Канонический хост — apex без www. Живёт в одном месте, чтобы редирект и
// возможные будущие проверки не расходились.
const CANONICAL_HOST = "smart-cook.pro";

// Хосты, на которых сайт «настоящий». Всё остальное (адреса деплоя Vercel,
// localhost, любой будущий алиас) — не наш канонический адрес: такие ответы
// помечаем noindex/nofollow и отдаём на них запрещающий robots.txt.
const CANONICAL_HOSTS = new Set([CANONICAL_HOST, `www.${CANONICAL_HOST}`]);

// Пути, которые НЕЛЬЗЯ уводить редиректом на канонический хост, даже когда
// запрос пришёл на *.vercel.app:
//   /api/            — весь API. Здесь же вебхук Telegram (/api/telegram-webhook):
//                      Telegram шлёт POST и за 30x не ходит, редирект = молчащий
//                      бот. Плюс POST-редирект вообще теряет тело запроса.
//   /.well-known/    — assetlinks.json (TWA) и security.txt обязаны отдаваться
//                      с того хоста, который проверяют.
//   /_vercel/        — маяки Vercel Analytics/Speed Insights.
//   /_next/          — чанки и RSC-пейлоады текущего деплоя.
// Статика (файлы с точкой в имени, /og-image-v2.png в том числе) до proxy не
// доходит вовсе — её отсекает matcher внизу файла.
const NO_REDIRECT_PREFIXES = ["/api/", "/.well-known/", "/_vercel/", "/_next/"];

function hostnameOf(request: NextRequest): string {
  // host приходит с портом (localhost:3000) — для сравнения он лишний.
  return (request.headers.get("host") || "").toLowerCase().split(":")[0];
}

// В dev-режиме Next.js (webpack + React Fast Refresh) исполняет клиентские
// модули через eval — без 'unsafe-eval' строгий CSP блокирует ВЕСЬ клиентский
// бандл, страница не гидрируется и ни одна кнопка не реагирует. В проде бандл
// собран заранее и eval не нужен, поэтому 'unsafe-eval' добавляется ТОЛЬКО в dev
// и никак не ослабляет продакшн-политику.
const IS_DEV = process.env.NODE_ENV !== "production";
const SCRIPT_SRC = [
  "'self'",
  "'unsafe-inline'",
  ...(IS_DEV ? ["'unsafe-eval'"] : []),
  // Яндекс.Метрика: .ru — основной домен (tag.js/webvisor), .com — резервный
  // домен сбора данных для не-RU регионов. Без .com часть визитов (в т.ч. из
  // установленного PWA) не доходит до Метрики, хотя счётчик инициализирован.
  "https://mc.yandex.ru",
  "https://mc.yandex.com",
  "https://va.vercel-scripts.com",
].join(" ");

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src ${SCRIPT_SRC}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data:`,
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST} https://api.openai.com https://mc.yandex.ru https://mc.yandex.com wss://mc.yandex.ru wss://mc.yandex.com https://vitals.vercel-insights.com https://va.vercel-scripts.com`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // upgrade-insecure-requests — ТОЛЬКО в проде. В dev сайт отдаётся по http, и
  // эта директива заставляет браузер поднимать все подзапросы на https://
  // localhost:3000, которого нет: страница приходит вообще без CSS и JS. В
  // обычном браузере это незаметно (он открывает http напрямую), а вот WKWebView
  // нативной оболочки, смотрящий на dev-сервер, получал голый HTML.
  // На проде поведение не меняется ни на байт.
  ...(IS_DEV ? [] : ["upgrade-insecure-requests"]),
].join("; ");

function withSecurityHeaders(response: NextResponse, options?: { noindex?: boolean }) {
  // Любой неканонический хост (адрес деплоя Vercel, localhost) не должен
  // попадать в выдачу: одинаковый контент на двух адресах — это дубль, а
  // превью-деплои вообще не предназначены для людей из поиска.
  if (options?.noindex) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return response;
}

// Статус обслуживания читаем из site_settings. Middleware не пользуется
// data-кэшем RSC, поэтому кэшируем результат в памяти инстанса на короткий TTL —
// это ограничивает обращения к БД до ~одного в MAINTENANCE_TTL_MS, а не на
// каждый запрос. Обслуживание переключается редко, задержка распространения в
// пару секунд допустима.
const MAINTENANCE_TTL_MS = 15_000;
let maintenanceCache: { value: boolean; at: number } = { value: false, at: 0 };

async function isMaintenance(): Promise<boolean> {
  const now = Date.now();
  if (now - maintenanceCache.at < MAINTENANCE_TTL_MS) return maintenanceCache.value;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/site_settings?select=is_maintenance&id=eq.1`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        cache: "no-store",
      },
    );
    if (!res.ok) return maintenanceCache.value;
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    const value = Boolean(row?.is_maintenance);
    maintenanceCache = { value, at: now };
    return value;
  } catch {
    // БД недоступна — считаем сайт живым, а не роняем его в 503.
    return maintenanceCache.value;
  }
}

// Самодостаточная (инлайновый CSS, без клиентского бандла) страница 503. Отдаём
// её роботам и людям при включённом обслуживании: 503 + Retry-After говорят
// поисковику «это временно, не индексируй заглушку как контент сайта».
const MAINTENANCE_HTML = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>SmartCook — скоро вернёмся</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    background:linear-gradient(135deg,#0b8a5f,#059669 55%,#047857);color:#fff;padding:24px}
  .box{max-width:440px;text-align:center}
  .brand{font-size:15px;letter-spacing:4px;text-transform:uppercase;opacity:.85;margin-bottom:20px}
  h1{font-size:32px;margin:0 0 12px}
  p{font-size:16px;line-height:1.5;opacity:.92;margin:0 0 28px}
  a{display:inline-block;background:#fff;color:#047857;text-decoration:none;font-weight:600;
    padding:12px 22px;border-radius:999px}
  .thanks{margin-top:28px;font-size:14px;opacity:.8}
</style></head>
<body><div class="box">
  <div class="brand">SmartCook · СмартКук</div>
  <h1>Скоро вернёмся</h1>
  <p>Наводим порядок и готовим новые фишки. А пока подпишитесь на наш Telegram, чтобы не пропустить запуск.</p>
  <a href="https://t.me/smartcook2026" rel="noopener noreferrer">Подписаться в Telegram</a>
  <div class="thanks">Спасибо, что вы с нами 💚</div>
</div></body></html>`;

// robots.txt для неканонического хоста. На smart-cook.pro этот код не
// срабатывает — там robots.txt по-прежнему целиком генерирует app/robots.ts
// (и sitemap.xml — app/sitemap.ts), они не тронуты.
const ROBOTS_DENY_ALL = "User-agent: *\nDisallow: /\n";

function robotsDenyAllResponse() {
  return withSecurityHeaders(
    new NextResponse(ROBOTS_DENY_ALL, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }),
    { noindex: true },
  );
}

function maintenanceResponse() {
  return withSecurityHeaders(
    new NextResponse(MAINTENANCE_HTML, {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Час — ориентир для робота, когда заглянуть снова.
        "Retry-After": "3600",
        // Заглушку не кэшируем и не индексируем.
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    }),
  );
}

export async function proxy(request: NextRequest) {
  // За реверс-прокси (Vercel и т.п.) сам протокол в request.nextUrl всегда http,
  // реальную схему клиента показывает x-forwarded-proto.
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (process.env.NODE_ENV === "production" && forwardedProto === "http") {
    const httpsUrl = new URL(request.nextUrl.toString());
    httpsUrl.protocol = "https:";
    return withSecurityHeaders(NextResponse.redirect(httpsUrl, 308));
  }

  // Канонический хост — apex без www. Любой www.* уводим 308-редиректом на apex,
  // чтобы у сайта был единственный хост (без дублей для поисковика).
  const host = (request.headers.get("host") || "").toLowerCase();
  if (process.env.NODE_ENV === "production" && host.startsWith("www.")) {
    const apexUrl = new URL(request.nextUrl.toString());
    apexUrl.host = CANONICAL_HOST;
    apexUrl.protocol = "https:";
    return withSecurityHeaders(NextResponse.redirect(apexUrl, 308));
  }

  const hostname = hostnameOf(request);
  const isCanonicalHost = CANONICAL_HOSTS.has(hostname);
  const { pathname } = request.nextUrl;

  // БОЕВОЙ деплой, открытый по адресу вида *.vercel.app, — тот же сайт на
  // втором адресе: дубль для поисковика и трафик мимо бренда. Уводим 301-м
  // (постоянным — чтобы выдача переклеилась на канонический адрес), сохраняя
  // путь и query.
  //
  // ПРЕВЬЮ (VERCEL_ENV === "preview") НЕ трогаем: превью-ссылки существуют
  // ровно для приёмки PR, редирект убил бы её. От индексации превью закрыто
  // ниже — заголовком X-Robots-Tag и запрещающим robots.txt.
  const isVercelDeployHost = hostname.endsWith(".vercel.app");
  const skipRedirect = NO_REDIRECT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (
    process.env.VERCEL_ENV === "production" &&
    isVercelDeployHost &&
    !skipRedirect
  ) {
    // Собираем адрес заново от канонического origin, а не правим host у
    // nextUrl: так в Location гарантированно не утечёт ни хост деплоя, ни
    // http-схема.
    const canonicalUrl = new URL(
      `${pathname}${request.nextUrl.search}`,
      `https://${CANONICAL_HOST}`,
    );
    return withSecurityHeaders(NextResponse.redirect(canonicalUrl, 301), { noindex: true });
  }

  // На неканоническом хосте (превью-деплой, адрес деплоя, localhost) отдаём
  // robots.txt, запрещающий всё. Боевой robots.txt остаётся как был.
  if (!isCanonicalHost && pathname === "/robots.txt") {
    return robotsDenyAllResponse();
  }

  // Режим обслуживания: отдаём 503 всем публичным страницам. Админку и API не
  // трогаем — из админки обслуживание и выключается. robots.txt тоже пропускаем
  // мимо заглушки: он попал под matcher только ради ветки выше, а на боевом
  // хосте должен вести себя ровно так же, как до этой правки.
  const bypassMaintenance =
    pathname.startsWith("/admin") || pathname.startsWith("/api/") || pathname === "/robots.txt";
  if (!bypassMaintenance && (await isMaintenance())) {
    return maintenanceResponse();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  return withSecurityHeaders(response, { noindex: !isCanonicalHost });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\..*).*)",
    // Имена с точкой matcher выше отсекает, а robots.txt нужен здесь: на
    // неканоническом хосте мы подменяем его на «Disallow: /».
    "/robots.txt",
  ],
};
