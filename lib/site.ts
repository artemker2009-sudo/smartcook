// Адрес сайта — единственный источник правды для абсолютных ссылок: canonical,
// og:url, sitemap, robots, JSON-LD.
//
// Ссылки «поделиться» — ОТДЕЛЬНЫЙ случай, для них здесь shareUrl(): они
// собираются от текущего origin, чтобы не выкидывать человека из приложения на
// чужое хранилище. Подробности — в комментарии к shareOrigin() ниже.
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

function join(origin: string, path: string): string {
  if (path === "" || path === "/") return origin;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Абсолютная ссылка на путь сайта: siteUrl("/recipe/1") → https://smartcook.pro/recipe/1 */
export function siteUrl(path = "/"): string {
  return join(SITE_URL, path);
}

/**
 * Origin для ссылок «поделиться»: ТЕКУЩИЙ, если мы на одном из настоящих
 * хостов, иначе канонический SITE_URL.
 *
 * Зачем не всегда SITE_URL. Приложения (iOS-оболочка Capacitor, Android-TWA) и
 * установленные PWA живут на старом smart-cook.pro — это их origin, и он вшит в
 * выпущенные сборки (см. шапку capacitor.config.ts). Ссылка, собранная от
 * канона, ведёт на ДРУГОЙ origin, а Web Storage в WKWebView живёт строго по
 * origin: тап по такой ссылке внутри приложения открывал бы пустой сайт — без
 * списков покупок, разлогиненный, без профиля вкуса, и вернуться назад нельзя
 * (allowsBackForwardNavigationGestures у WKWebView выключен, браузерного хрома
 * нет). Поэтому «поделиться» отдаёт тот адрес, на котором человек сейчас стоит.
 *
 * Проверка по SITE_HOSTS ОБЯЗАТЕЛЬНА и является здесь всей сутью. Без неё
 * превью-деплой начал бы рассылать ссылки на *.vercel.app (они ещё и за Vercel
 * Authentication — получатель увидит форму входа), а локальный запуск — на
 * localhost. В SITE_HOSTS хосты без портов, поэтому localhost:3000 не пройдёт
 * ни при каких обстоятельствах.
 *
 * На сервере (SSR, metadata, sitemap, JSON-LD) window нет — возвращается
 * SITE_URL. Канонические ссылки, og:url и карта сайта остаются на основном
 * домене и этой функцией не пользуются.
 */
function shareOrigin(): string {
  if (typeof window === "undefined") return SITE_URL;
  try {
    // host, а не hostname: с портом в SITE_HOSTS совпадений нет by design.
    return SITE_HOSTS.has(window.location.host) ? window.location.origin : SITE_URL;
  } catch {
    return SITE_URL;
  }
}

/**
 * Ссылка для шеринга: тот же путь, но от origin, на котором человек сейчас
 * находится (если это наш хост). На smart-cook.pro → smart-cook.pro/recipe/1,
 * на smartcook.pro → smartcook.pro/recipe/1, на превью → канон.
 */
export function shareUrl(path = "/"): string {
  return join(shareOrigin(), path);
}
