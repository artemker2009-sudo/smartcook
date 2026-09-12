"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, Loader2, RefreshCw } from "lucide-react";

import AddBar from "@/components/shopping/AddBar";
import CheckedGroup from "@/components/shopping/CheckedGroup";
import ItemRow from "@/components/shopping/ItemRow";
import ListHeader from "@/components/shopping/ListHeader";
import type { ListScreenSort, RowItem } from "@/components/shopping/types";

type Props = {
  title: string;
  /** Строка под названием: у общего списка — участники. */
  subtitle?: ReactNode;
  /** Тап по названию переименовывает. undefined — переименование недоступно. */
  onRename?: () => void;
  items: RowItem[];
  sort: ListScreenSort;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onAddNames: (names: string[]) => void;
  onClearChecked: () => void;
  onMenu: () => void;
  /** Идёт запись на сервер (общий список) — блокируем повторные отправки. */
  busy?: boolean;
  /** Плашка над списком: офлайн у общего списка. */
  banner?: ReactNode;
  /** Блок под купленным: партнёрская кнопка и её дисклеймер. */
  footer?: ReactNode;
};

/**
 * Экран одного списка — ОДИН на локальный и на общий (семейный).
 *
 * Раньше их было два: ShoppingListView (614 строк) и SharedShoppingListView
 * (791). Обе копии рисовали одну и ту же строку позиции, ту же раскладку по
 * отделам, ту же кнопку сортировки, тот же блок Купера и то же пустое
 * состояние — 1400 строк на одну сущность, которые расходились после каждой
 * правки. Разница между списками осталась там, где она есть по существу:
 * подпись под названием, офлайн-плашка, откуда берутся позиции и можно ли
 * переименовать. Всё это приходит пропсами, хранилище экран не знает.
 *
 * Порядок на экране — от главного к редкому: переключатель списков и шапка
 * сверху (их рисует хозяин), затем сами позиции, затем свёрнутое купленное,
 * затем партнёрский блок. Добавление прижато к низу и видно всегда.
 */
export default function ListScreen({
  title,
  subtitle,
  onRename,
  items,
  sort,
  onToggle,
  onRemove,
  onAddNames,
  onClearChecked,
  onMenu,
  busy = false,
  banner,
  footer,
}: Props) {
  // Купленное свёрнуто по умолчанию: в магазине нужно то, что ЕЩЁ не взяли.
  const [doneOpen, setDoneOpen] = useState(false);

  const pending = useMemo(() => items.filter((it) => !it.checked), [items]);
  const checked = useMemo(() => items.filter((it) => it.checked), [items]);

  const byName = useMemo(() => {
    const map = new Map<string, RowItem>();
    for (const it of pending) map.set(it.name.trim().toLowerCase(), it);
    return map;
  }, [pending]);

  // По отделам показываем только НЕкупленное: купленное ушло в свою группу
  // внизу, и размазывать его обратно по отделам незачем.
  const groups = useMemo(() => {
    if (!sort.grouped || !sort.groups) return null;
    return sort.groups
      .map((group) => ({
        department: group.department,
        items: group.items
          .map((name) => byName.get(name.trim().toLowerCase()))
          .filter((it): it is RowItem => Boolean(it)),
      }))
      .filter((group) => group.items.length > 0);
  }, [sort.grouped, sort.groups, byName]);

  // Подпись «для «Гречка с курицей»» — один раз на группу подряд идущих
  // позиций одного рецепта, а не под каждой строкой. Соседство считается в том
  // порядке, в котором строки РИСУЮТСЯ: внутри отдела своя нумерация, и первая
  // позиция рецепта в каждом отделе снова получает подпись — иначе в разделе
  // «Молочное» стояла бы позиция рецепта без всякого объяснения.
  const renderRows = (rows: RowItem[]) =>
    rows.map((it, i) => {
      const prev = i > 0 ? rows[i - 1] : null;
      const grouped = Boolean(it.noteGroup) && prev?.noteGroup === it.noteGroup;
      return (
        <ItemRow key={it.id} item={it} onToggle={onToggle} onRemove={onRemove} showNote={!grouped} />
      );
    });

  return (
    <>
      <ListHeader title={title} subtitle={subtitle} onRename={onRename} sort={sort} onMenu={onMenu} />

      {banner}

      {sort.error && <div className="sh-error">{sort.error}</div>}

      {items.length === 0 ? (
        // Пустое состояние — две строки и стрелка к полю ввода, а не картинка
        // с абзацем текста. Абзац «Список пуст. Добавьте продукты — и я
        // расставлю их по отделам магазина…» на 375px не влезал целиком и
        // обрезался таб-баром.
        <div className="sh-empty">
          <p className="sh-empty-title">Добавьте первый продукт</p>
          <p className="sh-empty-hint">Впишите, скажите голосом или сфотографируйте список</p>
          {/* Стрелка отдельной строкой: внутри абзаца она после переноса
              уезжала в конец второй строки и показывала в пустоту. */}
          <ArrowDown className="sh-empty-arrow" size={20} aria-hidden />
        </div>
      ) : (
        <>
          {groups ? (
            groups.map((group) => (
              <section key={group.department} className="sh-group">
                <h2 className="sh-group-title">{group.department}</h2>
                <ul className="sh-list">{renderRows(group.items)}</ul>
              </section>
            ))
          ) : (
            <>
              {/* Раскладка считается на сервере: нажатие на иконку в шапке
                  уходит в запрос, если кэш не совпал с текущим набором. Пока
                  идёт — строка ровно там, где вот-вот появится первый отдел. */}
              {sort.grouped && sort.busy && (
                <div className="sh-group-title sh-group-title-busy">
                  <Loader2 size={14} className="animate-spin" aria-hidden /> Раскладываю…
                </div>
              )}
              {/* Режим «по отделам» включён, а раскладки для ЭТОГО списка нет:
                  либо её не считали (перешли на другой список), либо позиции
                  менялись после расчёта. Показываем список в порядке добавления
                  (новые позиции в старых группах не числятся и иначе просто не
                  отрисовались бы) и даём посчитать — явным нажатием, потому что
                  это вызов модели. */}
              {sort.grouped && !sort.busy && sort.state !== "ready" && (
                <button type="button" className="sh-group-title sh-group-stale" onClick={sort.onRecompute}>
                  <RefreshCw size={14} aria-hidden />{" "}
                  {sort.state === "stale" ? "Список изменился — обновить отделы" : "Разложить по отделам"}
                </button>
              )}
              <ul className="sh-list">{renderRows(pending)}</ul>
            </>
          )}

          <CheckedGroup
            items={checked}
            open={doneOpen}
            onOpenChange={setDoneOpen}
            onToggle={onToggle}
            onRemove={onRemove}
            onClear={onClearChecked}
          />

          {footer}
        </>
      )}

      <AddBar onAdd={onAddNames} busy={busy} />
    </>
  );
}
