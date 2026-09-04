"use client";

import { useEffect } from "react";

// Последний рубеж: сбой в самом root-layout. Next в этом случае выбрасывает
// всё дерево вместе с layout и рендерит ЭТОТ файл, поэтому он обязан отдавать
// собственные <html> и <body> — и не может рассчитывать ни на globals.css, ни
// на шапку, ни на футер.
//
// Отсюда инлайновые стили с литеральными значениями токенов (те же цвета и
// радиусы, что в globals.css: --color-bg #faf9f7, --color-accent #059669,
// --radius-sm 12px): визуально экран остаётся тем же приложением, но не зависит
// ни от одного внешнего файла. Ровно тот же приём, что на офлайн-странице
// app/~offline/page.tsx.
//
// Всё по-русски и с выходом «На главную»: английский дефолт Next без единой
// кнопки читается как «приложение сломано», а не «в приложении сбой».

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#faf9f7",
          color: "#18181b",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <main style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 16 }} aria-hidden>
            🍳
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 600, margin: "0 0 12px 0", lineHeight: 1.2 }}>
            Что-то пошло не так
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: "#52525b", margin: "0 0 24px 0" }}>
            Приложение не смогло запуститься. Скорее всего, это временный сбой —
            попробуйте ещё раз.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              width: "100%",
              padding: "14px 20px",
              border: "none",
              borderRadius: 12,
              background: "#059669",
              color: "#fff",
              fontSize: 16,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            Попробовать снова
          </button>

          {/* Кнопка, а не ссылка, и намеренно через window.location: root-layout
              на этом экране уже упал, и полагаться на клиентский роутер нельзя —
              нужна честная полная перезагрузка приложения. */}
          <button
            type="button"
            onClick={() => window.location.assign("/")}
            style={{
              display: "block",
              width: "100%",
              fontFamily: "inherit",
              cursor: "pointer",
              marginTop: 12,
              padding: "14px 20px",
              borderRadius: 12,
              border: "1px solid #e4e4e7",
              background: "#ffffff",
              color: "#18181b",
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            На главную
          </button>

          {error.digest ? (
            <p style={{ fontSize: 13, color: "#a1a1aa", marginTop: 20 }}>Код ошибки: {error.digest}</p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
