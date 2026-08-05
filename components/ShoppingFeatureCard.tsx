"use client";

import Link from "next/link";
import { ArrowRight, ShoppingCart } from "lucide-react";
import { reachGoal } from "@/lib/metrika";

// Живой пример пользы: продукт → отдел магазина. Показываем, ЧТО делает
// умная сортировка, а не просто называем функцию.
const EXAMPLES = [
  { product: "Молоко", dept: "Молочное" },
  { product: "Огурцы", dept: "Овощи-фрукты" },
  { product: "Хлеб", dept: "Хлеб" },
];

/**
 * Премиальная карточка «Умный список покупок» на Главной. Градиент в фирменных
 * зелёных тонах, крупная иконка, живой пример «продукт → отдел» и кнопка. Вся
 * карточка — ссылка на /shopping.
 */
export default function ShoppingFeatureCard() {
  return (
    <Link
      href="/shopping"
      className="shopping-hero"
      onClick={() => reachGoal("shopping_feature_open")}
      aria-label="Открыть умный список покупок"
    >
      <div className="shopping-hero-top">
        <span className="shopping-hero-icon" aria-hidden>
          <ShoppingCart size={28} />
        </span>
        <div className="shopping-hero-heading">
          <span className="shopping-hero-kicker">Новинка</span>
          <span className="shopping-hero-title">Умный список покупок</span>
        </div>
      </div>

      <p className="shopping-hero-sub">
        Добавьте продукты — я сам разложу их по отделам магазина, чтобы не ходить по залу дважды.
      </p>

      <div className="shopping-hero-examples" aria-hidden>
        {EXAMPLES.map((ex) => (
          <span key={ex.product} className="shopping-hero-chip">
            {ex.product} <ArrowRight size={13} /> {ex.dept}
          </span>
        ))}
      </div>

      <span className="shopping-hero-cta">
        Открыть список <ArrowRight size={18} />
      </span>
    </Link>
  );
}
