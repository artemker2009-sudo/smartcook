"use client";

import React, { useEffect, useState } from "react";
import { X, Download, Share, Plus, Smartphone } from "lucide-react";
import { reachGoal } from "@/lib/metrika";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Ловим событие как можно раньше на уровне модуля — оно может прилететь до
// монтирования карточки.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
  });
}

interface InstallPromptCardProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Мягкий промпт установки PWA в нашем дизайн-языке. Показывается родителем в
 * момент успеха (после первой генерации), не системным попапом. На Android/Chrome
 * жмёт нативный beforeinstallprompt; на iOS — краткая инструкция (там события нет).
 */
export default function InstallPromptCard({ open, onClose }: InstallPromptCardProps) {
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const ios = /iphone|ipad|ipod/i.test(ua);
    // @ts-ignore — navigator.standalone есть только в iOS Safari
    const standalone = (typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches) || (typeof navigator !== "undefined" && navigator.standalone);
    setIsIOS(ios && !standalone);
  }, []);

  useEffect(() => {
    if (open) reachGoal("pwa_install_prompt_shown");
  }, [open]);

  if (!open) return null;

  const handleInstall = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") reachGoal("pwa_install_accepted");
      } catch {
        /* пользователь мог закрыть — не ошибка */
      }
      deferredPrompt = null;
      onClose();
    } else if (isIOS) {
      setShowIOSHelp(true);
    } else {
      // Фолбэк для браузеров без beforeinstallprompt — краткая подсказка.
      setShowIOSHelp(true);
    }
  };

  return (
    <div className="install-card" role="dialog" aria-label="Установить SmartCook">
      <button className="install-close" aria-label="Закрыть" onClick={onClose}>
        <X size={18} />
      </button>
      <div className="install-row">
        <span className="install-icon">
          <Smartphone size={22} />
        </span>
        <div className="install-text">
          <div className="install-title">Добавьте SmartCook на экран</div>
          <div className="install-sub">И ужин будет в одном тапе — без поиска в браузере.</div>
        </div>
      </div>

      {!showIOSHelp ? (
        <button className="btn-primary install-btn" onClick={handleInstall}>
          {isIOS ? <Share size={18} /> : <Download size={18} />}
          {isIOS ? "Как установить" : "Установить"}
        </button>
      ) : (
        <div className="install-ios-help">
          <div className="install-ios-step">
            <Share size={16} /> 1. Нажмите «Поделиться» внизу браузера
          </div>
          <div className="install-ios-step">
            <Plus size={16} /> 2. Выберите «На экран „Домой“»
          </div>
        </div>
      )}
    </div>
  );
}
