"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { MoreHorizontal, Trash2, Users } from "lucide-react";

import { markOpenedFromHub } from "@/lib/shoppingActive";

/** Один список в хабе. Локальный и общий различаются только kind. */
export type HubEntry = {
  id: string;
  kind: "local" | "shared";
  /** Имя для показа (listDisplayName), а не сырое из хранилища. */
  label: string;
  /** «обновлён сегодня 17:10». Пусто — подписи не будет. */
  updatedLabel: string;
  /** Счётчик «куплено/всего». null — неизвестен (общий список ещё не открывали). */
  counts: { total: number; done: number } | null;
};

type Props = {
  entry: HubEntry;
  onDelete: () => void;
};

// Сколько пальцу надо утащить строку влево, чтобы жест считался свайпом.
const SWIPE_THRESHOLD = 64;
// Дальше кнопки «Удалить» строку не тянем.
const SWIPE_MAX = 88;
// Пока палец не ушёл по горизонтали дальше вертикали на столько — считаем, что
// человек скроллит список, а не свайпает строку.
const DIRECTION_SLOP = 10;

/**
 * Карточка списка в хабе — ОДНА СТРОКА ~72px: имя, счётчик справа, под именем
 * серым «обновлён сегодня 17:10». Общий список — со значком «людей» перед
 * именем.
 *
 * Пришла на смену прежней плитке на ~150px, которая несла имя, дату, «14
 * позиций», полосу прогресса и «куплено 5 из 14» — пять способов сказать одно
 * и то же; четыре списка не влезали в экран телефона.
 *
 * Удаление — свайпом влево ИЛИ через «⋯». Свайп быстрее, но он невидим:
 * человек, который о нём не знает, никогда его не найдёт, поэтому «⋯» на месте
 * и остаётся главным способом.
 */
export default function HubRow({ entry, onDelete }: Props) {
  // Насколько строка утащена влево (px). 0 — на месте.
  const [offset, setOffset] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  // null — направление жеста ещё не решено; false — это вертикальный скролл.
  const swiping = useRef<boolean | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Только палец и стилус: мышью строку не тащат, а «⋯» рядом.
    if (e.pointerType === "mouse") return;
    start.current = { x: e.clientX, y: e.clientY };
    swiping.current = null;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;

    // Решаем один раз: это горизонтальный свайп или вертикальный скролл.
    // Без этой развилки любая прокрутка хаба слегка сдвигала строки.
    if (swiping.current === null) {
      if (Math.abs(dx) < DIRECTION_SLOP && Math.abs(dy) < DIRECTION_SLOP) return;
      swiping.current = Math.abs(dx) > Math.abs(dy);
    }
    if (!swiping.current) return;

    setOffset(Math.max(0, Math.min(SWIPE_MAX, -dx)));
  };

  const onPointerUp = () => {
    if (swiping.current) {
      // Не дотянул — строка возвращается на место, ничего не происходит.
      setOffset((cur) => (cur >= SWIPE_THRESHOLD ? SWIPE_MAX : 0));
    }
    start.current = null;
    swiping.current = null;
  };

  const open = offset >= SWIPE_THRESHOLD;

  return (
    <div className="sh-hub-row">
      {/* Кнопка живёт ПОД строкой и открывается из-под неё. Она в DOM всегда,
          поэтому доступна с клавиатуры и скринридеру — даже когда свайпа не
          было (для этого же на карточке есть «⋯»). */}
      <button
        type="button"
        className="sh-hub-del"
        onClick={onDelete}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
      >
        <Trash2 size={20} />
        Удалить
      </button>

      <div
        className="sh-hub-slide"
        style={{ transform: `translateX(-${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <Link
          href={`/shopping/${entry.id}`}
          className="sh-hub-main"
          // Свайп заканчивается тапом по ссылке — без этого список открывался
          // ровно в тот момент, когда человек тащил строку к «Удалить».
          onClick={(e) => {
            if (offset > 0) {
              e.preventDefault();
              setOffset(0);
              return;
            }
            // Отмечаем, что хаб остался позади: по этой пометке ссылка
            // «← Покупки» в списке сделает шаг НАЗАД, а не накрутит историю.
            markOpenedFromHub();
          }}
        >
          <span className="sh-hub-text">
            <span className="sh-hub-title">
              {entry.kind === "shared" && <Users size={17} aria-label="общий список" />}
              {entry.label}
            </span>
            {entry.updatedLabel && <span className="sh-hub-meta">{entry.updatedLabel}</span>}
          </span>
          {entry.counts && entry.counts.total > 0 && (
            <span className="sh-hub-count">
              {entry.counts.done}/{entry.counts.total}
            </span>
          )}
        </Link>

        <button
          type="button"
          className="sh-hub-menu"
          onClick={() => onDelete()}
          aria-label={`Удалить список «${entry.label}»`}
        >
          <MoreHorizontal size={20} />
        </button>
      </div>
    </div>
  );
}
