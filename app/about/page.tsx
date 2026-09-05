import type { Metadata } from "next";
import AppNavigation from "@/components/AppNavigation";
import About from "@/components/About";

// «О проекте» — теперь ОДНА страница на веб и приложение.
//
// Раньше здесь лежал свой текст в оформлении документа (DocPage), а в меню
// экрана поиска показывалась совсем другая карточка. Две страницы про одно и
// то же неизбежно разъезжались. Теперь маршрут рендерит тот же компонент
// components/About, что и меню поиска: правка одна — видна везде.
//
// DocPage больше не используется: у страницы своя вёрстка с зелёной шапкой,
// а заголовок «О сервисе» дублировал бы h1 внутри компонента.

export const metadata: Metadata = {
  title: "О проекте SmartCook — рецепты из того, что есть дома",
  description:
    "SmartCook подскажет, что приготовить из продуктов, которые уже есть дома: сфотографируйте их и получите три варианта ужина. Пошаговый режим готовки, списки покупок и меню для банкета. Кто делает проект и как с нами связаться.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "О проекте SmartCook — рецепты из того, что есть дома",
    description:
      "Сфотографируйте продукты — получите три варианта ужина. Кто делает SmartCook и как с нами связаться.",
    url: "/about",
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <>
      <AppNavigation />
      <main className="container">
        <About />
      </main>
    </>
  );
}
