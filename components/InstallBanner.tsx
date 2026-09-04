"use client";

import { useIsNative } from "@/lib/native";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X, Smartphone, Share, Plus, Check } from "lucide-react";

import { reachGoal } from "@/lib/metrika";
import { RUSTORE_URL } from "@/lib/constants";
import { getDisplayMode } from "@/components/YandexMetrika";
import {
  CLICK_DAYS,
  DISMISS_DAYS,
  currentPlatform,
  isSnoozedNow,
  snooze,
  type InstallPlatform,
} from "@/lib/installBanner";

/**
 * Экран поиска сообщает: рецепт готов и отрисован. Раньше в этот момент
 * открывалась карточка установки — прямо поверх свежего рецепта, в секунду
 * ценности. Теперь это лишь сигнал «можно начинать отсчёт», а плашка ждёт, пока
 * человек рецепт посмотрит.
 */
export const RECIPE_READY_EVENT = "sc:recipe-ready";

// Плашку показываем не чаще раза за сессию вкладки — чтобы она не выпрыгивала
// заново на каждом переходе Главная ↔ Поиск.
const SESSION_FLAG = "sc_install_banner_session";

const HOME_DELAY_MS = 3000;  // на Главной: дать странице «устояться»
const AFTER_RECIPE_MS = 20000; // потолок ожидания после готового рецепта
const SCROLL_GRACE_MS = 1500; // экран сам скроллится к рецепту — не считать это чтением
const SEEN_SCROLL_PX = 240; // прокрутка, после которой считаем рецепт увиденным

/**
 * Умная плашка «Установите приложение». Смонтирована в layout, сама решает —
 * кому, где и когда показаться.
 *
 * КОМУ:
 *  - Android в браузере → «Скачайте приложение SmartCook из RuStore» + кнопка;
 *  - iOS в браузере → «Добавьте SmartCook на экран» + инструкция в два шага;
 *  - десктоп → никогда: приложения для него нет, а iOS-инструкция бессмысленна;
 *  - уже в приложении (PWA/TWA, display-mode: standalone) → никогда.
 *
 * ГДЕ И КОГДА (правило «не мешать в момент ценности»):
 *  - Главная — через {@link HOME_DELAY_MS} после загрузки, и только iOS: у
 *    Android на первом экране уже есть тихий бейдж RuStore в герое, второе
 *    приглашение туда же на том же экране только конкурировало бы с ним;
 *  - Поиск — молчим всю генерацию и не всплываем в секунду появления рецепта.
 *    Ждём {@link RECIPE_READY_EVENT}, а после него — пока человек рецепт
 *    полистает ({@link SEEN_SCROLL_PX}) или пока не выйдет {@link AFTER_RECIPE_MS};
 *  - на остальных экранах (готовый рецепт по ссылке, банкеты, покупки,
 *    админка) — не показываем вовсе.
 *
 * ПОСЛЕ ЗАКРЫТИЯ: крестик молчит две недели, уход в RuStore — дольше
 * (см. lib/installBanner). Факт установки ловится не здесь, а глобально в
 * PWAInstall (appinstalled / первый запуск в standalone).
 */
/**
 * Кто в принципе может увидеть плашку сейчас, или null. Решение принимает
 * клиент: на сервере нет ни userAgent, ни display-mode, ни localStorage.
 */
function resolveAudience(): InstallPlatform | null {
  if (getDisplayMode() === "standalone") return null; // уже в приложении — звать некуда
  const detected = currentPlatform();
  if (detected === "other") return null; // десктоп: ставить нечего
  if (isSnoozedNow()) return null; // закрыл раньше — молчим
  try {
    if (sessionStorage.getItem(SESSION_FLAG)) return null;
  } catch {
    /* приватный режим — покажем, «раз в сессию» не критично */
  }
  return detected;
}

