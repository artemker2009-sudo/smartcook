"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Check, GripVertical, X } from "lucide-react";

import { splitQuantity } from "@/lib/shoppingQuantity";
import type { RowItem } from "@/components/shopping/types";

/** Сколько держать палец, чтобы открылось меню позиции. */
const LONG_PRESS_MS = 450;
/** Сдвинулся дальше — это прокрутка, а не удержание. */
const LONG_PRESS_SLOP = 10;

type Props = {
  item: RowItem;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  /**
   * Рисовать ли подпись под названием. Решает список: у группы позиций из
   * одного рецепта подпись стоит только у первой строки (см. RowItem.noteGroup).
   */
  showNote?: boolean;
  /** Долгое нажатие по строке — меню «Переместить в отдел…». */
  onLongPress?: (item: RowItem) => void;
  /** Начало перетаскивания за ручку. Ручки нет, пока не передан обработчик. */
  onGripDown?: (item: RowItem, e: ReactPointerEvent<HTMLElement>) => void;
  /**
   * Нажатие на ручку без перетаскивания — то же меню, что по долгому нажатию.
   * Отдельным обработчиком, потому что гасить его после настоящего
   * перетаскивания умеет только хозяин жеста (DepartmentList).
   */
  onGripClick?: (item: RowItem) => void;
  /** Эту строку тащат прямо сейчас. */
  dragging?: boolean;
  /** Сдвиг строки при перетаскивании, px. */
  offsetY?: number;
};

/**
 * Одна строка списка: крупный чекбокс слева, название, количество серым
 * справа, подпись мелким под названием.
 *
 * Тап по ВСЕЙ строке отмечает позицию — так устроены Bring! и Google Keep, и
 * это главный жест в магазине, где телефон держат одной рукой. Крестик —
 * отдельная кнопка справа: удаление должно требовать прицела, иначе позиция
 * исчезает вместо того, чтобы вычеркнуться.
 *
 * Высота строки — не меньше 52px (ЦА 35–65), чекбокс 44×44 по площади нажатия
 * при видимом кружке 28px: раньше кружок был 30px и ровно столько же составляла
 * зона попадания.
 *
 * В режиме «по отделам» добавляются два способа поправить раскладку. Ручка
 * «шесть точек» — видимый: её видно, и понятно, что за неё тянут. Долгое
 * нажатие — невидимый, но он единственный, которым можно перенести позицию в
 * ДРУГОЙ отдел: тащить строку через полэкрана в чужую группу на телефоне
 * невозможно.
 */
export default function ItemRow({
  item,
  onToggle,
  onRemove,
  showNote = true,
  onLongPress,
  onGripDown,
  onGripClick,
  dragging = false,
  offsetY = 0,
}: Props) {
  const { label, qty } = splitQuantity(item.name);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  // Долгое нажатие сработало — ближайший клик по строке гасим, иначе позиция
  // ещё и вычеркнулась бы под открывшимся меню.
  const fired = useRef(false);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!onLongPress) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    fired.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    timer.current = setTimeout(() => {
      fired.current = true;
      timer.current = null;
      onLongPress(item);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!start.current) return;
    // Список прокручивают пальцем прямо по строкам — сдвиг отменяет удержание.
    if (
      Math.abs(e.clientX - start.current.x) > LONG_PRESS_SLOP ||
      Math.abs(e.clientY - start.current.y) > LONG_PRESS_SLOP
    ) {
      cancel();
    }
  };

  return (
    <li
      className={
        (item.checked ? "sh-row sh-row-done" : "sh-row") + (dragging ? " sh-row-dragging" : "")
      }
      style={offsetY ? { transform: `translateY(${offsetY}px)` } : undefined}
    >
      {/* Кнопка на всю строку, а не только на кружок: в магазине целятся
          пальцем в название, а не в чекбокс. Внутри — «неживая» разметка,
          вложенных кнопок тут быть не может. */}
      <button
        type="button"
        className="sh-row-main"
        onClick={() => {
          if (fired.current) {
            // Палец подняли после долгого нажатия: меню уже открыто.
            fired.current = false;
            return;
          }
          onToggle(item.id);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        // Долгое нажатие на телефоне иначе поднимает системное меню выделения
        // поверх нашего.
        onContextMenu={onLongPress ? (e) => e.preventDefault() : undefined}
        aria-pressed={item.checked}
        aria-label={item.checked ? `Вернуть «${item.name}»` : `Вычеркнуть «${item.name}»`}
      >
        <span className="sh-check" aria-hidden>
          {item.checked && <Check size={18} color="#fff" strokeWidth={3} />}
        </span>
        <span className="sh-row-text">
          {/* Зачёркивание живёт на этом span, а не на кнопке: в CSS черта
              протягивается сквозь потомков, и подпись «купил(а) …» тоже
              оказывалась перечёркнутой — она не выполненный пункт. */}
          <span className="sh-row-name">{label}</span>
          {showNote && item.note && <span className="sh-row-note">{item.note}</span>}
        </span>
        {/* Количество отделено только при ПОКАЗЕ (splitQuantity). Разбор не
            уверен — тут пусто, а название осталось целиком. */}
        {qty && <span className="sh-row-qty">{qty}</span>}
      </button>

      {/* Ручка стоит ПЕРЕД крестиком и только в режиме «по отделам». Она же —
          видимый вход в меню позиции: долгое нажатие по строке делает то же
          самое, но его никто не найдёт, если о нём не сказать. Тянут за ручку,
          нажимают — открывается «Переместить в отдел…». */}
      {onGripDown && (
        <button
          type="button"
          className="sh-row-grip"
          onPointerDown={(e) => onGripDown(item, e)}
          onClick={() => onGripClick?.(item)}
          aria-label={`Переместить «${item.name}»`}
        >
          <GripVertical size={20} aria-hidden />
        </button>
      )}

      <button
        type="button"
        className="sh-row-x"
        onClick={() => onRemove(item.id)}
        aria-label={`Удалить «${item.name}»`}
      >
        <X size={20} />
      </button>
    </li>
  );
}
