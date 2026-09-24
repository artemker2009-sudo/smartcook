"use client";

import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";

import type { MenuAction } from "@/components/shopping/types";

type Props = {
  actions: MenuAction[];
  onClose: () => void;
  /**
   * Заголовок верхнего уровня. У меню списка его нет — пункты говорят сами за
   * себя; у меню позиции есть, иначе девять отделов подряд выглядят как список
   * неизвестно чего.
   */
  title?: string;
};

/**
 * Нижний лист меню «⋯» — один на хаб и на экран списка.
 *
 * Пункт с `next` не закрывает лист, а показывает вложенный: так «Поделиться»
 * умещается одним пунктом, не сваливая в одну кучу живой общий список и
 * снимок в ссылке.
 *
 * Опасный пункт отделён чертой и стоит последним: частое и безопасное —
 * сверху, под большим пальцем; удаление — там, куда случайно не попадают.
 */
export default function MenuSheet({ actions, onClose, title }: Props) {
  const [level, setLevel] = useState<{ title: string | null; actions: MenuAction[] }>({
    title: title ?? null,
    actions,
  });

  return (
    <div className="sl-overlay" onClick={onClose}>
      <div className="sl-sheet" role="menu" onClick={(e) => e.stopPropagation()}>
        {level.title && <div className="sl-sheet-title">{level.title}</div>}
        {level.actions.map((action, i) => (
          <Fragment key={action.key}>
            {action.danger && i > 0 && !level.actions[i - 1].danger && (
              <div className="sl-sheet-sep" role="separator" />
            )}
            <button
              type="button"
              role="menuitem"
              className={action.danger ? "sl-sheet-btn sl-sheet-danger" : "sl-sheet-btn"}
              onClick={() => {
                if (action.next) {
                  setLevel({ title: action.next.title, actions: action.next.actions });
                  return;
                }
                onClose();
                action.onSelect?.();
              }}
            >
              {action.icon} {action.label}
              {action.next && <ChevronRight size={18} className="sl-sheet-chevron" aria-hidden />}
            </button>
          </Fragment>
        ))}
        <button type="button" className="sl-sheet-cancel" onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>
  );
}
