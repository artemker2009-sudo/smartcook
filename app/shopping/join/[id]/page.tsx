import type { Metadata } from "next";

import AppNavigation from "@/components/AppNavigation";
import SharedShoppingJoin from "@/components/SharedShoppingJoin";

// Экран приглашения в общий список. Содержимое списка тут не рендерится и в
// разметку не попадает: до вступления сервер отдаёт только имя и число позиций.
export const metadata: Metadata = {
  title: "Общий список покупок — SmartCook",
  description: "Вас позвали в общий список покупок. Присоединяйтесь — регистрация не нужна.",
  // Приглашение — приватная ссылка, ей нечего делать в поиске.
  robots: { index: false, follow: false },
};

export default async function SharedShoppingJoinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <AppNavigation activeSection="shopping" />
      <SharedShoppingJoin listId={id} />
    </>
  );
}
