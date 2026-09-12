"use client";

import { type ReactNode } from "react";
import { LayoutList, Loader2, MoreHorizontal } from "lucide-react";

import type { ListScreenSort } from "@/components/shopping/types";

type Props = {
  title: string;
  /** Строка под названием: у общего списка — участники. */
  subtitle?: ReactNode;
  /** Тап по названию переименовывает. undefined — переименование недоступно. */
  onRename?: () => void;
  sort: ListScreenSort;
  onMenu: () => void;
};

/**
 * Шапка активного списка: название, переключатель раскладки, меню «⋯».
 *
 * Слова «Покупки» здесь нет и быть не должно — раздел называет себя один раз,
 * в таб-баре. Прежняя шапка показывала «Покупки» крупно и дату мелким, то есть
 * повторяла заголовок раздела вместо того, чтобы назвать список.
 *
 * Переключатель раскладки — одна иконка, а не кнопка «Разложить по отделам» во
 * всю ширину экрана. Про вызов модели: раскладка считается на сервере, и
 * мгновенной она бывает только когда кэш совпал с текущим набором позиций
 * (sort.state === "ready"). Иначе нажатие уходит в запрос, и это видно —
 * спиннер здесь и строка «Раскладываю…» на месте первого отдела.
 */
export default function ListHeader({ title, subtitle, onRename, sort, onMenu }: Props) {
  const sortLabel = sort.grouped
    ? "Показать в порядке добавления"
    : sort.state === "ready"
      ? "Показать по отделам магазина"
      : "Разложить по отделам магазина";

  return (
    <header className="sh-head">
      <div className="sh-head-text">
        {onRename ? (
          <button type="button" className="sh-head-title" onClick={onRename}>
            {title}
          </button>
        ) : (
          // У общего списка переименования пока нет (нужен серверный роут) —
          // и «мёртвой» кнопки, которая ничего не делает, тут тоже нет.
          <h1 className="sh-head-title sh-head-title-static">{title}</h1>
        )}
        {subtitle}
      </div>

      <button
        type="button"
        className={sort.grouped ? "sh-head-icon sh-head-icon-on" : "sh-head-icon"}
        onClick={sort.onToggle}
        disabled={sort.busy}
        aria-pressed={sort.grouped}
        aria-label={sortLabel}
        title={sortLabel}
      >
        {sort.busy ? <Loader2 size={20} className="animate-spin" /> : <LayoutList size={20} />}
      </button>

      <button type="button" className="sh-head-icon" onClick={onMenu} aria-label="Меню списка">
        <MoreHorizontal size={20} />
      </button>
    </header>
  );
}
