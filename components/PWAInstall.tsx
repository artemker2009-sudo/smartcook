"use client";

import { useEffect, useState } from "react";
import InstallPromptCard from "@/components/InstallPromptCard";
import { reachGoal } from "@/lib/metrika";
import { getDisplayMode } from "@/components/YandexMetrika";

// Кастомное событие открытия карточки установки. Диспатчится из автопоказа
// (SearchApp, момент успеха) и из постоянной точки входа в футере
// (InstallAppButton). Слушается здесь — единственная смонтированная карточка.
export const OPEN_INSTALL_EVENT = "sc:open-install";

const STANDALONE_FLAG = "sc_pwa_standalone_launched";

/**
 * Глобальный узел установки PWA: смонтирован в layout на всех страницах.
 *
 * 1) Трекинг установок:
 *    - appinstalled → pwa_install_accepted (Android/desktop, независимо от того,
 *      откуда пришла установка — из нашей карточки или из меню браузера);
 *    - первый запуск в standalone → pwa_standalone_launch один раз (флаг в
 *      localStorage). Это наш прокси iOS-установок: iOS не шлёт ни
 *      beforeinstallprompt, ни appinstalled, но запуск с домашнего экрана = факт
 *      установки.
 * 2) Рендер единственной карточки установки, открываемой по OPEN_INSTALL_EVENT.
 */
export default function PWAInstall() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onInstalled = () => reachGoal("pwa_install_accepted");
    window.addEventListener("appinstalled", onInstalled);

    try {
      if (getDisplayMode() === "standalone" && !localStorage.getItem(STANDALONE_FLAG)) {
        localStorage.setItem(STANDALONE_FLAG, "1");
        reachGoal("pwa_standalone_launch");
      }
    } catch {
      /* приватный режим/заблокированный localStorage — трекинг не критичен */
    }

    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_INSTALL_EVENT, onOpen);

    return () => {
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener(OPEN_INSTALL_EVENT, onOpen);
    };
  }, []);

  return <InstallPromptCard open={open} onClose={() => setOpen(false)} />;
}
