"use client";

import { useEffect, useState } from "react";
import { getDisplayMode } from "@/components/YandexMetrika";
import { OPEN_INSTALL_EVENT } from "@/components/PWAInstall";

/**
 * Постоянная точка входа «Установить приложение» (футер). Открывает ту же
 * карточку, что и автопоказ, через OPEN_INSTALL_EVENT. В установленном PWA
 * (standalone) скрыта — устанавливать уже нечего.
 */
export default function InstallAppButton() {
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
