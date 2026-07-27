"use client";

import { ShoppingCart } from "lucide-react";
import { KUPER_CPA_URL, KUPER_AD_LABEL } from "@/lib/constants";
import { reachGoal } from "@/lib/metrika";

/**
 * Монетизация: CPA-партнёрка «Купер» (доставка продуктов). Показывается на
 * экране рецепта ПОД списком ингредиентов и ТОЛЬКО когда список есть — заказать
 * можно только то, что перечислено (см. проп-гейт у вызывающих компонентов).
 *
 * Текст «Нужно купить: закажите продукты…» дословно зарегистрирован как креатив
 * в ОРД — менять его нельзя. Ссылка (KUPER_CPA_URL) содержит erid — маркировку
 * рекламы; под кнопкой обязательна видимая текстовая пометка KUPER_AD_LABEL.
 *
 * Стиль — как у существующих карточек (surface + border), спокойный, не
 * кричащий. Клик шлёт цель Метрики ingredient_buy_click через общий reachGoal.
 */
export default function KuperBuyBlock() {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
        margin: "var(--space-4) 0",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          marginBottom: "var(--space-2)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--color-text)",
        }}
      >
        <ShoppingCart size={20} color="var(--color-accent)" /> Нужно купить
      </div>
      <p
        style={{
          margin: "0 0 var(--space-3) 0",
          fontSize: "var(--font-size-body)",
          color: "var(--color-text-secondary)",
          lineHeight: 1.5,
        }}
      >
        Нужно купить: закажите продукты для рецепта с доставкой в Купере
      </p>
      <a
        href={KUPER_CPA_URL}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={() => reachGoal("ingredient_buy_click")}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--space-2)",
          width: "100%",
          padding: "var(--space-3) var(--space-4)",
          background: "var(--color-surface)",
          color: "var(--color-accent)",
          border: "1px solid var(--color-accent)",
          borderRadius: "var(--radius-sm)",
          fontSize: "var(--font-size-body)",
          fontWeight: "var(--font-weight-semibold)",
          textDecoration: "none",
        }}
      >
        Заказать в Купере
      </a>
      {/* Обязательная маркировка рекламы (erid в ссылке) — мелко, серым, но видимо. */}
      <div
        style={{
          marginTop: "var(--space-2)",
          fontSize: "var(--font-size-caption)",
          color: "var(--color-text-muted)",
          lineHeight: 1.4,
        }}
      >
        {KUPER_AD_LABEL}
      </div>
    </div>
  );
}
