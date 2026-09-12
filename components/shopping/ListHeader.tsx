"use client";

import { type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

type Props = {
  title: string;
  /** Строка под названием: у общего списка — участники. */
  subtitle?: ReactNode;
  /** Тап по названию переименовывает. undefined — переименование недоступно. */
  onRename?: () => void;
  onMenu: () => void;
};

/**
 * Шапка активного списка: название и меню «⋯».
 *
 * Слова «Покупки» здесь нет и быть не должно — раздел называет себя один раз,
 * в таб-баре и в заголовке хаба.
 *
 * Переключателя раскладки в шапке больше нет: иконка-кружок рядом с заголовком
 * ничего не объясняла, и функцию просто не находили. Теперь это чип с текстом
 * под заголовком — см. ListScreen.
 */
export default function ListHeader({ title, subtitle, onRename, onMenu }: Props) {
  return (
    <header className="sh-head">
      <div className="sh-head-text">
        {onRename ? (
          <button type="button" className="sh-head-title" onClick={onRename}>
            {title}
          </button>
        ) : (
          <h1 className="sh-head-title sh-head-title-static">{title}</h1>
        )}
        {subtitle}
      </div>

      <button type="button" className="sh-head-icon" onClick={onMenu} aria-label="Меню списка">
        <MoreHorizontal size={20} />
      </button>
    </header>
  );
}
