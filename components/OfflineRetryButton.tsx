"use client";

/**
 * Кнопка «Повторить» на офлайн-странице (app/~offline/page.tsx). Простой
 * reload: как только соединение вернулось, сервис-воркер снова достанет живую
 * страницу из сети. Вынесена в отдельный клиентский компонент, чтобы сама
 * офлайн-страница оставалась серверной и могла экспортировать metadata.
 */
export default function OfflineRetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      style={{
        display: "inline-block",
        background: "#059669",
        color: "#fff",
        border: "none",
        textDecoration: "none",
        fontWeight: 600,
        fontSize: 16,
        fontFamily: "inherit",
        padding: "12px 26px",
        borderRadius: 999,
        cursor: "pointer",
      }}
    >
      Повторить
    </button>
  );
}
