"use client";

import { useIsNative } from "@/lib/native";

import { useEffect, useState } from "react";
import { getDisplayMode } from "@/components/YandexMetrika";
import { OPEN_INSTALL_EVENT } from "@/components/PWAInstall";

/**
 * Постоянная точка входа «Установить приложение» (футер). Открывает ту же
 * карточку, что и автопоказ, через OPEN_INSTALL_EVENT. В установленном PWA
 * (standalone) скрыта — устанавливать уже нечего.
 */
function InstallAppButtonInner() {
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(getDisplayMode() === "standalone");
  }, []);

  if (standalone) return null;

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_INSTALL_EVENT))}
      style={{
        color: "var(--color-text-secondary)",
        fontSize: "var(--font-size-caption)",
        fontWeight: "var(--font-weight-medium)",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontFamily: "inherit",
      }}
    >
      📲 Установить приложение
    </button>
  );
}

// В нативной оболочке звать «установить приложение» бессмысленно — мы уже внутри
// приложения. Обёртка вынесена отдельным компонентом намеренно: ранний return
// внутри InstallAppButtonInner менял бы число вызванных хуков между первым рендером
// (флаг ещё false) и следующим, а это ошибка React. Здесь хук ровно один и
// вызывается всегда. В вебе флаг всегда false — поведение не меняется.
export default function InstallAppButton() {
  const isNative = useIsNative();
  if (isNative) return null;
  return <InstallAppButtonInner />;
}
