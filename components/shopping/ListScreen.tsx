"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUpDown, Check, Loader2 } from "lucide-react";

import { SHOPPING_DEPARTMENTS, type ShoppingDepartment } from "@/lib/shoppingList";
import { splitQuantity } from "@/lib/shoppingQuantity";
import AddBar from "@/components/shopping/AddBar";
import CheckedGroup from "@/components/shopping/CheckedGroup";
import DepartmentList from "@/components/shopping/DepartmentList";
import ItemRow from "@/components/shopping/ItemRow";
import ListHeader from "@/components/shopping/ListHeader";
import MenuSheet from "@/components/shopping/MenuSheet";
import type { ListScreenSort, MenuAction, RowItem } from "@/components/shopping/types";

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
  // Позиция, которую собираются удалить. Крестик — это НЕ «куплено»: купленное
  // отмечают чекбоксом и его можно вернуть, а удаление необратимо, поэтому оно
  // спрашивает.
  const [removeTarget, setRemoveTarget] = useState<RowItem | null>(null);
  // Позиция, для которой открыто меню «Переместить в отдел…».
  const [moveTarget, setMoveTarget] = useState<RowItem | null>(null);

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
  const showNote = (rows: RowItem[]) => (it: RowItem, i: number) => {
    const prev = i > 0 ? rows[i - 1] : null;
    return !(Boolean(it.noteGroup) && prev?.noteGroup === it.noteGroup);
  };

  const renderRows = (rows: RowItem[]) => {
    const note = showNote(rows);
    return rows.map((it, i) => (
      <ItemRow key={it.id} item={it} onToggle={onToggle} onRemove={() => setRemoveTarget(it)} showNote={note(it, i)} />
    ));
  };

  // Отдел, в котором позиция лежит сейчас: в меню он отмечен галочкой и не
  // предлагается как цель переноса.
  const departmentOf = (item: RowItem): ShoppingDepartment | null =>
    groups?.find((g) => g.items.some((x) => x.id === item.id))?.department ?? null;

  const moveActions = (item: RowItem): MenuAction[] => {
    const current = departmentOf(item);
    return SHOPPING_DEPARTMENTS.map((department) => ({
      key: department,
      label: department,
      // Галочка у текущего отдела — единственный способ понять, откуда
      // переносим: в списке отделов заголовок группы уже не виден.
      icon: department === current ? <Check size={20} /> : <span className="sl-sheet-gap" aria-hidden />,
      onSelect:
        department === current
          ? undefined
          : () => {
              sort.onMove?.(item.name, department);
            },
    }));
  };

  return (
    <>
      <ListHeader title={title} subtitle={subtitle} onRename={onRename} onMenu={onMenu} />

      {/* Раскладка по отделам — чипом с ТЕКСТОМ под заголовком, а не иконкой
          рядом с ним. Иконка-кружок ничего не объясняла, и функцию просто не
          находили. Чип честно говорит и что будет, и что уже сделано.

          Про стоимость: раскладку считает модель на сервере. Кэш совпал с
          текущим набором позиций — переключение мгновенное и без сети; не
          совпал — уходит запрос, и это видно («Раскладываю…» со спиннером). */}
      {items.length > 0 && (
        <button
          type="button"
          className={sort.grouped && sort.state === "ready" ? "sh-sort sh-sort-on" : "sh-sort"}
          // Раскладка устарела — нажатие ПЕРЕСЧИТЫВАЕТ её, а не выключает
          // режим: человек хочет увидеть отделы для нового набора позиций, и
          // выключить их ему предлагать незачем.
          onClick={
            sort.busy
              ? undefined
              : sort.grouped && sort.state === "stale"
                ? sort.onRecompute
                : sort.onToggle
          }
          disabled={sort.busy}
          aria-pressed={sort.grouped}
        >
          {sort.busy ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden /> Раскладываю…
            </>
          ) : sort.grouped && sort.state === "ready" ? (
            <>
              <Check size={16} aria-hidden /> По отделам
              <span className="sh-sort-off">· вернуть порядок</span>
            </>
          ) : sort.grouped && sort.state === "stale" ? (
            <>
              <ArrowUpDown size={16} aria-hidden /> Список изменился — обновить отделы
            </>
          ) : (
            <>
              <ArrowUpDown size={16} aria-hidden /> Разложить по отделам
            </>
          )}
        </button>
      )}

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
                <DepartmentList
                  department={group.department}
                  items={group.items}
                  onToggle={onToggle}
                  onRemove={setRemoveTarget}
                  showNote={showNote(group.items)}
                  onOpenItemMenu={sort.onMove ? setMoveTarget : undefined}
                  onReorder={sort.onReorder}
                />
              </section>
            ))
          ) : (
            // Режим «по отделам» включён, а раскладки для ЭТОГО списка ещё
            // нет (считается прямо сейчас или устарела) — показываем в порядке
            // добавления. Что происходит и что нажать, говорит чип над
            // списком; дублировать это строкой внутри списка незачем.
            <ul className="sh-list">{renderRows(pending)}</ul>
          )}

          <CheckedGroup
            items={checked}
            open={doneOpen}
            onOpenChange={setDoneOpen}
            onToggle={onToggle}
            onRemove={(id) => {
              const it = checked.find((x) => x.id === id);
              if (it) setRemoveTarget(it);
            }}
            onClear={onClearChecked}
          />

          {footer}
        </>
      )}

      <AddBar onAdd={onAddNames} busy={busy} />

      {/* Меню позиции. Открывается долгим нажатием по строке и нажатием на
          ручку. Отделов девять — они и есть всё меню, лишних пунктов тут нет. */}
      {moveTarget && (
        <MenuSheet
          title={`Переместить «${splitQuantity(moveTarget.name).label}»`}
          actions={moveActions(moveTarget)}
          onClose={() => setMoveTarget(null)}
        />
      )}

      {/* Удаление позиции. Отменить его нельзя, а крестик стоит в каждой
          строке в двух сантиметрах от чекбокса — без вопроса продукт исчезал
          от промаха пальцем. */}
      {removeTarget && (
        <div className="sl-overlay sl-overlay-center" onClick={() => setRemoveTarget(null)}>
          <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="sl-modal-title" style={{ marginBottom: "var(--space-2)" }}>
              {/* Спрашиваем про НАЗВАНИЕ, без количества: в строке списка
                  человек видит «Куриные бёдра» и «1 кг» по отдельности, и в
                  вопросе «Удалить «Куриные бёдра 1 кг»?» количество только
                  удлиняет заголовок. */}
              Удалить «{splitQuantity(removeTarget.name).label}»?
            </h2>
            <p style={{ margin: "0 0 var(--space-4) 0", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              Продукт пропадёт из списка. Чтобы отметить его купленным, поставьте галочку слева.
            </p>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button type="button" className="sl-modal-secondary" onClick={() => setRemoveTarget(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="sl-modal-danger"
                onClick={() => {
                  onRemove(removeTarget.id);
                  setRemoveTarget(null);
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
