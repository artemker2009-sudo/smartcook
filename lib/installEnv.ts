"use client";

// Единственный источник правды о том, ГДЕ сейчас открыт SmartCook: в браузере
// или уже внутри установленного приложения.
//
// До этого файла ответ собирался в трёх местах и тремя разными формулами:
// getDisplayMode() внутри компонента аналитики, useIsNative() из lib/native и
// собственная урезанная проверка в RuStoreBadge (только matchMedia, без
// navigator.standalone и без referrer). Расхождение формул означало, что часть
// точек входа в установку показывалась тем, кто уже всё установил.
//
// Здесь логика чистая и проверяемая тестами: detectInstallEnv() принимает
// СЫРЫЕ сигналы и ничего не читает из глобалов сама.

import { useSyncExternalStore } from "react";

/**
 * Среда запуска. Пять исходов вместо старого булева «standalone или нет»:
 * различать их нужно и для правил показа, и для отладки — «плашка вылезла в
 * TWA» и «плашка вылезла в PWA» чинятся по-разному.
 *
 * "unknown" — не среда, а честное «ещё не знаем»: сервер и кадр гидрации, где
 * ни userAgent, ни display-mode, ни Capacitor недоступны. Ключевой момент: это
 * значение считается «нельзя показывать» (см. canPromptInstall), поэтому плашка
 * физически не может мелькнуть до того, как среда определена.
 */
export type InstallEnv =
  | "native-ios"     // нативная оболочка Capacitor, iOS
  | "native-android" // нативная оболочка Capacitor, Android (пока не собирается)
  | "twa"            // Trusted Web Activity из RuStore
  | "pwa"            // сайт, добавленный на домашний экран
  | "browser"        // обычная вкладка — единственное место, где плашка уместна
  | "unknown";       // сервер / кадр гидрации

/** Сырые сигналы среды. Отдельным типом — чтобы тесты подавали их руками. */
export type EnvSignals = {
  /** display-mode, которые сейчас matches (standalone, minimal-ui, fullscreen). */
  displayModes: readonly string[];
  /** navigator.standalone: iOS Safari с домашнего экрана. */
  navigatorStandalone: boolean;
  /** document.referrer: у TWA начинается с android-app://. */
  referrer: string;
  /** Capacitor.isNativePlatform(). */
  capacitorNative: boolean;
  /** Capacitor.getPlatform(): "ios" | "android" | "web". */
  capacitorPlatform: string;
};

/**
 * display-mode, при которых сайт уже выглядит как приложение. Не только
 * standalone: браузер вправе отдать minimal-ui или fullscreen, и человек с
 * иконкой на экране всё равно не должен видеть приглашение поставить иконку.
 */
const INSTALLED_DISPLAY_MODES = ["standalone", "minimal-ui", "fullscreen"];

/**
 * Среда по сырым сигналам. Порядок проверок не случаен — от самого надёжного
 * признака к самому слабому:
 *
 * 1. Capacitor — глобал инжектит сам рантайм оболочки, подделать нечем;
 * 2. referrer android-app:// — переживает случай, когда TWA деградировала в
 *    Custom Tab и display-mode остался browser: тогда это ЕДИНСТВЕННЫЙ признак
 *    того, что человек пришёл из установленного приложения;
 * 3. display-mode — обычные PWA и штатная TWA;
 * 4. navigator.standalone — iOS, где display-mode не работает.
 */
export function detectInstallEnv(s: EnvSignals): InstallEnv {
  if (s.capacitorNative) {
    return s.capacitorPlatform === "android" ? "native-android" : "native-ios";
  }
  if (s.referrer.startsWith("android-app://")) return "twa";
  if (s.displayModes.some((m) => INSTALLED_DISPLAY_MODES.includes(m))) return "pwa";
  if (s.navigatorStandalone) return "pwa";
  return "browser";
}

/**
 * Можно ли звать установить приложение. Единственное «да» — обычный браузер.
 *
 * "unknown" даёт false намеренно: на сервере и на кадре гидрации мы считаем,
 * что человек УЖЕ в приложении, и молчим. Ошибиться в эту сторону дёшево —
 * плашка появится кадром позже; ошибка в другую сторону — это как раз мигание
 * приглашения установить у того, кто уже установил.
 */
export function canPromptInstall(env: InstallEnv): boolean {
  return env === "browser";
}

/** Открыт ли SmartCook как установленное приложение (в любом из четырёх видов). */
export function isInstalledEnv(env: InstallEnv): boolean {
  return env !== "browser" && env !== "unknown";
}

// ---------------------------------------------------------------------------
// Чтение сигналов из настоящих глобалов
// ---------------------------------------------------------------------------

function matches(query: string): boolean {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

export function readSignals(): EnvSignals | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  }).Capacitor;
  return {
    displayModes: INSTALLED_DISPLAY_MODES.filter((m) => matches(`(display-mode: ${m})`)),
    navigatorStandalone:
      (window.navigator as unknown as { standalone?: boolean }).standalone === true,
    referrer: typeof document !== "undefined" ? document.referrer || "" : "",
    capacitorNative: cap?.isNativePlatform?.() === true,
    capacitorPlatform: cap?.getPlatform?.() ?? "web",
  };
}

/** Среда прямо сейчас. На сервере — "unknown". */
export function currentInstallEnv(): InstallEnv {
  const signals = readSignals();
  return signals ? detectInstallEnv(signals) : "unknown";
}

// ---------------------------------------------------------------------------
// Реактивная версия
// ---------------------------------------------------------------------------

// useSyncExternalStore требует, чтобы getSnapshot возвращал СТАБИЛЬНОЕ значение:
// строка пересчитывалась бы при каждом рендере и React зациклился бы. Поэтому
// держим кэш и сбрасываем его только по реальным событиям смены среды.
let cached: InstallEnv | null = null;

function getSnapshot(): InstallEnv {
  if (cached === null) cached = currentInstallEnv();
  return cached;
}

// Серверный снапшот — тот самый пессимистичный дефолт. Возвращает "unknown",
// а не "browser": именно это гарантирует, что разметка сервера и первого
// клиентского рендера совпадают И при этом не содержат плашки.
function getServerSnapshot(): InstallEnv {
  return "unknown";
}

/**
 * Подписка на смену среды. Среда почти всегда статична, но два случая реальны:
 * человек ставит PWA прямо сейчас (appinstalled), либо браузер применяет
 * display-mode после старта. Без подписки плашка осталась бы висеть у того, кто
 * только что установил приложение.
 */
function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const invalidate = () => {
    cached = null;
    onChange();
  };

  const lists: MediaQueryList[] = [];
  for (const mode of INSTALLED_DISPLAY_MODES) {
    try {
      const list = window.matchMedia(`(display-mode: ${mode})`);
      list.addEventListener("change", invalidate);
      lists.push(list);
    } catch {
      /* старый браузер без addEventListener на MediaQueryList — не критично */
    }
  }
  window.addEventListener("appinstalled", invalidate);

  return () => {
    for (const list of lists) list.removeEventListener("change", invalidate);
    window.removeEventListener("appinstalled", invalidate);
  };
}

/** Среда для условного рендера. На сервере и на кадре гидрации — "unknown". */
export function useInstallEnv(): InstallEnv {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Главный флаг для всех точек входа в установку: показывать приглашение или нет.
 * false на сервере, на кадре гидрации и в любой установленной среде.
 */
export function useCanPromptInstall(): boolean {
  return canPromptInstall(useInstallEnv());
}
