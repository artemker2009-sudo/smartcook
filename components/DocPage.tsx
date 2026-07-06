import React from "react";
import AppNavigation from "@/components/AppNavigation";

interface DocPageProps {
  title: string;
  updated?: string;
  children: React.ReactNode;
}

/**
 * Простой контейнер для статических документов (О сервисе, Политика, Соглашение).
 * Шапка-меню — общая (AppNavigation), футер добавляется в layout автоматически.
 * Всё на токенах: тёплый фон страницы, карточная типографика через .doc-body.
 */
export default function DocPage({ title, updated, children }: DocPageProps) {
  return (
    <>
      <AppNavigation />
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
            Обновлено: {updated}
          </p>
        )}
        <div className="doc-body">{children}</div>
      </main>
    </>
  );
}
