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
  "upgrade-insecure-requests",
].join("; ");

function withSecurityHeaders(response: NextResponse) {
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

  // Режим обслуживания: отдаём 503 всем публичным страницам. Админку и API не
  // трогаем — из админки обслуживание и выключается.
  const { pathname } = request.nextUrl;
  const bypassMaintenance =
    pathname.startsWith("/admin") || pathname.startsWith("/api/");
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

  return withSecurityHeaders(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\..*).*)"],
};
