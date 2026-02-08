import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react"; // 1. Импортируем аналитику
import "./globals.css"; 

export const metadata: Metadata = {
  title: "SmartCook",
  description: "Генератор рецептов из продуктов",
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
        {/* 2. Вставляем компонент аналитики сюда, чтобы он работал на всех страницах */}
        <Analytics />
      </body>
    </html>
  );
}