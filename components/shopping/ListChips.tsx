"use client";

import { useEffect, useRef } from "react";
import { Loader2, Plus, Users } from "lucide-react";

/** Один список в переключателе. Общий и локальный различаются только kind. */
export type ChipEntry = {
  id: string;
  kind: "local" | "shared";
  /** Короткая подпись (listChipLabel), а не сырое имя из хранилища. */
  label: string;
  /** Счётчик «куплено/всего». null — неизвестен (общий список ещё не открывали). */
  counts: { total: number; done: number } | null;
};

type Props = {
  entries: ChipEntry[];
  activeId: string | null;
  /** id общего списка, который прямо сейчас открывается с сервера. */
  loadingId: string | null;
  onSelect: (entry: ChipEntry) => void;
  onCreate: () => void;
};

/**
 * Переключатель списков — горизонтальная лента чипов.
 *
 * Пришёл на смену хабу с карточками во весь экран. Карточка списка занимала
 * ~150px и несла имя, дату, «14 позиций», полосу прогресса и «куплено 5 из 14»
 * — пять способов сказать одно и то же; четыре списка уже не влезали на экран
 * телефона, и до самого списка нужно было сделать лишний переход. Чип говорит
 * то же самое в одной строке: имя и «5/14».
 *
 * Общий список — ТОТ ЖЕ чип со значком «людей», а не отдельная секция с
 * заголовком и абзацем-объяснением. У него счётчик может отсутствовать:
 * позиции на сервере, и до первого открытия их количество неизвестно.
 */
export default function ListChips({ entries, activeId, loadingId, onSelect, onCreate }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);

  // Активный чип может оказаться за краем ленты — например, после возврата в
  // раздел на четвёртом списке. Подтягиваем его в вид, но только по горизонтали
  // (block: "nearest"), иначе страница прыгает к шапке.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeId]);

  return (
    <div className="sh-chips" role="tablist" aria-label="Списки покупок">
      {entries.map((entry) => {
        const active = entry.id === activeId;
        return (
          <button
            key={entry.id}
            ref={active ? activeRef : undefined}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? "sh-chip sh-chip-active" : "sh-chip"}
            onClick={() => onSelect(entry)}
          >
            {entry.kind === "shared" &&
              (loadingId === entry.id ? (
                <Loader2 size={15} className="animate-spin" aria-hidden />
              ) : (
                <Users size={15} aria-hidden />
              ))}
            <span className="sh-chip-label">{entry.label}</span>
            {entry.counts && entry.counts.total > 0 && (
              <span className="sh-chip-count">
                {entry.counts.done}/{entry.counts.total}
              </span>
            )}
          </button>
        );
      })}

      {/* «+» последним чипом: новый список — действие того же порядка, что
          переключение между ними, и отдельной зелёной кнопки во всю ширину
          экрана оно не стоит. */}
      <button type="button" className="sh-chip sh-chip-add" onClick={onCreate} aria-label="Новый список">
        <Plus size={18} strokeWidth={2.6} aria-hidden />
      </button>
    </div>
  );
}
