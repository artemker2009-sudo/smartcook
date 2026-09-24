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
import { isPaymentUiBlocked, podborLimitCopy } from "@/lib/premiumIos";
import { PREMIUM_COLORS as C } from "@/components/premium/premiumStyles";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Бесплатных подборов в неделю — из настройки, а не из константы. */
  limit: number;
};

export default function PodborLimitSheet({ open, onClose, limit }: Props) {
  const env = useInstallEnv();
  const iosNeutral = isPaymentUiBlocked(env);

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

  // Тексты живут в lib/premiumIos.ts и покрыты тестами: требование «в iOS нет
  // ни цен, ни слова „Премиум“, ни ссылок» — это утверждение про текст, и
  // проверять его надо текстом, а не глазами на скриншоте.
  const copy = podborLimitCopy(env, limit);

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

        <h2 style={titleStyle}>{copy.title}</h2>
        <p style={textStyle}>{copy.text}</p>

        {copy.href ? (
          <Link
            href={copy.href}
            onClick={() => reachGoal("premium_paywall_cta")}
            style={{ ...primaryButtonStyle, textDecoration: "none" }}
          >
            {copy.action}
          </Link>
        ) : (
          <button type="button" onClick={onClose} style={primaryButtonStyle}>
            {copy.action}
          </button>
        )}

        {copy.dismiss ? (
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
            {copy.dismiss}
          </button>
        ) : null}
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
