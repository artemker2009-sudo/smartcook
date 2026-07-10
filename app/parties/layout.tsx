import type { Metadata } from "next";

// /parties — клиентский компонент, поэтому title и каноникал задаём в серверном
// layout сегмента.
export const metadata: Metadata = {
  title: "Банкеты: меню на компанию и список покупок — SmartCook",
  description:
    "Соберите меню на компанию с помощью ИИ, проголосуйте за блюда и получите единый список покупок — раздел «Банкеты» в SmartCook (смарт кук).",
  alternates: { canonical: "/parties" },
};

export default function PartiesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
