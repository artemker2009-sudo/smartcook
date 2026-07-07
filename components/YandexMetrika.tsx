"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export const YANDEX_METRIKA_ID = 107027665;

const IS_DEV = process.env.NODE_ENV !== "production";
const TAG_SRC = "https://mc.yandex.ru/metrika/tag.js";

// Режим отображения приложения. Standalone = запущено как установленное PWA
// (с домашнего экрана), browser = обычная вкладка. Определяем оба варианта:
// matchMedia работает в Android/desktop-PWA, navigator.standalone — в iOS Safari.
export function getDisplayMode(): "standalone" | "browser" {
  if (typeof window === "undefined") return "browser";
  const isStandalone =
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches) ||
    // iOS Safari, добавленное на домашний экран
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return isStandalone ? "standalone" : "browser";
}

/**
 * Яндекс.Метрика.
 *
 * ПОЧЕМУ init вынесен в useEffect, а не остаётся inline-скриптом:
 * в установленном PWA (standalone) холодный старт идёт через сервис-воркер и
 * отличается по таймингу от обычной вкладки. Ранее счётчик подключался через
 * next/script strategy="afterInteractive" — и в standalone инициализация могла
 * не отрабатывать, поэтому Метрика не видела PWA-визиты, хотя Vercel их считал.
 * Здесь мы сами определяем стаб `ym`, подгружаем tag.js и вызываем init уже
 * после гидрации — это гарантированно выполняется и во вкладке, и в PWA.
 */
export default function YandexMetrika() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialized = useRef(false);
  const firstHitSkipped = useRef(false);

  // Инициализация счётчика (ровно один раз).
  useEffect(() => {
    if (initialized.current) return;
    if (typeof window === "undefined") return;
    initialized.current = true;

    type YmFn = ((...args: unknown[]) => void) & { a?: unknown[]; l?: number };
    const w = window as unknown as { ym?: YmFn };

    // Стаб очереди Метрики: вызовы буферизуются до загрузки tag.js.
    if (typeof w.ym !== "function") {
      const stub = ((...args: unknown[]) => {
        (stub.a = stub.a || []).push(args);
      }) as YmFn;
      stub.l = Date.now();
      w.ym = stub;

      const alreadyLoaded = Array.from(document.scripts).some((s) => s.src === TAG_SRC);
      if (!alreadyLoaded) {
        const script = document.createElement("script");
        script.async = true;
        script.src = TAG_SRC;
        const first = document.getElementsByTagName("script")[0];
        first?.parentNode?.insertBefore(script, first);
      }
    }

    const ym = w.ym as YmFn;
    const displayMode = getDisplayMode();

    ym(YANDEX_METRIKA_ID, "init", {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: true,
      // Визит-параметр в самом init — чтобы первый (авто)хит уже нёс режим.
      params: { display_mode: displayMode },
    });
    // Дублируем как визит-параметр: гарантированно привязывается к визиту и
    // позволяет сегментировать PWA-пользователей в интерфейсе Метрики.
    ym(YANDEX_METRIKA_ID, "params", { display_mode: displayMode });

    if (IS_DEV) {
      // eslint-disable-next-line no-console
      console.log("[metrika] init", { id: YANDEX_METRIKA_ID, display_mode: displayMode });
    }
  }, []);

  // SPA-навигация: hit при каждой смене маршрута. Первый рендер пропускаем —
  // за начальный pageview отвечает авто-хит из init выше (иначе двойной счёт).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as { ym?: (...args: unknown[]) => void };
    if (typeof w.ym !== "function") return;

    if (!firstHitSkipped.current) {
      firstHitSkipped.current = true;
      return;
    }

    const url = `${pathname}?${searchParams}`;
    const displayMode = getDisplayMode();
    w.ym(YANDEX_METRIKA_ID, "hit", url, { params: { display_mode: displayMode } });

    if (IS_DEV) {
      // eslint-disable-next-line no-console
      console.log("[metrika] hit", { url, display_mode: displayMode });
    }
  }, [pathname, searchParams]);

  return null;
}
