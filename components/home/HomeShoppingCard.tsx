"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { reachGoal } from "@/lib/metrika";
import { formatBoughtLine, mainListCounts, type ListCounts } from "@/lib/homeShopping";
import { SHOPPING_CHANGED_EVENT } from "@/lib/shoppingList";
import { loadLists } from "@/lib/shoppingLists";
import { convertedLocalListIds, loadSharedPointers } from "@/lib/sharedShoppingList";
import { loadPinned } from "@/lib/shoppingPinned";

/**
 * Карточка «Список покупок» на Главной: что это такое и кнопка в раздел.
 *
 * У вернувшегося справа от заголовка стоит строка «N из M куплено» по ГЛАВНОМУ
 * списку — тому самому, что лежит верхней карточкой в «Покупках» (правило
 * порядка одно на два экрана, см. lib/homeShopping.ts). Списков нет — строки
 * нет вовсе, а не «0 из 0».
 *
 * Списки живут в localStorage, то есть на сервере их не видно. Поэтому
 * карточка всегда рендерится ОДИНАКОВОЙ: строка счётчика появляется вторым
 * кадром, внутри уже занятого места справа от заголовка, и SSR-разметка
 * Главной не прыгает.
 */
export default function HomeShoppingCard() {
  const [counts, setCounts] = useState<ListCounts | null>(null);

  useEffect(() => {
    const read = () => {
      const pointers = loadSharedPointers();
      setCounts(
        mainListCounts({
          lists: loadLists(),
          pointers,
          pinned: loadPinned(),
          hidden: convertedLocalListIds(pointers),
        }),
      );
    };
    read();
    // Список могли поменять на экране покупок, в другой вкладке или на другом
    // устройстве (общий список).
    window.addEventListener(SHOPPING_CHANGED_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(SHOPPING_CHANGED_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  return (
    <section className="home-shopping">
      <div className="home-shopping-head">
        <span className="home-shopping-icon" aria-hidden>
          <ShoppingCart size={22} />
        </span>
        <h2 className="home-shopping-title">Список покупок</h2>
        {counts && <span className="home-shopping-counts">{formatBoughtLine(counts)}</span>}
      </div>
      <p className="home-shopping-text">
        Продукты из рецепта добавляются одним нажатием. Разложим по отделам магазина — ничего не
        забудете.
      </p>
      <Link
        href="/shopping"
        className="home-shopping-cta"
        onClick={() => {
          // home_shopping_open — новая цель Главной v2. shopping_feature_open
          // остаётся: на ней собрана прежняя воронка входа в раздел с Главной.
          reachGoal("home_shopping_open");
          reachGoal("shopping_feature_open");
        }}
      >
        Открыть список
      </Link>
    </section>
  );
}
