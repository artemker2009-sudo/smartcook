"use client";

// Нижняя шторка «бесплатные подборы кончились».
//
// Два варианта по утверждённым макетам:
//   * docs/premium/limit-web.dc.html — сайт и Android: цена, «Подбирать без
//     лимита», «Пока посмотреть „Идеи“»;
//   * docs/premium/limit-ios.dc.html — iPhone: ни цен, ни слова «Премиум», ни
//     ссылок на оплату; вместо предложения купить — предложение почитать
//     «Идеи» (правило App Store 3.1.1).
//
// Тексты и состав кнопок собирает podborLimitCopy() в lib/premiumIos.ts —
// там же они покрыты тестами. Здесь только разметка.
//
// Выезд, уход, свайп вниз и затемнение — общий BottomSheet.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { reachGoal } from "@/lib/metrika";
import { useInstallEnv } from "@/lib/installEnv";
import { isPaymentUiBlocked, podborLimitCopy } from "@/lib/premiumIos";
import BottomSheet from "@/components/ui/BottomSheet";
import { PREMIUM_COLORS as C } from "@/components/premium/premiumStyles";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Бесплатных подборов в неделю — из настройки, а не из константы. */
  limit: number;
};

/** Искра — заголовочная иконка варианта для сайта. */
function SparkIcon() {
  return (
    <svg {...iconBase} width={24} height={24}>
      <path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z" />
      <path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z" />
    </svg>
  );
}

/** Лампочка — «Идеи». Заголовочная иконка в iOS и значок второй кнопки. */
function IdeaIcon({ size = 20 }: { size?: number }) {
  return (
    <svg {...iconBase} width={size} height={size}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" />
    </svg>
  );
}

/** Ценник в плашке с ценой. */
function PriceTagIcon() {
  return (
    <svg {...iconBase} width={22} height={22}>
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />
    </svg>
  );
}

export default function PodborLimitSheet({ open, onClose, limit }: Props) {
  const router = useRouter();
  const env = useInstallEnv();
  const iosNeutral = isPaymentUiBlocked(env);
  const copy = podborLimitCopy(env, limit);

  useEffect(() => {
    if (open) reachGoal("premium_paywall_shown", { ios: iosNeutral });
  }, [open, iosNeutral]);

  // Уход шторки должен проигрываться, а не обрываться переходом. Поэтому
  // сперва закрываем, а навигацию отдаём следующим кадром.
  const go = (href: string, goal: string) => {
    reachGoal(goal);
    onClose();
    router.push(href);
  };

  return (
    <BottomSheet open={open} onClose={onClose} label={copy.title}>
      <span style={roundIconStyle}>{iosNeutral ? <IdeaIcon size={24} /> : <SparkIcon />}</span>

      <h2 style={titleStyle}>{copy.title}</h2>
      <p style={textStyle}>{copy.text}</p>

      {copy.price ? (
        <div style={priceBoxStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1 }}>
            <div style={{ fontSize: 17, lineHeight: "22px", fontWeight: 800 }}>
              {copy.price.headline}
            </div>
            <div style={{ fontSize: 13, lineHeight: "18px", color: C.textMuted }}>
              {copy.price.note}
            </div>
          </div>
          <span style={{ color: C.accent, display: "flex" }}>
            <PriceTagIcon />
          </span>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() =>
          go(copy.primary.href, iosNeutral ? "premium_paywall_ideas" : "premium_paywall_cta")
        }
        style={primaryButtonStyle}
      >
        {copy.primary.label}
      </button>

      {copy.secondary ? (
        <button
          type="button"
          onClick={() => go(copy.secondary!.href, "premium_paywall_ideas")}
          style={secondaryButtonStyle}
        >
          <IdeaIcon />
          {copy.secondary.label}
        </button>
      ) : null}

      <button type="button" onClick={onClose} style={dismissStyle}>
        {copy.dismiss}
      </button>
    </BottomSheet>
  );
}

const iconBase = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const roundIconStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 24,
  background: C.accentSoft,
  color: C.accent,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  lineHeight: "29px",
  fontWeight: 800,
  letterSpacing: "-0.3px",
};

const textStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  lineHeight: "22px",
  color: C.textSecondary,
};

const priceBoxStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  padding: "12px 14px",
};

const primaryButtonStyle: React.CSSProperties = {
  height: 54,
  width: "100%",
  boxSizing: "border-box",
  border: "none",
  borderRadius: 16,
  background: C.accent,
  color: C.surface,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 17,
  fontWeight: 700,
  fontFamily: "inherit",
  boxShadow: "0 6px 16px rgba(11,117,82,0.25)",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  height: 50,
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 16,
  background: C.surface,
  border: `1px solid ${C.border}`,
  color: C.text,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontSize: 16,
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
};

const dismissStyle: React.CSSProperties = {
  height: 36,
  width: "100%",
  background: "none",
  border: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 15,
  fontFamily: "inherit",
  color: C.textMuted,
  cursor: "pointer",
};
