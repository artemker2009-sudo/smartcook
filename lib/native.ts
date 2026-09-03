"use client";

// Определение нативной оболочки (Capacitor) БЕЗ зависимости от @capacitor/core.
//
// Веб-сборка про Capacitor ничего не знает и знать не должна — никаких новых
// пакетов в package.json. Когда сайт открыт внутри нативной iOS-оболочки
// (Capacitor WebView), рантайм инжектирует глобальный объект `window.Capacitor`
// с методами isNativePlatform()/getPlatform(). Мы читаем именно его. В обычном
// браузере глобала нет — все функции возвращают «веб», и поведение сайта не
// меняется ни на йоту.
//
// Зачем: часть требований App Store расходится с вебом (нельзя внешние донаты,
// нельзя гейт функции за подписку на сторонний канал). Эти ветки включаются
// ТОЛЬКО в нативном iOS — по флагу отсюда. Android-обёртка (TWA) сюда не
// попадает: TWA — это Chrome, `window.Capacitor` в нём нет.

import { useSyncExternalStore } from "react";

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

function cap(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  const c = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return c && typeof c === "object" ? c : null;
}

// "ios" | "android" | "web". В браузере (в т.ч. в Android-TWA) — всегда "web".
export function getNativePlatform(): "ios" | "android" | "web" {
  const p = cap()?.getPlatform?.();
  return p === "ios" || p === "android" ? p : "web";
}

// Запущены ли мы внутри нативной оболочки Capacitor (любой платформы).
export function isNativePlatform(): boolean {
  return cap()?.isNativePlatform?.() === true;
}

// Ключевой флаг для App Store-веток: именно нативный iOS.
export function isNativeIOS(): boolean {
  return getNativePlatform() === "ios";
}

// Реактивная версия для условного рендера. Через useSyncExternalStore: на сервере
// и во время гидрации отдаёт false (серверный снапшот совпадает с SSR-разметкой →
// нет hydration mismatch), а на клиенте сразу после гидрации перечитывает реальное
// значение. На вебе так и остаётся false; в нативном iOS становится true. Хранилище
// статично (платформа при жизни страницы не меняется), поэтому subscribe — no-op.
const emptySubscribe = () => () => {};

export function useIsNativeIOS(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => isNativeIOS(),
    () => false,
  );
}
