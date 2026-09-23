// Откуда человек зашёл: сайт, приложение из App Store или приложение из
// RuStore. Три значения, которые пишутся в статистику и уходят в Метрику.
//
// ОТКУДА БЕРЁТСЯ ОТВЕТ. Своего детектора здесь нет и быть не должно: среду уже
// определяет lib/installEnv (detectInstallEnv), и формула обязана оставаться
// ОДНОЙ на все ветки — ровно ради этого делался PR #99. Здесь только перевод
// пяти состояний среды в три платформы.
//
// ЧТО ПРОВЕРЕНО РАНТАЙМОМ (23.09.2026, симулятор iOS 26.5, сборка Capacitor с
// удалённым server.url): мост Capacitor в WKWebView ДОСТУПЕН, хотя WebView
// грузит живой сайт, а не локальный бандл. Признак — footer, который
// components/Footer.tsx прячет по useIsNative(): в Safari на том же адресе он
// есть, в приложении его нет. Значит window.Capacitor.isNativePlatform()
// отвечает правду, и appendUserAgent для определения iOS НЕ НУЖЕН.
//
// TWA из RuStore Capacitor не видит вовсе (TWA — это Chrome), её опознаёт
// referrer android-app:// — см. detectInstallEnv.

import type { InstallEnv } from "./installEnv";

/** Платформа захода. Значения совпадают с CHECK-ограничением в миграции. */
export type Platform = "web" | "ios_app" | "android_twa";

export const PLATFORMS: readonly Platform[] = ["web", "ios_app", "android_twa"] as const;

/** Человеческое название для админки. */
export const PLATFORM_LABELS: Record<Platform, string> = {
  web: "Сайт",
  ios_app: "Приложение iOS",
  android_twa: "Приложение Android (RuStore)",
};

/** Новый человек на этом устройстве или уже заходил. */
export type VisitorKind = "new" | "returning";

export const VISITOR_KINDS: readonly VisitorKind[] = ["new", "returning"] as const;

/**
 * Среда → платформа. null означает «ещё не знаем» и запрещает запись: до того,
 * как Capacitor опрошен, среда приходит как "unknown", и засчитать такой заход
 * как «сайт» — значит систематически занижать долю приложений.
 *
 * PWA (сайт с домашнего экрана) намеренно считается сайтом: это тот же браузер
 * и тот же origin, отдельной платформой его не просили. Детектор различает его
 * и дальше — если понадобится четвёртая колонка, достаточно строки здесь.
 */
export function platformFromEnv(env: InstallEnv): Platform | null {
  switch (env) {
    case "unknown":
      return null;
    case "native-ios":
      return "ios_app";
    // Нативной Android-оболочки на Capacitor у нас нет и не собирается —
    // Android едет через TWA. Если она когда-нибудь появится, ей нужно СВОЁ
    // значение: подмешать её к android_twa значит испортить счётчик RuStore, а
    // к ios_app — соврать про платформу. До тех пор не записываем.
    case "native-android":
      return null;
    case "twa":
      return "android_twa";
    case "pwa":
    case "browser":
      return "web";
  }
}

/** Значение из запроса — платформа или null. Клиенту не верим. */
export function parsePlatform(raw: unknown): Platform | null {
  return typeof raw === "string" && (PLATFORMS as readonly string[]).includes(raw)
    ? (raw as Platform)
    : null;
}

/** Значение из запроса — вид посетителя или null. Клиенту не верим. */
export function parseVisitorKind(raw: unknown): VisitorKind | null {
  return typeof raw === "string" && (VISITOR_KINDS as readonly string[]).includes(raw)
    ? (raw as VisitorKind)
    : null;
}
