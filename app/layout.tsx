import type { Metadata } from "next";
import "./globals.css"; // <-- Самое важное: подключаем наш файл стилей

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
      <body>{children}</body>
    </html>
  );
}