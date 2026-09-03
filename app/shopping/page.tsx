import type { Metadata } from "next";

import AppNavigation from "@/components/AppNavigation";
import ShoppingApp from "@/components/ShoppingApp";

export const metadata: Metadata = {
  title: "Список покупок — SmartCook",
  description:
    "Умный список покупок: добавьте продукты — SmartCook расставит их по отделам магазина, чтобы ничего не забыть.",
  alternates: { canonical: "/shopping" },
};

export default function ShoppingPage() {
  return (
    <>
      <AppNavigation activeSection="shopping" />
      <ShoppingApp />
    </>
  );
}
