import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { Toaster } from "sonner";
import "./globals.css";
import YandexMetrika from "@/components/YandexMetrika"; // Импортируем компонент Метрики
import PWAUpdater from "@/components/PWAUpdater";
import Footer from "@/components/Footer";
import TabBar from "@/components/TabBar";
import MaintenanceScreen from "@/components/MaintenanceScreen";
import OnboardingModal from "@/components/modals/OnboardingModal";
import { Suspense } from "react"; // Импортируем Suspense для корректной работы

// 1. Настройки внешнего вида (PWA, цвета, масштаб)
export const viewport: Viewport = {
  themeColor: "#059669", // Цвет верхней плашки браузера на телефоне
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Запрещает зум пальцами (ощущение нативного приложения)
};

// 2. Настройки SEO и метаданные
export const metadata: Metadata = {
  title: "SmartCook — Умный ИИ-Шеф и организатор",
  description: "Ваш личный нейро-шеф. Генерируйте уникальные рецепты, планируйте меню для банкетов и составляйте списки покупок за секунды.",
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
    title: "SmartCook — Умный ИИ-Шеф",
    description: "Создайте идеальное меню для любого повода с помощью нейросети. Интерактивный чат, голосование и умный список покупок.",
    url: "https://smart-cook.pro",
    siteName: "SmartCook",
    locale: "ru_RU",
    type: "website",
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
    yandex: "a83c0f9947054198",
  },
  other: {
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

async function getMaintenanceStatus() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yjfqwwiqwoighjdlkodg.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_E7Fj9ZiOZTyNHAQQKo7Y0A_E8-ExX6Z"
  );

  const { data, error } = await supabase
    .from("site_settings")
    .select("is_maintenance")
    .eq("id", 1)
    .single();

  if (error) {
    return false;
  }

  return Boolean(data?.is_maintenance);
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = (await headers()).get("x-pathname") || "";
  const isAdminRoute = pathname.startsWith("/admin");
  // Комната банкета (/party/<id>) — полноэкранный рабочий экран со скроллом
  // чата и меню; полный футер там мешает. Список банкетов (/parties) и форма
  // создания (/party/create) футер сохраняют. Доступ к «Сообщить об ошибке»
  // внутри комнаты остаётся компактной иконкой в шапке (ClientRoom).
  const isPartyRoom = pathname.startsWith("/party/") && pathname !== "/party/create";
  // Таб-бар (Главная/Поиск/Банкеты) прячем там же, где футер: в админке и в
  // полноэкранной комнате банкета (задача D). На остальных страницах он есть,
  // поэтому добавляем нижний отступ body, чтобы фиксированный бар не перекрывал
  // контент/футер на мобайле (класс has-tabbar, стиль в globals.css).
  const hideFooter = isAdminRoute || isPartyRoom;
  const showTabBar = !hideFooter;
  const isMaintenance = isAdminRoute ? false : await getMaintenanceStatus();

  return (
    <html lang="ru">
      <body className={showTabBar && !isMaintenance ? "has-tabbar" : undefined}>
        {/* Оборачиваем Метрику в Suspense, чтобы Next.js не ругался при сборке */}
        <Suspense fallback={<></>}>
          <YandexMetrika />
        </Suspense>
        <PWAUpdater />

        {isMaintenance ? (
          <MaintenanceScreen />
        ) : (
          <>
            {showTabBar && <TabBar />}
            {children}
            {!hideFooter && <Footer />}
            {!isAdminRoute && <OnboardingModal />}
          </>
        )}

        <Toaster richColors position="top-center" />
        {/* Компонент аналитики Vercel */}
        <Analytics />
      </body>
    </html>
  );
}