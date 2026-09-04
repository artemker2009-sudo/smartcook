"use client";

import { useEffect } from "react";
import Link from "next/link";
import DocPage from "@/components/DocPage";

// Экран ошибки для любой страницы приложения (Next App Router: error.tsx ловит
// исключения рендера ниже по дереву, root-layout при этом остаётся живым).
//
// До этого файла Next показывал свой дефолт — английский, без шапки и без
// выхода. Проверяющий App Store, наткнувшись на такой экран, видит не «в
// приложении сбой», а «приложение сломано и говорит не на том языке».
//
// Оформление — то же, что у /privacy и /about (DocPage): общая шапка-меню, та
// же типографика, футер из layout. Два действия: «Попробовать снова» (штатный
// reset Next — повторный рендер того же сегмента) и «На главную».
//
// error.tsx обязан быть клиентским компонентом — это требование Next.

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // В консоль — чтобы сбой было видно в логах Vercel и в веб-инспекторе.
    // Отдельную телеметрию сюда НЕ вешаем: /api/report-error — ручной канал
    // («Сообщить об ошибке»), и автоматический поток забил бы его шумом.
    console.error("[app error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <DocPage title="Что-то пошло не так">
      <p>
        Мы не смогли открыть эту страницу. Скорее всего, это временный сбой —
        попробуйте ещё раз.
      </p>
      <p>
        Если повторяется, вернитесь на главную и напишите нам через{" "}
        <a href="/support">Поддержку</a>: мы отвечаем в течение суток.
      </p>
      {/* digest — короткий идентификатор сбоя на стороне сервера. Пользователю
          он ничего не говорит, но в письме в поддержку экономит нам полчаса. */}
      {error.digest ? (
        <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text-muted)" }}>
          Код ошибки: {error.digest}
        </p>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-5)" }}>
        <button type="button" className="btn-primary" onClick={reset}>
          Попробовать снова
        </button>
        <Link href="/" className="btn-secondary" style={{ textDecoration: "none" }}>
          На главную
        </Link>
      </div>
    </DocPage>
  );
}
