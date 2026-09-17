import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import YandexMetrika from "@/components/YandexMetrika"; // Импортируем компонент Метрики
import PWAUpdater from "@/components/PWAUpdater";
import CacheKillSwitch from "@/components/CacheKillSwitch";
import PWAInstall from "@/components/PWAInstall";
import InstallBanner from "@/components/InstallBanner";
import TelegramWebViewBanner from "@/components/TelegramWebViewBanner";
import NativeShell from "@/components/NativeShell";
import TabBar from "@/components/TabBar";
import LayoutGate from "@/components/LayoutGate";
import AppToaster from "@/components/ui/AppToaster";
import { SITE_URL } from "@/lib/site";
import { Suspense } from "react"; // Импортируем Suspense для корректной работы

// 1. Настройки внешнего вида (PWA, цвета, масштаб)
export const viewport: Viewport = {
  // Цвет строки состояния = цвет ВЕРХА первого экрана. Шапка стала прозрачной,
  // и наверху теперь сама фотография под лёгкой дымкой 22% — её средний цвет
  // #9d8e71. Там, где строка состояния рисуется отдельной полосой (Android,
  // TWA), полоса продолжает снимок, а не ложится поперёк него светлым бруском.
  themeColor: "#9d8e71",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Запрещает зум пальцами (ощущение нативного приложения)
  // Контент занимает ВЕСЬ экран, включая вырез и полоску Home Indicator.
  // Без этого env(safe-area-inset-*) в браузере равны нулю: фотография
  // обрывалась ровно под вырезом, а таб-бар прижимался к полоске.
  viewportFit: "cover",
};

