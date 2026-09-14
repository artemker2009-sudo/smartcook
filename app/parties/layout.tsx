import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FEATURE_BANQUETS } from "@/lib/features";

// /parties — клиентский компонент, поэтому title и каноникал задаём в серверном
// layout сегмента. При выключенных банкетах метаданных нет вовсе — чтобы
// название раздела не просочилось в <title> страницы 404.
export const metadata: Metadata = FEATURE_BANQUETS
  ? {
      title: "Банкеты: меню на компанию и список покупок — SmartCook",
      description:
        "Соберите меню на компанию с помощью ИИ, проголосуйте за блюда и получите единый список покупок — раздел «Банкеты» в SmartCook (смарт кук).",
      alternates: { canonical: "/parties" },
    }
  : {};

export default function PartiesLayout({ children }: { children: React.ReactNode }) {
  // Банкеты скрыты флагом — настоящий 404 для всего сегмента.
  if (!FEATURE_BANQUETS) notFound();
  return children;
}
