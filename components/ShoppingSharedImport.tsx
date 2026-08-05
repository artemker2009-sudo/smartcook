"use client";

import { Check, Download, ShoppingCart } from "lucide-react";
import type { SharedPayload } from "@/lib/shoppingShare";

function pluralizeProducts(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} продукт`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} продукта`;
  return `${n} продуктов`;
}

type Props = {
  payload: SharedPayload;
  onSave: () => void;
  onDismiss: () => void;
};

/**
 * Экран «с вами поделились списком». Данные пришли из URL — рендерим строго
 * текстом (React экранирует), санитизация уже сделана в decodeSharedList.
 */
export default function ShoppingSharedImport({ payload, onSave, onDismiss }: Props) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          marginBottom: "var(--space-2)",
          color: "var(--color-accent)",
          fontSize: "var(--font-size-caption)",
          fontWeight: "var(--font-weight-semibold)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        <ShoppingCart size={18} /> С вами поделились списком
      </div>

      <h1
        style={{
          margin: "0 0 var(--space-1) 0",
          fontSize: "var(--font-size-title)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--color-text)",
          lineHeight: 1.2,
        }}
      >
        {payload.name}
      </h1>
      <p style={{ margin: "0 0 var(--space-4) 0", color: "var(--color-text-secondary)", fontSize: "var(--font-size-body)" }}>
        {pluralizeProducts(payload.items.length)}
      </p>

      {/* Превью — только текст. */}
      <ul
        style={{
          listStyle: "none",
          margin: "0 0 var(--space-4) 0",
          padding: 0,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
        }}
      >
        {payload.items.map((name, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              padding: "var(--space-3)",
              borderBottom: "1px solid var(--color-border)",
              fontSize: "var(--font-size-heading)",
              color: "var(--color-text)",
            }}
          >
            <span
              aria-hidden
              style={{
                flexShrink: 0,
                width: 22,
                height: 22,
                borderRadius: "var(--radius-full)",
                background: "var(--color-accent-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Check size={14} color="var(--color-accent)" strokeWidth={3} />
            </span>
            {name}
          </li>
        ))}
      </ul>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <button
          type="button"
          onClick={onSave}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-2)",
            width: "100%",
            padding: "var(--space-3) var(--space-4)",
            background: "var(--color-accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--font-size-heading)",
            fontWeight: "var(--font-weight-semibold)",
            cursor: "pointer",
          }}
        >
          <Download size={22} /> Сохранить себе
        </button>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            width: "100%",
            padding: "var(--space-3)",
            background: "transparent",
            color: "var(--color-text-secondary)",
            border: "none",
            fontSize: "var(--font-size-body)",
            fontWeight: "var(--font-weight-medium)",
            cursor: "pointer",
          }}
        >
          Не сейчас
        </button>
      </div>
    </div>
  );
}
