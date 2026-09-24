"use client";

// Нижняя шторка «подборы на этой неделе закончились».
//
// Два разных содержания, и разница не косметическая:
//
//   * сайт и Android — предложение купить Премиум, с ценой и кнопкой на
//     /premium;
//   * нативный iOS — НЕЙТРАЛЬНЫЙ текст: «новые подборы в понедельник», кнопка
//     «Понятно». Ни слова «Премиум», ни цены, ни ссылки на сайт. Это правило
//     App Store 3.1.1: приложение не вправе даже направлять к оплате мимо
//     Apple. Лимит при этом действует одинаково — прячем предложение, а не
//     функцию, и ровно по среде, без хитростей по гео, дате или аккаунту.
//
// Стиль — из макета /premium (фон #F7F7F4, акцент #0B7552, скругления 16–20,
// системный шрифт), чтобы шторка и страница читались как одно целое.

import { useEffect } from "react";
import Link from "next/link";
import { reachGoal } from "@/lib/metrika";
import { useInstallEnv } from "@/lib/installEnv";
import { isPaymentUiBlocked } from "@/lib/premiumIos";
import { pluralPodbor } from "@/lib/premiumPeriod";
import { PREMIUM_PLANS, formatPriceRub } from "@/lib/premiumPlans";
import { PREMIUM_COLORS as C } from "@/components/premium/premiumStyles";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Бесплатных подборов в неделю — из настройки, а не из константы. */
  limit: number;
};

export default function PodborLimitSheet({ open, onClose, limit }: Props) {
  const iosNeutral = isPaymentUiBlocked(useInstallEnv());

  useEffect(() => {
    if (open) reachGoal("premium_paywall_shown", { ios: iosNeutral });
  }, [open, iosNeutral]);

  // Escape закрывает — как у остальных модалок приложения.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Самый дешёвый тариф — «от 49 ₽». Берётся из общего списка, а не вписан
  // строкой: появится тариф дешевле — подпись съедет сама.
  const cheapest = PREMIUM_PLANS.reduce((a, b) => (b.priceRub < a.priceRub ? b : a));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Подборы на этой неделе закончились"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(20, 20, 19, 0.45)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          boxSizing: "border-box",
          background: C.bg,
          color: C.text,
          borderRadius: "20px 20px 0 0",
          // Нижний вырез (Home Indicator): без него кнопка ложится на полоску.
          padding: "20px 16px calc(20px + env(safe-area-inset-bottom, 0px)) 16px",
          fontFamily: "-apple-system, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Ручка шторки — подсказка, что её можно закрыть. */}
        <span
          aria-hidden
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            background: C.border,
            alignSelf: "center",
            marginBottom: 4,
          }}
        />

        {iosNeutral ? (
          <>
            <h2 style={titleStyle}>Подборы на эту неделю закончились</h2>
            <p style={textStyle}>Новые — в понедельник.</p>
            <button type="button" onClick={onClose} style={primaryButtonStyle}>
              Понятно
            </button>
          </>
        ) : (
          <>
            <h2 style={titleStyle}>Подборы на этой неделе закончились</h2>
            <p style={textStyle}>
              Бесплатно — {limit} {pluralPodbor(limit)} в неделю, новые — в понедельник.
              С Премиумом — без лимита, от {formatPriceRub(cheapest.priceRub)}.
            </p>
            <Link
              href="/premium"
              onClick={() => reachGoal("premium_paywall_cta")}
              style={{ ...primaryButtonStyle, textDecoration: "none" }}
            >
              Оформить Премиум
            </Link>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                padding: "8px 0",
                fontFamily: "inherit",
                fontSize: 15,
                lineHeight: "20px",
                color: C.textMuted,
                cursor: "pointer",
              }}
            >
              Подожду до понедельника
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  lineHeight: "26px",
  fontWeight: 800,
  letterSpacing: "-0.2px",
};

const textStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  lineHeight: "21px",
  color: C.textSecondary,
};

const primaryButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 52,
  width: "100%",
  boxSizing: "border-box",
  border: "none",
  borderRadius: 16,
  background: C.accent,
  color: C.surface,
  fontSize: 17,
  fontWeight: 700,
  fontFamily: "inherit",
  cursor: "pointer",
  marginTop: 4,
};
