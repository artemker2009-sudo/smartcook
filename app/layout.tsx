import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

// Настройки SEO для поисковиков (Яндекс, Google) и соцсетей
export const metadata: Metadata = {
  title: "SmartCook — Генератор рецептов по фото | ИИ Шеф-повар",
  description: "Не знаете, что приготовить? Сфотографируйте продукты, и искусственный интеллект подберет рецепт за 3 секунды. Экономьте время и деньги со SmartCook.",
  applicationName: "SmartCook",
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
  // 👇 ВОТ СЮДА Я ДОБАВИЛ ТВОЙ КОД ЯНДЕКСА
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