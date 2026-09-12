"use client";

import { Check, X } from "lucide-react";

import { splitQuantity } from "@/lib/shoppingQuantity";
import type { RowItem } from "@/components/shopping/types";

type Props = {
  item: RowItem;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
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
 */
export default function ItemRow({ item, onToggle, onRemove }: Props) {
  const { label, qty } = splitQuantity(item.name);

  return (
    <li className={item.checked ? "sh-row sh-row-done" : "sh-row"}>
      {/* Кнопка на всю строку, а не только на кружок: в магазине целятся
          пальцем в название, а не в чекбокс. Внутри — «неживая» разметка,
          вложенных кнопок тут быть не может. */}
      <button
        type="button"
        className="sh-row-main"
        onClick={() => onToggle(item.id)}
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
          {item.note && <span className="sh-row-note">{item.note}</span>}
        </span>
        {/* Количество отделено только при ПОКАЗЕ (splitQuantity). Разбор не
            уверен — тут пусто, а название осталось целиком. */}
        {qty && <span className="sh-row-qty">{qty}</span>}
      </button>

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
