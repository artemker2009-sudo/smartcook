"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { ShoppingDepartment } from "@/lib/shoppingList";
import ItemRow from "@/components/shopping/ItemRow";
import type { RowItem } from "@/components/shopping/types";

type Props = {
  department: ShoppingDepartment;
  items: RowItem[];
  onToggle: (id: string) => void;
  onRemove: (item: RowItem) => void;
  /** Показывать ли подпись у строки: решает список (см. ListScreen.renderRows). */
  showNote: (item: RowItem, index: number) => boolean;
  /** Открыть меню позиции: долгое нажатие по строке или нажатие на ручку. */
  onOpenItemMenu?: (item: RowItem) => void;
  /** Новый порядок внутри отдела. Нет обработчика — нет и ручек. */
  onReorder?: (department: ShoppingDepartment, orderedNames: string[]) => void;
};

/**
 * Позиции одного отдела с перетаскиванием за ручку.
 *
 * Почему без библиотеки. Порядок правят внутри ОДНОГО отдела, это несколько
 * строк на экране телефона; всё, что нужно, — сдвинуть соседей и запомнить
 * результат. Любая из готовых библиотек перетаскивания весит больше, чем весь
 * раздел «Покупки», и тянет за собой собственную модель событий поверх нашей.
 *
 * Как считается цель. В начале жеста один раз снимаются положения и высоты
 * строк ОТНОСИТЕЛЬНО списка; дальше на каждое движение читается только рамка
 * самого списка — поэтому прокрутка страницы во время перетаскивания ничего не
 * ломает. Строки при этом не переставляются в разметке: двигаются трансформы, а
 * порядок меняется один раз, в конце. Без этого каждая перестановка
 * пересобирала бы список прямо под пальцем.
 *
 * Между отделами не тащим намеренно: чужая группа может быть за экраном, и
 * жест превращается в борьбу с прокруткой. Для этого есть меню «Переместить в
 * отдел…».
 */
export default function DepartmentList({
  department,
  items,
  onToggle,
  onRemove,
  showNote,
  onOpenItemMenu,
  onReorder,
}: Props) {
  const ulRef = useRef<HTMLUListElement | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number; height: number } | null>(null);
  // Жест закончился перестановкой — гасим клик по ручке, который придёт следом.
  const moved = useRef(false);

  const handleGripDown = (item: RowItem, e: ReactPointerEvent<HTMLElement>) => {
    moved.current = false;
    const ul = ulRef.current;
    if (!onReorder || !ul || items.length < 2) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const from = items.findIndex((it) => it.id === item.id);
    if (from < 0) return;

    const ulTop = ul.getBoundingClientRect().top;
    const rows = (Array.from(ul.children) as HTMLElement[]).map((el) => {
      const rect = el.getBoundingClientRect();
      return { top: rect.top - ulTop, height: rect.height };
    });
    if (rows.length !== items.length) return;

    const grip = e.currentTarget;
    // pageY, а не clientY: если страница подпрыгнет, палец и строка не
    // разъедутся.
    const startPageY = e.pageY;
    const minDy = rows[0].top - rows[from].top;
    const maxDy = rows[rows.length - 1].top + rows[rows.length - 1].height - (rows[from].top + rows[from].height);

    let target = from;

    const onMove = (ev: PointerEvent) => {
      const dy = Math.max(minDy, Math.min(maxDy, ev.pageY - startPageY));
      // Рамку списка читаем каждый раз: страница могла прокрутиться.
      const rel = ev.clientY - ul.getBoundingClientRect().top;

      let nearest = 0;
      let best = Infinity;
      rows.forEach((row, i) => {
        const distance = Math.abs(rel - (row.top + row.height / 2));
        if (distance < best) {
          best = distance;
          nearest = i;
        }
      });
      target = nearest;
      if (target !== from) moved.current = true;
      setDrag({ from, to: target, dy, height: rows[from].height });
    };

    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      setDrag(null);
      if (target === from) return;
      const names = items.map((it) => it.name);
      const [dragged] = names.splice(from, 1);
      names.splice(target, 0, dragged);
      onReorder(department, names);
    };

    // Слушаем окно, а не саму ручку. С захватом указателя события и так
    // пришли бы на неё, но захват — вещь необязательная: он бросает исключение
    // на «мёртвом» указателе и молча не работает в части старых WebView. На
    // окне жест доезжает до конца в любом случае, в том числе если палец ушёл
    // за пределы строки — а он уходит всегда.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    try {
      grip.setPointerCapture(e.pointerId);
    } catch {
      // Не дали захват — жест продолжает работать на слушателях окна.
    }
  };

  // Соседи расступаются на высоту той строки, которую тащат.
  const offsetFor = (i: number): number => {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    if (drag.to > drag.from && i > drag.from && i <= drag.to) return -drag.height;
    if (drag.to < drag.from && i >= drag.to && i < drag.from) return drag.height;
    return 0;
  };

  return (
    <ul className="sh-list" ref={ulRef}>
      {items.map((it, i) => (
        <ItemRow
          key={it.id}
          item={it}
          onToggle={onToggle}
          onRemove={() => onRemove(it)}
          showNote={showNote(it, i)}
          onLongPress={onOpenItemMenu}
          onGripDown={onReorder ? handleGripDown : undefined}
          onGripClick={(item) => {
            // Нажатие после перетаскивания — это конец жеста, а не запрос меню.
            if (moved.current) return;
            onOpenItemMenu?.(item);
          }}
          dragging={drag?.from === i}
          offsetY={offsetFor(i)}
        />
      ))}
    </ul>
  );
}
