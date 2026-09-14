import { notFound } from "next/navigation";
import { FEATURE_BANQUETS } from "@/lib/features";

// Общий серверный layout для /party/create и /party/<id>. Нужен только ради
// флага: /party/create — клиентская страница, а в layout notFound() срабатывает
// до рендера и до запросов комнаты в БД.
export default function PartyLayout({ children }: { children: React.ReactNode }) {
  // Банкеты скрыты флагом — настоящий 404 для всего сегмента.
  if (!FEATURE_BANQUETS) notFound();
  return children;
}
