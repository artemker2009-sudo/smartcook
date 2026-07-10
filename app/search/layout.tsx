import type { Metadata } from "next";

// /search — клиентский компонент (SearchApp), поэтому свои метаданные (title и
// каноникал) задаём в серверном layout сегмента.
export const metadata: Metadata = {
  title: "Поиск рецептов по фото и ингредиентам — SmartCook",
  description:
    "Сфотографируйте продукты или введите ингредиенты — SmartCook (смарт кук) подберёт рецепты из того, что есть дома.",
  alternates: { canonical: "/search" },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
