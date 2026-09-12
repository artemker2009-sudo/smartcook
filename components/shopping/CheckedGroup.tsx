"use client";

import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";

import ItemRow from "@/components/shopping/ItemRow";
import type { RowItem } from "@/components/shopping/types";

type Props = {
  items: RowItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
};

/**
 * Купленное — одной свёрнутой группой в самом низу.
 *
 * Раньше вычеркнутые позиции оставались в общем списке (серыми, внизу) и
 * занимали столько же места, сколько нужные: на 14 позициях пять купленных
 * выдавливали остаток за край экрана. Теперь это одна строка «Куплено (5)»,
 * которая раскрывается тапом — там же и «Очистить купленное», потому что
 * нужно оно ровно в этот момент, а не отдельной кнопкой посреди экрана.
 *
 * Группа стоит внизу в ЛЮБОМ режиме, в том числе при раскладке по отделам:
 * купленное больше не размазано по отделам, и «что осталось взять» читается
 * сверху вниз без пропусков.
 */
export default function CheckedGroup({
  items,
  open,
  onOpenChange,
  onToggle,
  onRemove,
  onClear,
}: Props) {
  if (items.length === 0) return null;

  return (
    <section className="sh-done">
      <button
        type="button"
        className="sh-done-head"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={20} aria-hidden /> : <ChevronRight size={20} aria-hidden />}
        Куплено ({items.length})
      </button>

      {open && (
        <>
          <ul className="sh-list">
            {items.map((it) => (
              <ItemRow key={it.id} item={it} onToggle={onToggle} onRemove={onRemove} />
            ))}
          </ul>
          <button type="button" className="sh-done-clear" onClick={onClear}>
            <Trash2 size={18} /> Очистить купленное
          </button>
        </>
      )}
    </section>
  );
}
