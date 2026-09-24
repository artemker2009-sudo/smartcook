// Палитра и размеры страницы «Премиум» — ровно из утверждённого макета
// docs/premium/premium-page.dc.html.
//
// Почему НЕ токены сайта (--color-bg и компания). Макет рисовался отдельно и
// утверждён как есть: фон #F7F7F4 теплее сайтового #faf9f7, а акцент #0B7552 —
// свой зелёный, которого в токенах нет вовсе. Подгонка под токены изменила бы
// цвета, то есть ровно то, что утверждено. Держим константы здесь одним
// местом: захотим слить с токенами — править одну таблицу.

export const PREMIUM_COLORS = {
  bg: "#F7F7F4",
  surface: "#FFFFFF",
  border: "#E4E4DE",
  borderSoft: "#EEEEE8",
  text: "#141413",
  textSecondary: "#4A4A45",
  textMuted: "#6B6B66",
  accent: "#0B7552",
  accentSoft: "#EAF4EE",
  accentSelectedBg: "#EEF6F1",
  ring: "#B9B9B2",
} as const;

/** Общая обёртка экрана: фон и шрифт макета на всю высоту. */
export const premiumScreenStyle: React.CSSProperties = {
  background: PREMIUM_COLORS.bg,
  color: PREMIUM_COLORS.text,
  minHeight: "100vh",
  fontFamily:
    "-apple-system, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif",
};

/** Колонка контента: 390 px макета, шире — центрируем. */
export const premiumContentStyle: React.CSSProperties = {
  boxSizing: "border-box",
  maxWidth: 390,
  margin: "0 auto",
  padding: "8px 16px 32px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 28,
};