function InstallBannerInner() {
  const pathname = usePathname();
  // Непустое состояние = плашка показана. Ставится не в теле эффекта, а из
  // таймера/обработчика в момент показа — синхронный setState в эффекте дал бы
  // каскадный ре-рендер на каждой навигации.
  //
  // Вместе с платформой запоминаем ЭКРАН показа: плашка живёт в layout и при
  // клиентской навигации сама не размонтируется, поэтому показанная на Главной
  // она уезжала с человеком на страницу рецепта — ровно туда, где мешать
  // нельзя, — и появлялась на поиске до всякой генерации.
  const [shown, setShown] = useState<{ platform: InstallPlatform; slot: string } | null>(null);
  const [howto, setHowto] = useState(false);
  // Показ единожды за жизнь вкладки: и таймер Главной, и ожидание рецепта
  // могут сработать по очереди при переходах между экранами.
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    const audience = resolveAudience();
    if (!audience) return;

    const show = () => {
      if (shownRef.current) return;
      shownRef.current = true;
      try {
        sessionStorage.setItem(SESSION_FLAG, "1");
      } catch {
        /* приватный режим */
      }
      setShown({ platform: audience, slot: pathname });
      reachGoal("install_banner_shown", { platform: audience });
    };

    if (pathname === "/") {
      if (audience !== "ios") return; // Android на Главной покрыт бейджем в герое
      // Первый визит уже занят онбординг-модалкой — не наслаиваемся на неё.
      try {
        if (!localStorage.getItem("smartcook_onboarding_seen")) return;
      } catch {
        return;
      }
      const timer = setTimeout(show, HOME_DELAY_MS);
      return () => clearTimeout(timer);
    }

    if (pathname === "/search") {
      let capTimer: ReturnType<typeof setTimeout> | undefined;
      let armTimer: ReturnType<typeof setTimeout> | undefined;
      let startY = 0;

      const onScroll = () => {
        if (Math.abs(window.scrollY - startY) >= SEEN_SCROLL_PX) finish();
      };

      const finish = () => {
        window.removeEventListener("scroll", onScroll);
        if (capTimer) clearTimeout(capTimer);
        if (armTimer) clearTimeout(armTimer);
        show();
      };

      const onRecipeReady = () => {
        if (shownRef.current || capTimer) return; // отсчёт уже идёт с первого рецепта
        // Экран поиска сам прокручивается к рецепту — эту прокрутку нельзя
        // засчитать за чтение, поэтому слушателя вешаем с задержкой.
        armTimer = setTimeout(() => {
          startY = window.scrollY;
          window.addEventListener("scroll", onScroll, { passive: true });
        }, SCROLL_GRACE_MS);
        capTimer = setTimeout(finish, AFTER_RECIPE_MS);
      };

      window.addEventListener(RECIPE_READY_EVENT, onRecipeReady);
      return () => {
        window.removeEventListener(RECIPE_READY_EVENT, onRecipeReady);
        window.removeEventListener("scroll", onScroll);
        if (capTimer) clearTimeout(capTimer);
        if (armTimer) clearTimeout(armTimer);
      };
    }
  }, [pathname]);

  // Видна только на том экране, где её показали (см. комментарий к shown).
  if (!shown || shown.slot !== pathname) return null;

  const { platform } = shown;
  const isAndroid = platform === "android";

  const handleClose = () => {
    setShown(null);
    snooze(DISMISS_DAYS);
    reachGoal("install_banner_dismissed", { platform });
  };

  return (
    <div className="install-banner" role="region" aria-label="Установка приложения SmartCook">
      <div className="install-banner-row">
        <span className="install-banner-icon" aria-hidden>
          <Smartphone size={20} />
        </span>
        <div className="install-banner-text">
          <span className="install-banner-title">
            {isAndroid ? "Скачайте приложение SmartCook" : "Добавьте SmartCook на экран"}
          </span>
          <span className="install-banner-sub">
            {isAndroid
              ? "Из RuStore — бесплатно, ставится в один тап"
              : "Открывается как приложение, искать в браузере не нужно"}
          </span>
        </div>

        {/* Крестик вторичен: он не должен спорить с основным действием. */}
        <button
          type="button"
          className="install-banner-close"
          aria-label="Закрыть"
          onClick={handleClose}
        >
          <X size={16} />
        </button>
      </div>

      {/* Кнопка отдельной строкой: рядом с текстом она зажимала его в узкую
          колонку и плашка вырастала на пол-экрана. */}
      {isAndroid ? (
        <a
          className="install-banner-cta"
          href={RUSTORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            // Человек ушёл ставить приложение — молчим дольше обычного.
            snooze(CLICK_DAYS);
            reachGoal("install_banner_rustore_click");
          }}
        >
          Открыть RuStore
        </a>
      ) : (
        !howto && (
          <button
            type="button"
            className="install-banner-cta"
            onClick={() => {
              setHowto(true);
              snooze(DISMISS_DAYS);
              reachGoal("install_banner_ios_howto");
            }}
          >
            Показать, как добавить
          </button>
        )
      )}

      {/* iOS: своего промпта установки система не даёт — только руками. Пишем
          шагами и обычными словами, без «PWA», «A2HS» и «домашнего экрана». */}
      {howto && (
        <div className="install-banner-steps">
          <div className="install-banner-step">
            <span className="install-banner-step-ico" aria-hidden>
              <Share size={15} />
            </span>
            <span>
              Нажмите <b>«Поделиться»</b> — квадрат со стрелкой вверх, внизу экрана
            </span>
          </div>
          <div className="install-banner-step">
            <span className="install-banner-step-ico" aria-hidden>
              <Plus size={15} />
            </span>
            <span>
              Пролистайте список и выберите <b>«На экран „Домой“»</b>
            </span>
          </div>
          <div className="install-banner-step">
            <span className="install-banner-step-ico" aria-hidden>
              <Check size={15} />
            </span>
            <span>Значок SmartCook встанет рядом с другими приложениями</span>
          </div>
        </div>
      )}
    </div>
  );
}

// В нативной оболочке звать «установить приложение» бессмысленно — мы уже внутри
// приложения. Обёртка вынесена отдельным компонентом намеренно: ранний return
// внутри InstallBannerInner менял бы число вызванных хуков между первым рендером
// (флаг ещё false) и следующим, а это ошибка React. Здесь хук ровно один и
// вызывается всегда. В вебе флаг всегда false — поведение не меняется.
export default function InstallBanner() {
  const isNative = useIsNative();
  if (isNative) return null;
  return <InstallBannerInner />;
}
