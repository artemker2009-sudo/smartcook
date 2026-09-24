import React from "react";

interface DocPageProps {
  title: string;
  updated?: string;
  /** Подпись перед датой. «Обновлено» для документов, «Редакция от» для оферты. */
  updatedLabel?: string;
  children: React.ReactNode;
}

/**
 * Простой контейнер для статических документов (О сервисе, Политика, Соглашение).
 * Навигация — общий таб-бар из layout, футер добавляется туда же автоматически.
 * Всё на токенах: тёплый фон страницы, карточная типографика через .doc-body.
 */
export default function DocPage({
  title,
  updated,
  updatedLabel = "Обновлено:",
  children,
}: DocPageProps) {
  return (
    <>
      <main className="container" style={{ paddingBottom: "var(--space-5)" }}>
        <h1
          style={{
            fontSize: "var(--font-size-title)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text)",
            marginTop: "var(--space-5)",
            marginBottom: updated ? "var(--space-1)" : "var(--space-4)",
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>
        {updated && (
          <p
            style={{
              fontSize: "var(--font-size-caption)",
              color: "var(--color-text-muted)",
              margin: "0 0 var(--space-4) 0",
            }}
          >
            {updatedLabel} {updated}
          </p>
        )}
        <div className="doc-body">{children}</div>
      </main>
    </>
  );
}
