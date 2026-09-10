"use client";

import { OPEN_INSTALL_EVENT } from "@/components/PWAInstall";
import { useCanPromptInstall } from "@/lib/installEnv";

/**
 * Постоянная точка входа «Установить приложение» (футер). Открывает ту же
 * карточку установки через OPEN_INSTALL_EVENT.
 *
 * Раньше видимость считалась через useState(false) + useEffect, и это давало
 * ровно то мигание, ради которого затевалась правка: на кадре гидрации
 * состояние «не standalone» означало «показать», поэтому в установленном
 * приложении кнопка успевала мелькнуть в футере до первого эффекта. Теперь
 * решает общий флаг, у которого дефолт обратный — молчать, пока среда не
 * определена.
 */
function InstallAppButtonInner() {
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

// Кнопка видна только в обычном браузере: в нативной оболочке, в TWA из
// RuStore и в установленном PWA устанавливать уже нечего.
export default function InstallAppButton() {
  const canPrompt = useCanPromptInstall();
  if (!canPrompt) return null;
  return <InstallAppButtonInner />;
}
