"use client";

import { useEffect, useState } from "react";
import { reachGoal } from "@/lib/metrika";
import { RUSTORE_URL } from "@/lib/constants";

/**
 * Компактная вторичная плашка «Скачайте в RuStore» на первом экране Главной.
 *
 * Показываем ТОЛЬКО там, где это уместно:
 *  - только Android (по userAgent) — приложение живёт в RuStore, iOS/десктопу
 *    ссылка бесполезна;
 *  - только в браузере, а НЕ в уже установленном приложении (TWA/PWA запускается
 *    в display-mode: standalone) — тем, кто уже внутри апки, звать в стор незачем.
 *
 * Определение делаем после монтирования (useEffect), чтобы не разъехались
 * SSR/CSR-разметка: на сервере userAgent/matchMedia недоступны, поэтому первый
 * рендер всегда пустой, а решение показать плашку принимает клиент.
 *
 * H7: это второстепенный элемент — не должен конкурировать с главной CTA, поэтому
 * визуально тихий (стиль .rustore-badge). Клик шлём в Метрику целью
 * rustore_badge_click через общий reachGoal (как nav_* / cta_*).
 */
export default function RuStoreBadge() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isAndroid = /android/i.test(ua);
    const isStandalone =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches;
    setShow(isAndroid && !isStandalone);
  }, []);

  if (!show) return null;

  return (
    <a
      className="rustore-badge"
      href={RUSTORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => reachGoal("rustore_badge_click")}
    >
      <span className="rustore-badge-mark" aria-hidden>RS</span>
      <span className="rustore-badge-text">Скачайте в&nbsp;RuStore</span>
    </a>
  );
}
