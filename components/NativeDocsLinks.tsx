"use client";

import Link from "next/link";
import { useIsNative } from "@/lib/native";

// Ссылки на документы для НАТИВНОЙ сборки.
//
// Зачем компонент. В приложении убран общий футер: на телефоне он читался как
// хвост сайта — донат, «Установить приложение», абзац про сканирование
// безопасности. Всё это в приложении либо бессмысленно, либо запрещено
// правилами магазина. Но обязательные ссылки (политика, соглашение,
// поддержка) исчезать вместе с ним не должны — на них ссылается и App Review,
// и сама политика. Поэтому вместо футера они появляются ровно в двух местах,
// где человек их и ищет: «О проекте» и личный кабинет.
//
// Компонент рендерится ТОЛЬКО в нативе. В вебе футер остался как был, и второй
// набор тех же ссылок там был бы дублем.
//
// Чего здесь СОЗНАТЕЛЬНО нет (решение при постановке задачи):
//   * «О сервисе» — этот экран и есть «О проекте», ссылка сама на себя;
//   * «Правовая информация» — дублирует соглашение для пользователя приложения;
//   * абзац про автоматическое сканирование — обращён к ботам, а не к людям,
//     и в приложении выглядит как случайно попавший текст.

const LINKS = [
  { href: "/privacy", label: "Политика конфиденциальности" },
  { href: "/terms", label: "Пользовательское соглашение" },
  { href: "/support", label: "Поддержка" },
] as const;

const COPYRIGHT = "© SmartCook 2026";

export default function NativeDocsLinks({
  variant = "block",
  always = false,
}: {
  /** "block" — отдельная группа с заголовком («О проекте»).
   *  "inline" — те же ссылки одной строкой (личный кабинет). */
  variant?: "block" | "inline";
  /** Показывать и в вебе. Нужно странице «О проекте»: там «Документы» —
   *  штатный блок страницы, а не замена футеру. В личном кабинете проп не
   *  ставим: в вебе те же ссылки уже есть в футере, и дубль ни к чему. */
  always?: boolean;
}) {
  const isNative = useIsNative();
  if (!isNative && !always) return null;

  const linkStyle: React.CSSProperties = {
    color: "var(--color-text-secondary)",
    fontSize: "var(--font-size-caption)",
    fontWeight: "var(--font-weight-medium)",
    textDecoration: "none",
    // Зона тапа: ссылки мелкие, но пальцем в них надо попадать.
    padding: "var(--space-1) 0",
  };

  if (variant === "inline") {
    return (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: "var(--space-1) var(--space-3)",
          marginTop: "var(--space-3)",
        }}
      >
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} style={linkStyle}>
            {l.label}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4) var(--space-3)",
        // Та же отбивка, что у остальных разделов страницы «О проекте».
        marginTop: "40px",
        textAlign: "center",
      }}
    >
      <h3
        style={{
          margin: "0 0 var(--space-3) 0",
          fontSize: "var(--font-size-body)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--color-text)",
        }}
      >
        Документы
      </h3>
      <nav
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "var(--space-1) var(--space-3)",
          marginBottom: "var(--space-3)",
        }}
      >
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} style={linkStyle}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text-muted)" }}>
        {COPYRIGHT}
      </div>
    </div>
  );
}
