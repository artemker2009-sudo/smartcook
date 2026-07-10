// @ts-ignore
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    // Не залипать на старом бандле: новая версия SW сразу берёт управление,
    // устаревшие precache-кэши чистятся.
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    // Явные правила рантайм-кэша. По умолчанию next-pwa кэширует /api —
    // здесь мы это ЗАПРЕЩАЕМ. Кэшируем только статику (shell/иконки/картинки).
    runtimeCaching: [
      // API, авторизация, Supabase, OpenAI, Метрика — ТОЛЬКО сеть, без кэша.
      {
        urlPattern: ({ url }: { url: URL }) =>
          url.pathname.startsWith("/api/") ||
          url.pathname.startsWith("/auth") ||
          /supabase\.co$/.test(url.hostname) ||
          /openai\.com$/.test(url.hostname) ||
          /mc\.yandex\.(ru|com)$/.test(url.hostname),
        handler: "NetworkOnly",
      },
      // Статика Next (JS/CSS уже в precache, дублируем на всякий) — SWR.
      {
        urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith("/_next/static/"),
        handler: "StaleWhileRevalidate",
        options: { cacheName: "sc-static" },
      },
      // Иконки/картинки шелла — SWR.
      {
        urlPattern: ({ request }: { request: Request }) => request.destination === "image",
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "sc-images",
          expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 },
        },
      },
      // Навигации (шелл страниц) — сеть в приоритете, кэш как офлайн-фолбэк.
      {
        urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
        handler: "NetworkFirst",
        options: {
          cacheName: "sc-pages",
          networkTimeoutSeconds: 3,
          expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Digital Asset Links для TWA обязаны лежать по каноническому пути
  // /.well-known/assetlinks.json. Отдаём их из динамического роута (содержимое
  // из env ASSETLINKS_JSON), а не статикой — отпечаток подписи появится только
  // после сборки пакета. Rewrite (а не redirect) сохраняет исходный URL, как
  // того требует проверка Play/RuStore.
  async rewrites() {
    return [
      {
        source: "/.well-known/assetlinks.json",
        destination: "/api/assetlinks",
      },
    ];
  },
  // Легаси share-ссылки (/?recipeId=… и /search?recipeId=…) уводим на быстрый
  // серверный маршрут /recipe/:id ещё до загрузки клиента — иначе они снова
  // тянули бы монолит SearchApp (задача T). Редирект на уровне сервера/edge,
  // так что старые ссылки открываются так же быстро, как новые.
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "query", key: "recipeId", value: "(?<rid>\\d+)" }],
        destination: "/recipe/:rid",
        permanent: false,
      },
      {
        source: "/search",
        has: [{ type: "query", key: "recipeId", value: "(?<rid>\\d+)" }],
        destination: "/recipe/:rid",
        permanent: false,
      },
    ];
  },
};

export default withPWA(nextConfig);
