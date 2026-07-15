"use client";

import { useEffect, useState } from "react";
import { X, ExternalLink } from "lucide-react";
import { reachGoal } from "@/lib/metrika";
import { RUSTORE_URL } from "@/lib/constants";
import { getDisplayMode } from "@/components/YandexMetrika";

// Показываем плашку не чаще одного раза за сессию вкладки.
const SESSION_FLAG = "sc_tg_webview_banner_shown";

type Detect = { inApp: boolean; isAndroid: boolean };

/**
 * Определяем, открыт ли сайт внутри встроенного браузера мессенджера (в первую
 * очередь — Telegram), опираясь ТОЛЬКО на userAgent, без хрупких хаков.
 *
 * Что реально можно определить по UA:
 *  - Android: встроенный браузер Telegram — это системный WebView, и его UA
 *    несёт стандартный маркер «; wv» (Android System WebView). Обычный Chrome,
 *    Chrome Custom Tabs и Samsung Internet этого токена НЕ имеют, поэтому «wv»
 *    надёжно отделяет «сайт открыт внутри приложения» от нормального браузера.
 *    Наш собственный TWA из RuStore тоже WebView, но он запускается в
 *    standalone и отсекается проверкой getDisplayMode() ниже.
 *
 * Чего по UA определить НЕЛЬЗЯ (честно — не покрываем):
 *  - iOS: встроенный браузер Telegram не добавляет в userAgent никакого своего
 *    признака (подтверждённая проблема Telegram-iOS #736 — UA неотличим от
 *    Safari). Надёжно отличить его от обычного Safari по одному UA невозможно,
 *    поэтому на iOS плашку не показываем вовсе, чтобы не пугать пользователей
 *    обычного Safari ложной тревогой.
 *
 * Итог: покрываем только определимый случай — Android in-app WebView.
 */
function detectInAppWebView(): Detect {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isAndroid = /android/i.test(ua);
  // Токен «; wv» — стандартный маркер Android System WebView (в т.ч. встроенного
  // браузера Telegram). Границы слова, чтобы не поймать «wv» внутри других слов.
  const isAndroidWebView = isAndroid && /;\s*wv\b/i.test(ua);
  return { inApp: isAndroidWebView, isAndroid };
}

/**
 * Ненавязчивая плашка сверху для тех, кто открыл SmartCook внутри встроенного
 * браузера Telegram: оттуда сайт легко потерять навсегда. Зовём открыть в
 * обычном браузере, а на Android — ещё и поставить приложение из RuStore.
 *
 * Правила показа: один раз за сессию, никогда в standalone (установленное
 * приложение / TWA), только в определимом in-app WebView. Плашка не блокирует
 * контент (без затемнения) и закрывается крестиком.
 */
export default function TelegramWebViewBanner() {
  const [visible, setVisible] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    // В установленном приложении/TWA звать «в браузер» бессмысленно.
    if (getDisplayMode() === "standalone") return;

    const { inApp, isAndroid } = detectInAppWebView();
    if (!inApp) return;

    try {
      if (sessionStorage.getItem(SESSION_FLAG)) return;
      sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      /* приватный режим — покажем плашку, трекинг «раз в сессию» не критичен */
    }

    setIsAndroid(isAndroid);
    setVisible(true);
    reachGoal("tg_webview_shown");
  }, []);

  if (!visible) return null;

  const openInBrowser = () => {
    reachGoal("tg_webview_open_browser");
    // Из встроенного WebView нет гарантированного способа форсировать системный
    // браузер, поэтому — лучшее усилие: открываем текущий адрес новой вкладкой.
    // Многие in-app браузеры на такой вызов передают ссылку системному браузеру.
    try {
      window.open(window.location.href, "_blank", "noopener,noreferrer");
    } catch {
      /* не вышло — пользователь всё равно увидел подсказку «откройте в браузере» */
    }
  };

  return (
    <div className="tg-banner" role="region" aria-label="Открыть в браузере">
      <div className="tg-banner-body">
        <span className="tg-banner-text">
          Откройте в браузере, чтобы SmartCook не потерялся
        </span>
        <div className="tg-banner-actions">
          <button className="tg-banner-btn" onClick={openInBrowser}>
            <ExternalLink size={15} />
            Открыть в браузере
          </button>
          {isAndroid && (
            <a
              className="tg-banner-btn tg-banner-btn-secondary"
              href={RUSTORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => reachGoal("tg_webview_rustore_click")}
            >
              Установить из RuStore
            </a>
          )}
        </div>
      </div>
      <button
        className="tg-banner-close"
        aria-label="Закрыть"
        onClick={() => setVisible(false)}
      >
        <X size={18} />
      </button>
    </div>
  );
}
