import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

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
  title: "SmartCook — Генератор рецептов по фото | ИИ Шеф-повар",
  description: "Не знаете, что приготовить? Сфотографируйте продукты, и искусственный интеллект подберет рецепт за 3 секунды. Экономьте время и деньги со SmartCook.",
  applicationName: "SmartCook",
  
  // --- PWA настройки ---
  manifest: "/manifest.json", // Ссылка на манифест (обязательно!)
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SmartCook",
  },
  // ---------------------

  keywords: [
    "что приготовить из того что есть",
    "генератор рецептов",
    "рецепт по фото",
    "поиск рецепта по ингредиентам",
    "искусственный интеллект еда",
    "smartcook",
    "меню из остатков",
    "zero waste рецепты"
  ],
  openGraph: {
    title: "Сфоткай еду — получи рецепт 📸",
    description: "Магия ИИ на вашей кухне. Готовим из того, что есть.",
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        {children}
        {/* Компонент аналитики Vercel */}
        <Analytics />
      </body>
    </html>
  );
}