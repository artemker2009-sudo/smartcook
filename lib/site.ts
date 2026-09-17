// Адрес сайта — единственный источник правды для абсолютных ссылок: canonical,
// og:url, sitemap, robots, JSON-LD и ссылок «поделиться».
//
// Основной домен — smartcook.pro, задаётся env NEXT_PUBLIC_SITE_URL. Переменная
// с префиксом NEXT_PUBLIC_ встраивается в сборку при build: поменять её без
// редеплоя нельзя. Запасное значение ниже совпадает с боевым, поэтому сборка
// без переменной (забыли завести, локальный запуск, превью) ведёт себя так же,
// как с ней, а не отдаёт ссылки на localhost или пустую строку.
//
// Файл намеренно без "use client": его читает и сервер (metadata, sitemap,
// proxy.ts), и клиент (share-ссылки).

const DEFAULT_SITE_URL = "https://smartcook.pro";

// Старый домен. Работает НАВСЕГДА и без редиректа: он вшит в выпущенные сборки
// iOS (Capacitor server.url) и Android (TWA), на нём живут установленные PWA и
// localStorage пользователей. Поэтому он остаётся «настоящим» хостом —
// без noindex, с боевым robots.txt и разрешённым Origin для API.
export const LEGACY_SITE_HOST = "smart-cook.pro";

function normalizeSiteUrl(raw: string | undefined): string {
  const value = (raw || "").trim();
  if (!value) return DEFAULT_SITE_URL;
  try {
    const url = new URL(value);
    // Мусор в env (без схемы, плейсхолдер [SENSITIVE] из vercel env pull и т.п.)
    // не должен ронять proxy.ts на старте — откатываемся на боевой адрес.
    if (url.protocol !== "https:" && url.protocol !== "http:") return DEFAULT_SITE_URL;
    return url.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

/** Origin без завершающего слэша: https://smartcook.pro */
export const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

/** Хост основного домена без www: smartcook.pro */
export const SITE_HOST = new URL(SITE_URL).host;

/**
 * Все хосты, на которых сайт «настоящий»: основной и старый домены, каждый
 * с www. На них не ставится noindex, отдаётся боевой robots.txt, и с них
 * разрешён Origin для API.
 */
export const SITE_HOSTS: ReadonlySet<string> = new Set(
  [SITE_HOST, LEGACY_SITE_HOST].flatMap((host) => [host, `www.${host}`]),
);

/** Абсолютная ссылка на путь сайта: siteUrl("/recipe/1") → https://smartcook.pro/recipe/1 */
export function siteUrl(path = "/"): string {
  if (path === "" || path === "/") return SITE_URL;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
