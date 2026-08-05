"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { reachGoal } from "@/lib/metrika";
import { markShoppingPromoSeen, shouldShowShoppingPromo } from "@/lib/shoppingPromo";

/**
 * Плашка-новинка «Покупки» на Главной. Дружелюбная карточка, которую видит
 * ТОЛЬКО вернувшийся пользователь и ТОЛЬКО один раз на устройство (логика в
 * lib/shoppingPromo — БЕЗ БД, только localStorage).
 *
 * Помечаем показанной сразу при показе (как онбординг-модалка) — так «один раз»
 * держится даже если пользователь ушёл со страницы, не нажав ничего. Крестик и
 * «Попробовать» лишь скрывают карточку; флаг уже выставлен.
 */
export default function ShoppingPromoBanner() {
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Решение о показе читает localStorage — только на клиенте. Небольшая
    // задержка (как у онбординг-модалки): плашка мягко появляется после первой
    // отрисовки и setState не дёргается синхронно в теле эффекта.
    const timer = setTimeout(() => {
      if (shouldShowShoppingPromo()) {
        markShoppingPromoSeen();
        setShow(true);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  const handleTry = () => {
    reachGoal("shopping_promo_click");
    router.push("/shopping");
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        background: "var(--color-accent-subtle)",
        border: "1px solid var(--color-accent)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3)",
        marginBottom: "var(--space-4)",
      }}
    >
      <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }} aria-hidden>
        🛒
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: "0 0 var(--space-2) 0",
            fontSize: "var(--font-size-body)",
            lineHeight: 1.4,
            color: "var(--color-text)",
          }}
        >
          <strong>Новинка: умный список покупок</strong> — сам расставит продукты по отделам магазина.
        </p>
        <button
          type="button"
          onClick={handleTry}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--space-2) var(--space-4)",
            background: "var(--color-accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-full)",
            fontSize: "var(--font-size-body)",
            fontWeight: "var(--font-weight-semibold)",
            cursor: "pointer",
          }}
        >
          Попробовать
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShow(false)}
        aria-label="Закрыть"
        style={{
          flexShrink: 0,
          alignSelf: "flex-start",
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          border: "none",
          borderRadius: "var(--radius-full)",
          color: "var(--color-text-muted)",
          cursor: "pointer",
        }}
      >
        <X size={20} />
      </button>
    </div>
  );
}
