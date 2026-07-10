"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export const YANDEX_METRIKA_ID = 107027665;

const IS_DEV = process.env.NODE_ENV !== "production";
const TAG_SRC = "https://mc.yandex.ru/metrika/tag.js";

// Режим отображения приложения. Standalone = запущено как установленное PWA
// (с домашнего экрана) ИЛИ как TWA-обёртка из RuStore/Google Play, browser =
// обычная вкладка. Определяем все варианты:
// - matchMedia("display-mode: standalone") — Android/desktop-PWA и TWA;
// - navigator.standalone — iOS Safari, добавленное на экран «Домой»;
// - document.referrer "android-app://…" — TWA (страховка: браузерная обёртка
//   Play всегда стартует с этим реферером, даже если display-mode ещё не успел
//   примениться на самой первой навигации).
// Все три — только на увеличение: любой true прячет карточку/кнопку установки,
// что и требуется в установленном приложении и в TWA.
export function getDisplayMode(): "standalone" | "browser" {
  if (typeof window === "undefined") return "browser";
  const isStandalone =
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches) ||
    // iOS Safari, добавленное на домашний экран
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    // TWA (Android): запуск внутри нативной обёртки из стора
    (typeof document !== "undefined" &&
      document.referrer.startsWith("android-app://"));
  return isStandalone ? "standalone" : "browser";
}

type Diag = {
  displayMode: string;
  online: boolean;
  tag: "pending" | "ok" | "error";
  initCalled: boolean;
  ymReady: boolean;
  hits: number;
  lastHit: string;
  csp: string[];
};

/**
 * Яндекс.Метрика.
 *
 * ПОЧЕМУ init вынесен в useEffect, а не остаётся inline-скриптом:
 * в установленном PWA (standalone) холодный старт идёт через сервис-воркер и
 * отличается по таймингу от обычной вкладки. Ранее счётчик подключался через
 * next/script strategy="afterInteractive" — и в standalone инициализация могла
 * не отрабатывать. Здесь мы сами определяем стаб `ym`, подгружаем tag.js и
 * вызываем init после гидрации — гарантированно и во вкладке, и в PWA.
 *
 * Диагностика: открыть любой URL с ?debug=metrika — снизу появится оверлей со
 * статусом (display_mode, загрузка tag.js, вызов init, реальные запросы к
 * mc.yandex.*, нарушения CSP). Работает и в проде, но только по этому параметру.
 */
export default function YandexMetrika() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialized = useRef(false);
  const firstHitSkipped = useRef(false);

  const debug =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "metrika";
  const [diag, setDiag] = useState<Diag>({
    displayMode: "?",
    online: true,
    tag: "pending",
    initCalled: false,
    ymReady: false,
    hits: 0,
    lastHit: "",
    csp: [],
  });
  const patch = (p: Partial<Diag>) => setDiag((d) => ({ ...d, ...p }));

  // Держим свежий diag для колбэков (PerformanceObserver/CSP) без пересоздания.
  const diagRef = useRef(diag);
  diagRef.current = diag;

  // Инициализация счётчика (ровно один раз).
  useEffect(() => {
    if (initialized.current) return;
    if (typeof window === "undefined") return;
    initialized.current = true;

    type YmFn = ((...args: unknown[]) => void) & { a?: unknown[]; l?: number };
    const w = window as unknown as { ym?: YmFn };
    const displayMode = getDisplayMode();
    if (debug) patch({ displayMode, online: navigator.onLine });

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
        script.onload = () => {
          if (debug) patch({ tag: "ok" });
        };
        script.onerror = () => {
          if (debug) patch({ tag: "error" });
        };
        const first = document.getElementsByTagName("script")[0];
        first?.parentNode?.insertBefore(script, first);
      } else if (debug) {
        patch({ tag: "ok" });
      }
    } else if (debug) {
      patch({ tag: "ok" });
    }

    const ym = w.ym as YmFn;

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

    if (debug) patch({ initCalled: true, ymReady: typeof w.ym === "function" });
    if (IS_DEV) {
      // eslint-disable-next-line no-console
      console.log("[metrika] init", { id: YANDEX_METRIKA_ID, display_mode: displayMode });
    }
  }, [debug]);

  // Диагностика: реальные запросы к mc.yandex.* и нарушения CSP.
  useEffect(() => {
    if (!debug || typeof window === "undefined") return;

    const onCsp = (e: SecurityPolicyViolationEvent) => {
      if (/yandex/i.test(e.blockedURI) || /yandex/i.test(e.violatedDirective)) {
        patch({
          csp: [
            ...diagRef.current.csp,
            `${e.effectiveDirective || e.violatedDirective}: ${e.blockedURI}`,
          ].slice(-6),
        });
      }
    };
    document.addEventListener("securitypolicyviolation", onCsp);

    let observer: PerformanceObserver | undefined;
    try {
      observer = new PerformanceObserver((list) => {
        const yandexHits = list.getEntries().filter((e) => /mc\.yandex\.(ru|com)/.test(e.name));
        if (yandexHits.length) {
          const last = yandexHits[yandexHits.length - 1].name;
          patch({ hits: diagRef.current.hits + yandexHits.length, lastHit: last });
        }
      });
      observer.observe({ entryTypes: ["resource"] });
    } catch {
      /* PerformanceObserver может быть недоступен — не критично */
    }

    const onlineHandler = () => patch({ online: navigator.onLine });
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", onlineHandler);

    return () => {
      document.removeEventListener("securitypolicyviolation", onCsp);
      observer?.disconnect();
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", onlineHandler);
    };
  }, [debug]);

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

  if (!debug) return null;

  const row = (label: string, value: string, ok?: boolean) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ fontWeight: 600, color: ok === undefined ? "#fff" : ok ? "#34d399" : "#f87171" }}>
        {value}
      </span>
    </div>
  );

  return (
    <div
      style={{
        position: "fixed",
        left: 8,
        right: 8,
        bottom: 8,
        zIndex: 2147483647,
        background: "rgba(17,24,39,0.94)",
        color: "#fff",
        borderRadius: 12,
        padding: "12px 14px",
        fontSize: 12,
        lineHeight: 1.6,
        fontFamily: "ui-monospace, Menlo, monospace",
        boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Метрика · диагностика</div>
      {row("display_mode", diag.displayMode, diag.displayMode === "standalone" ? true : undefined)}
      {row("online", diag.online ? "да" : "нет", diag.online)}
      {row(
        "tag.js",
        diag.tag === "ok" ? "загружен" : diag.tag === "error" ? "ОШИБКА" : "…",
        diag.tag === "ok" ? true : diag.tag === "error" ? false : undefined,
      )}
      {row("init вызван", diag.initCalled ? "да" : "нет", diag.initCalled)}
      {row("window.ym", diag.ymReady ? "есть" : "нет", diag.ymReady)}
      {row("запросы к mc.yandex", String(diag.hits), diag.hits > 0)}
      {diag.lastHit ? (
        <div style={{ opacity: 0.6, wordBreak: "break-all", marginTop: 2 }}>{diag.lastHit.slice(0, 90)}</div>
      ) : null}
      {diag.csp.length ? (
        <div style={{ marginTop: 6, color: "#f87171", wordBreak: "break-all" }}>
          CSP заблокировал:
          {diag.csp.map((c, i) => (
            <div key={i}>• {c}</div>
          ))}
        </div>
      ) : (
        row("CSP-блокировки", "нет", true)
      )}
    </div>
  );
}
