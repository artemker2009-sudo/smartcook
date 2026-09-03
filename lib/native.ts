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

import { useSyncExternalStore, type ChangeEvent } from "react";

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

// Реактивный флаг «мы в любой нативной оболочке» (сейчас это только iOS).
export function useIsNative(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => isNativePlatform(),
    () => false,
  );
}

// ---------------------------------------------------------------------------
// Нативные возможности. Все плагины грузятся ДИНАМИЧЕСКИ и только внутри
// нативной ветки: в вебе этот код не выполняется, а бандл не тащит Capacitor.
// ---------------------------------------------------------------------------

// Снимок или картинка из галереи через нативный плагин камеры.
//
// Возвращает обычный File — дальше он идёт в тот же пайплайн lib/photo.ts
// (сжатие, чистка EXIF), что и файл из <input type="file">. На вебе возвращает
// null: вызывающий код должен откатиться на <input>.
//
// CameraSource.Prompt — системный экшен-шит «Сделать снимок / Выбрать из
// галереи». Именно нативный выбор, а не браузерный пикер, и есть тот
// device capability, ради которого всё затевалось (App Store 4.2). Заодно
// системный декодер отдаёт JPEG вместо HEIC, поэтому на iOS не нужен наш
// ленивый heic2any-декод.
export type PhotoSource = "prompt" | "camera" | "photos";

export async function pickImageNative(source: PhotoSource = "prompt"): Promise<File | null> {
  if (!isNativePlatform()) return null;
  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      // Экраны, где уже есть отдельные кнопки «Снять фото» / «Из галереи»,
      // просят конкретный источник — лишний системный экшен-шит не нужен.
      source:
        source === "camera"
          ? CameraSource.Camera
          : source === "photos"
            ? CameraSource.Photos
            : CameraSource.Prompt,
      // Подписи системного экшен-шита — по-русски.
      promptLabelHeader: "Фото",
      promptLabelPhoto: "Выбрать из галереи",
      promptLabelPicture: "Сделать снимок",
      promptLabelCancel: "Отмена",
    });
    if (!photo?.webPath) return null;
    const blob = await fetch(photo.webPath).then((r) => r.blob());
    const format = photo.format || "jpeg";
    return new File([blob], `photo_${Date.now()}.${format}`, {
      type: blob.type || `image/${format}`,
    });
  } catch {
    // Пользователь нажал «Отмена» или отказал в доступе — это не ошибка.
    return null;
  }
}

// Мостик к существующим обработчикам <input type="file">.
//
// Все точки загрузки фото в приложении уже умеют принимать ChangeEvent от
// инпута и дальше гонят файл через lib/photo.ts. Чтобы не переписывать шесть
// экранов, нативно выбранный File подсовывается в тот же обработчик под видом
// события. Обработчики читают только target.files (и иногда сбрасывают value),
// поэтому подделки достаточно.
//
// Возвращает true, если всё обработано нативно (в том числе когда пользователь
// нажал «Отмена» — тогда открывать веб-пикер поверх нельзя). false — мы в вебе,
// вызывающий код должен кликнуть по своему <input>.
export async function pickImageIntoInputHandler(
  handler: (event: ChangeEvent<HTMLInputElement>) => unknown,
  source: PhotoSource = "prompt",
): Promise<boolean> {
  if (!isNativePlatform()) return false;
  const file = await pickImageNative(source);
  if (file) {
    // Обработчики читают только target.files (и иногда сбрасывают value),
    // поэтому минимального объекта достаточно. Приведение осознанное.
    await handler({
      target: { files: [file], value: "" },
    } as unknown as ChangeEvent<HTMLInputElement>);
  }
  return true;
}

// Системный share sheet. true — поделились (или системное окно открылось),
// false — мы не в нативе и вызывающий код должен использовать веб-путь
// (navigator.share / копирование ссылки).
export async function shareNative(input: {
  title?: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
}): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const { Share } = await import("@capacitor/share");
    await Share.share({
      title: input.title,
      text: input.text,
      url: input.url,
      dialogTitle: input.dialogTitle ?? "Поделиться",
    });
    return true;
  } catch {
    // Отмена в share sheet приходит исключением — для нас это тоже «обработано».
    return true;
  }
}

// Внешняя ссылка (Kuper, Telegram, RuStore, донат) — в системный браузер, а не
// внутрь WebView. Иначе пользователь оказывается «в браузере внутри приложения»:
// это и выглядит как сайт, и попадает под претензии App Store 4.2.
// Возвращает false на вебе — там ссылка открывается обычным способом.
export async function openExternal(url: string): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url, presentationStyle: "popover" });
    return true;
  } catch {
    return false;
  }
}

// Убрать стартовый экран. Вызывается, когда сайт реально отрисовался.
export async function hideSplash(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {}
}

// Статус-бар: тёмные иконки на светлом фоне приложения.
export async function initStatusBar(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Light });
  } catch {}
}
