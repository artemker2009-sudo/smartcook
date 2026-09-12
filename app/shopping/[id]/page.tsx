import type { Metadata } from "next";

import ShoppingListRoute from "@/components/shopping/ShoppingListRoute";

// Сам список живёт в localStorage (локальный) или на сервере за memberRef
// (общий), поэтому серверу тут рендерить нечего — страница только держит
// АДРЕС. Адрес и есть главное: с ним «назад» в браузере, в установленном PWA и
// в нативной оболочке возвращает в хаб сам, без нашей кнопки-костыля.
export const metadata: Metadata = {
  title: "Список покупок — SmartCook",
  // Адреса списков личные и живут только на устройстве — индексировать нечего.
  robots: { index: false, follow: false },
};

export default async function ShoppingListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ShoppingListRoute listId={id} />;
}
