"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { X } from "lucide-react";

import { reachGoal } from "@/lib/metrika";
import { RUSTORE_URL } from "@/lib/constants";
import { useCanPromptInstall } from "@/lib/installEnv";
import {
  APP_STRIP_DAYS,
  APP_STRIP_KEY,
  currentPlatform,
  isSnoozedNow,
  snooze,
} from "@/lib/installBanner";

/**
 * Компактная строка «Удобнее в приложении → RuStore» наверху внутренних
 * экранов (/shopping и /ideas).
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ КОМПОНЕНТ, а не ещё один слот большой плашки InstallBanner.
 * Большая плашка — всплывающая карточка внизу экрана с кнопкой и правилом «не
 * мешать в момент ценности»: она ждёт готового рецепта, считает прокрутку,
 * живёт один раз за сессию вкладки. Здесь задача другая и проще: тихая строка в
 * потоке документа, которая всегда на месте и ничего не перекрывает. Смешивать
 * два таких поведения в одном компоненте значило бы получить третье, которое не
 * работает толком ни там, ни там.
 *
 * КОМУ ПОКАЗЫВАЕМ. Ровно то же условие, что у бейджа RuStore на Главной:
 *  - Android по userAgent — приложение живёт в RuStore, iPhone получает свой
 *    Smart App Banner от самого Safari (meta apple-itunes-app в layout), а на
 *    десктопе ставить нечего;
 *  - только обычный браузер: useCanPromptInstall даёт false и в TWA из RuStore,
 *    и в нативной оболочке, и в PWA с домашнего экрана. Звать в стор того, кто
 *    уже внутри приложения, — ровно тот баг, ради которого делался installEnv.
 *
 * ПОСЛЕ КРЕСТИКА молчим 30 дней (APP_STRIP_KEY, своя пауза — см. installBanner).
 *
 * Цели Метрики берём существующие, семейство install_banner_*, и различаем
 * точку показа параметром place: "strip". Заводить новые цели ради той же
 * воронки значит разорвать её на две несравнимые половины.
 */

// ---------------------------------------------------------------------------
// Право на показ как внешнее хранилище
// ---------------------------------------------------------------------------
//
// Ответ зависит от userAgent и localStorage — их нет ни на сервере, ни на кадре
// гидрации, поэтому «показывать» может стать истиной только после монтирования.
// Напрашивается useState + useEffect, но синхронный setState в эффекте — это
// каскадный ре-рендер на каждом монтировании (и ошибка правила
// react-hooks/set-state-in-effect). Поэтому та же схема, что в lib/installEnv:
// useSyncExternalStore с пессимистичным серверным снапшотом.
//
// Значение кэшируем: getSnapshot обязан возвращать СТАБИЛЬНЫЙ результат, иначе
// React зациклится. Сбрасывает кэш только крестик.

let cached: boolean | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): boolean {
  if (cached === null) {
    cached = currentPlatform() === "android" && !isSnoozedNow(APP_STRIP_KEY);
  }
  return cached;
}

/** Сервер и кадр гидрации: молчим. Ошибка в эту сторону — строка появится
 *  кадром позже; в другую — мигание у того, кто её уже закрыл. */
function getServerSnapshot(): boolean {
  return false;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Крестик: гасим строку сразу во всех смонтированных копиях. */
function dismissAll(): void {
  cached = false;
  for (const l of listeners) l();
}

export default function AppPromoStrip() {
  const canPrompt = useCanPromptInstall();
  const allowed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const visible = canPrompt && allowed;

  // Показ в Метрику — один раз за монтирование, из эффекта: это уже побочное
  // действие во внешнюю систему, а не изменение состояния React.
  const reported = useRef(false);
  useEffect(() => {
    if (!visible || reported.current) return;
    reported.current = true;
    reachGoal("install_banner_shown", { platform: "android", place: "strip" });
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="app-strip" role="region" aria-label="Приложение SmartCook">
      <a
        className="app-strip-link"
        href={RUSTORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => reachGoal("install_banner_rustore_click", { place: "strip" })}
      >
        <span className="app-strip-mark" aria-hidden>RS</span>
        <span className="app-strip-text">
          Удобнее в приложении <span className="app-strip-arrow" aria-hidden>→</span>{" "}
          <b>RuStore</b>
        </span>
      </a>
      {/* Крестик вторичен: он не должен спорить с самой ссылкой. */}
      <button
        type="button"
        className="app-strip-close"
        aria-label="Скрыть"
        onClick={() => {
          snooze(APP_STRIP_DAYS, APP_STRIP_KEY);
          reachGoal("install_banner_dismissed", { platform: "android", place: "strip" });
          dismissAll();
        }}
      >
        <X size={15} />
      </button>
    </div>
  );
}