// 2. Настройки SEO и метаданные
export const metadata: Metadata = {
  // Канонический хост ВЕЗДЕ — основной домен (NEXT_PUBLIC_SITE_URL), apex без
  // www, и на smartcook.pro, и на старом smart-cook.pro. metadataBase делает все
  // относительные ссылки (canonical, og:image, twitter:image) абсолютными
  // именно на этот origin.
  metadataBase: new URL(SITE_URL),
  // Дефолтный title = title Главной (у неё нет своего override). Остальные
  // страницы задают свой полный title сами, поэтому template не используем,
  // чтобы не задваивать бренд («О сервисе — SmartCook»).
  title: "SmartCook (СмартКук) — рецепты по фото продуктов | Умный ИИ-шеф",
  description:
    "SmartCook (смарт кук, smart cook pro) — умный ИИ-шеф: сфотографируйте продукты и получите рецепты из того, что есть дома. Плюс пошаговый режим готовки и списки покупок.",
  applicationName: "SmartCook",
  
  // --- PWA настройки ---
  manifest: "/manifest.json", // Ссылка на манифест (обязательно!)
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SmartCook",
  },
  // iOS для домашнего экрана берёт apple-touch-icon (НЕ манифест). Он должен
  // быть НЕПРОЗРАЧНЫМ 180×180 — иначе на iOS иконка рендерится белым квадратом.
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // ---------------------

  keywords: [
    "SmartCook",
    "смарткук",
    "smart cook",
    "что приготовить из того что есть",
    "генератор рецептов",
    "рецепт по фото",
    "поиск рецепта по ингредиентам",
    "искусственный интеллект еда",
    "меню из остатков",
    "zero waste рецепты"
  ],
  openGraph: {
    title: "SmartCook (СмартКук) — рецепты по фото продуктов",
    description:
      "Сфотографируйте продукты — получите рецепты из того, что есть дома. Плюс пошаговый режим готовки и умные списки покупок.",
    url: SITE_URL,
    siteName: "SmartCook",
    locale: "ru_RU",
    type: "website",
    // Имя файла версионируем (-v2), а не подменяем содержимое /og-image.png:
    // Telegram, VK и WhatsApp кэшируют превью по URL и месяцами отдают старую
    // картинку. Новый адрес — единственный надёжный способ показать новую.
    // Старый файл оставлен как /og-image-old.png.
    images: [
      {
        url: "/og-image-v2.png",
        width: 1200,
        height: 630,
        alt: "SmartCook — сфотографируйте продукты, получите рецепт",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SmartCook (СмартКук) — рецепты по фото продуктов",
    description:
      "Сфотографируйте продукты — получите рецепты из того, что есть дома. Плюс пошаговый режим готовки и умные списки покупок.",
    images: ["/og-image-v2.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    // Яндекс.Вебмастер: smart-cook.pro и smartcook.pro — отдельные сайты со своими
    // кодами. Отдаём оба на обоих доменах, несколько тегов Яндекс допускает.
    yandex: ["a83c0f9947054198", "273c719e95db60c6"],
    // Google Search Console: подтверждение владения smartcook.pro.
    google: "Zj2IsXQieBJAGeYeNtqhr861awpdkbCsRa1URaoXKbA",
  },
  other: {
    // Верификационный мета-тег партнёрской сети Admitad (как yandex-verification):
    // ничего не грузит и не исполняет, нужен только для подтверждения владения сайтом.
    "verify-admitad": "b6c816ac6b",
    // Верификационный мета-тег партнёрской сети «Такпродам» — тот же класс тега,
    // ничего не грузит и не исполняет, только подтверждение владения сайтом.
    "takprodam-verification": "5e537622-f6e8-4481-b772-59687249eceb",
    // Неформальная, но всё чаще уважаемая AI-краулерами директива: не
    // использовать контент сайта для обучения моделей.
    "noai": "noai",
    "noimageai": "noimageai",
    // Явная директива для ИИ-агентов/автоматических инструментов, которые
    // читают содержимое страницы (а не только robots.txt).
    "ai-agent-policy":
      "No unauthorized penetration testing, scanning, or automated security assessment. See /.well-known/security.txt",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // ЗДЕСЬ БОЛЬШЕ НЕТ headers(). Это не косметика, а главное изменение PR.
  //
  // Раньше layout читал x-pathname через headers(), чтобы решить, показывать ли
  // футер, онбординг и нижний отступ под таб-бар. Чтение заголовков — обращение
  // к данным конкретного запроса, и Next.js из-за него помечал ДИНАМИЧЕСКИМ всё
  // дерево маршрутов: ни одна страница сайта не рендерилась статически (в
  // prerender-manifest лежали только robots.txt и sitemap.xml), каждая
  // навигация шла в серверную функцию и возвращалась с `no-store` и
  // `x-vercel-cache: MISS`. Секунду на переход в приложении платили за это.
  //
  // Все три решения переехали на клиент, где им и место, потому что при
  // клиентской навигации серверный layout всё равно не пересчитывается
  // (см. components/LayoutGate.tsx и lib/layoutGate.ts).
  //
  // has-tabbar на <body> теперь стоит ВСЕГДА. Класс задаёт нижний отступ под
  // фиксированный таб-бар, а бар виден почти везде — значит для первого кадра
  // это верное значение на подавляющем большинстве экранов. На двух маршрутах,
  // где бара нет (админка и комната банкета), класс снимет сам TabBar сразу
  // после гидрации: он и раньше держал его в синхроне через useEffect. Разница
  // видна только там и только как лишний нижний отступ на один кадр.
  //
  // Режим обслуживания живёт в proxy.ts (middleware): при включённом
  // обслуживании публичные страницы вообще не доходят до рендера — отдаётся
  // HTTP 503 с Retry-After, чтобы поисковый робот не индексировал заглушку.
  // Здесь layout рендерится только для «живого» сайта и для /admin.

  return (
    <html lang="ru">
      <body className="has-tabbar">
        {/* Инициализация нативной оболочки. В вебе — no-op. */}
        <NativeShell />
        {/* Оборачиваем Метрику в Suspense, чтобы Next.js не ругался при сборке */}
        <Suspense fallback={<></>}>
          <YandexMetrika />
        </Suspense>
        <PWAUpdater />
        {/* Аварийный сброс кэша по метке из админки. localStorage не трогает. */}
        <CacheKillSwitch />
        <PWAInstall />
        <InstallBanner />
        <TelegramWebViewBanner />

        {/* Вход в личный кабинет — пункт «Профиль» в таб-баре (этап H11).
            Аватарка-вход ProfileEntry отсюда убрана: два входа в одно место
            на каждом экране. Компонент остался в репозитории. */}
        <TabBar />
        {children}
        {/* Футер + онбординг: гейт по маршруту считается на клиенте. */}
        <LayoutGate />

        {/* Единый рендерер всех уведомлений: снизу, над таб-баром, белая
            карточка. Настройки — в components/ui/AppToaster. */}
        <AppToaster />
        {/* Компонент аналитики Vercel */}
        <Analytics />
      </body>
    </html>
  );
}