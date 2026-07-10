"use client";

import React, { useEffect, useState } from "react";
import { X, Download, Share, Plus, Smartphone, MoreVertical } from "lucide-react";
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

type Platform = "ios" | "android" | "other";

/**
 * Мягкий промпт установки PWA в нашем дизайн-языке. Открывается двумя путями:
 * автоматически в момент успеха (после первой генерации) и вручную по постоянной
 * точке входа «Установить приложение» в футере — оба через один и тот же
 * компонент {@link "@/components/PWAInstall"}.
 *
 * Android/Chrome: если пойман beforeinstallprompt — жмём нативный промпт; иначе
 * (событие ещё не прилетело или браузер его не даёт) показываем инструкцию для
 * меню браузера. iOS: события нет вовсе — сразу наглядная инструкция Share → «На
 * экран „Домой“». Факт установки трекается глобально (appinstalled /
 * standalone-запуск), поэтому здесь цель accepted не шлём.
 */
export default function InstallPromptCard({ open, onClose }: InstallPromptCardProps) {
  const [platform, setPlatform] = useState<Platform>("other");
  const [help, setHelp] = useState<null | "ios" | "android">(null);

  useEffect(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    if (/iphone|ipad|ipod/i.test(ua)) setPlatform("ios");
    else if (/android/i.test(ua)) setPlatform("android");
    else setPlatform("other");
  }, []);

  useEffect(() => {
    if (open) {
      reachGoal("pwa_install_prompt_shown");
      setHelp(null); // при каждом открытии показываем карточку, а не старую инструкцию
    }
  }, [open]);

  if (!open) return null;

  const isIOS = platform === "ios";

  const handleInstall = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice; // факт установки ловим глобально (appinstalled)
      } catch {
        /* пользователь мог закрыть — не ошибка */
      }
      deferredPrompt = null;
      onClose();
      return;
    }
    // Нативного промпта нет: iOS никогда его не даёт, Android — если событие ещё
    // не прилетело или браузер не поддерживает. Показываем инструкцию под платформу.
    setHelp(isIOS ? "ios" : "android");
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

      {help === null ? (
        <button className="btn-primary install-btn" onClick={handleInstall}>
          {deferredPrompt ? <Download size={18} /> : <Share size={18} />}
          {deferredPrompt ? "Установить" : "Как установить"}
        </button>
      ) : help === "ios" ? (
        <div className="install-help">
          <div className="install-help-step">
            <span className="install-help-ico"><Share size={16} /></span>
            <span>Нажмите «Поделиться» в нижней панели Safari</span>
          </div>
          <div className="install-help-step">
            <span className="install-help-ico"><Plus size={16} /></span>
            <span>Выберите «На экран „Домой“»</span>
          </div>
        </div>
      ) : (
        <div className="install-help">
          <div className="install-help-step">
            <span className="install-help-ico"><MoreVertical size={16} /></span>
            <span>Откройте меню браузера (⋮ справа вверху)</span>
          </div>
          <div className="install-help-step">
            <span className="install-help-ico"><Plus size={16} /></span>
            <span>Выберите «Добавить на главный экран»</span>
          </div>
        </div>
      )}
    </div>
  );
}
