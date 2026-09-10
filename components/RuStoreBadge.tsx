"use client";

import { useEffect, useState } from "react";
import { reachGoal } from "@/lib/metrika";
import { RUSTORE_URL } from "@/lib/constants";
import { useCanPromptInstall } from "@/lib/installEnv";

/**
 * Компактная вторичная плашка «Скачайте в RuStore» на первом экране Главной.
 *
 * Показываем ТОЛЬКО там, где это уместно:
 *  - только Android (по userAgent) — приложение живёт в RuStore, iOS/десктопу
 *    ссылка бесполезна;
 *  - только в браузере, а НЕ в уже установленном приложении — тем, кто внутри
 *    апки, звать в стор незачем.
 *
 * Проверку среды делает общий useCanPromptInstall (lib/installEnv). Раньше
 * здесь стояла СВОЯ, более слабая формула — один только matchMedia
 * display-mode: standalone. Она не ловила ни TWA, деградировавшую в Custom Tab
 * (там display-mode остаётся browser, а признак — реферер android-app://), ни
 * minimal-ui. Расхождение формул и было причиной того, что бейдж показывался
 * тем, кто уже установил приложение.
 *
 * Платформу по-прежнему определяем после монтирования (useEffect): userAgent на
 * сервере недоступен, поэтому первый рендер всегда пустой.
 *
 * H7: это второстепенный элемент — не должен конкурировать с главной CTA, поэтому
 * визуально тихий (стиль .rustore-badge). Клик шлём в Метрику целью
 * rustore_badge_click через общий reachGoal (как nav_* / cta_*).
 */
export default function RuStoreBadge() {
  const canPrompt = useCanPromptInstall();
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    setIsAndroid(/android/i.test(ua));
  }, []);

  if (!canPrompt || !isAndroid) return null;

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
