"use client";

// ОДИН компонент на все нижние шторки и модалки приложения.
//
// Зачем он появился. Плавность окон была разной в каждом месте: шторки списка
// покупок поднимались на 16px за 0.22s, модалки входа просто проявлялись,
// шторка лимита не анимировалась вовсе, а закрывались все одинаково — рывком,
// потому что уходящей анимации не было ни у кого. Чинить это в восьми файлах
// по отдельности означало бы завести восемь слегка разных анимаций.
//
// Что компонент делает сам:
//   * выезд снизу и уход вниз (300 мс, ease-out), фон гаснет плавно;
//   * закрытие свайпом вниз — пальцем, как в системных шторках;
//   * Escape и тап по затемнению;
//   * блокировка прокрутки страницы под окном;
//   * нижний вырез (Home Indicator) — сам, чтобы кнопка не легла на полоску;
//   * prefers-reduced-motion: ничего не анимируется, окно просто появляется.
//
// Стили — в globals.css, секция «Плавность оверлеев». Здесь только поведение.

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** "sheet" — снизу на всю ширину, "modal" — карточка по центру. */
  variant?: "sheet" | "modal";
  /** Подпись окна для скрин-ридера. */
  label?: string;
  /** Показывать ручку-полоску сверху. Только для шторок. */
  grip?: boolean;
  /** Своя подложка окна. По умолчанию — фон и скругления шторки из макета. */
  className?: string;
  style?: React.CSSProperties;
};

/** Сколько надо утянуть вниз, чтобы шторка закрылась, а не вернулась. */
const SWIPE_CLOSE_PX = 90;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default function BottomSheet({
  open,
  onClose,
  children,
  variant = "sheet",
  label,
  grip = true,
  className,
  style,
}: Props) {
  // Открытая шторка живёт в DOM дольше, чем open === true: пока проигрывается
  // уход, её ещё видно. Поэтому состояние своё, а не проп напрямую.
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);

  const dragStart = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Синхронизация с пропом — ВО ВРЕМЯ РЕНДЕРА, а не эффектом. Эффект здесь
  // означал бы лишний кадр: окно успевало бы отрисоваться в старом состоянии,
  // и выезд начинался бы с рывка. Это штатный приём React для состояния,
  // производного от пропа, — «подстройка состояния при смене пропа».
  //
  // Прошлое значение держим в СОСТОЯНИИ, а не в ref: читать ref во время
  // рендера нельзя, он для этого не предназначен.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setMounted(true);
      setClosing(false);
      setDragY(0);
    } else if (mounted && !closing) {
      // Окно закрыли снаружи (сменили проп), минуя наш startClose — уход
      // всё равно должен проигрываться.
      setClosing(true);
    }
  }

  // Закрытие: сперва анимация, потом размонтирование. При выключенной анимации
  // ждать нечего — убираем сразу.
  const finishClose = useCallback(() => {
    setMounted(false);
    setClosing(false);
    setDragY(0);
  }, []);

  const startClose = useCallback(() => {
    if (prefersReducedMotion()) {
      finishClose();
      onClose();
      return;
    }
    setClosing(true);
    onClose();
  }, [finishClose, onClose]);

  // Ждём конец уходящей анимации именно по событию, а не по таймеру: таймер
  // разъезжается с длительностью, как только её поменяют в CSS.
  useEffect(() => {
    if (!closing) return;
    const node = sheetRef.current;
    const done = () => finishClose();
    node?.addEventListener("animationend", done);
    // Страховка на два случая, и оба реальны:
    //   * анимация выключена (prefers-reduced-motion) — animationend не
    //     придёт никогда, и ждать его нечего: убираем сразу;
    //   * анимация не стартовала (вкладка в фоне, узла нет) — окно всё равно
    //     обязано уйти, а не залипнуть навсегда.
    const guard = setTimeout(done, prefersReducedMotion() || !node ? 0 : 600);
    return () => {
      node?.removeEventListener("animationend", done);
      clearTimeout(guard);
    };
  }, [closing, finishClose]);

  // Escape — как у любого модального окна.
  useEffect(() => {
    if (!mounted || closing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") startClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, closing, startClose]);

  // Прокрутка страницы под окном. Возвращаем прежнее значение, а не пустую
  // строку: под окном может быть экран, который сам что-то ставил в overflow.
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  if (!mounted) return null;

  const isSheet = variant === "sheet";
  const dragging = dragY > 0;

  // Свайп вниз. Только для шторок и только вниз: движение вверх шторку не
  // растягивает — вверх её тянуть некуда.
  const onTouchStart = (e: React.TouchEvent) => {
    if (!isSheet || closing) return;
    dragStart.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStart.current === null) return;
    const delta = e.touches[0].clientY - dragStart.current;
    setDragY(delta > 0 ? delta : 0);
  };

  const onTouchEnd = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (dragY >= SWIPE_CLOSE_PX) startClose();
    else setDragY(0);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={startClose}
      className={`sc-overlay ${isSheet ? "sc-overlay-sheet" : "sc-overlay-center"}${
        closing ? " sc-overlay-closing" : ""
      }`}
    >
      <div
        ref={sheetRef}
        // Клик внутри окна не должен его закрывать.
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={[
          isSheet ? "sc-sheet" : "sc-modal",
          closing ? (isSheet ? "sc-sheet-closing" : "sc-modal-closing") : "",
          dragging ? "sc-sheet-dragging" : "",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          ...(isSheet
            ? {
                background: "#F7F7F4",
                color: "#141413",
                borderRadius: "24px 24px 0 0",
                boxShadow: "0 -8px 30px rgba(0,0,0,0.18)",
                // Нижний вырез держит сама шторка: иначе последняя кнопка
                // ложится на полоску Home Indicator.
                padding: "10px 20px calc(22px + env(safe-area-inset-bottom, 0px)) 20px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                fontFamily:
                  "-apple-system, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif",
              }
            : {}),
          // Палец тянет — шторка идёт за ним.
          ...(dragging ? { transform: `translateY(${dragY}px)` } : {}),
          ...style,
        }}
      >
        {isSheet && grip ? <span className="sc-sheet-grip" aria-hidden /> : null}
        {children}
      </div>
    </div>
  );
}
