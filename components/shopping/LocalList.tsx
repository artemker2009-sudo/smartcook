"use client";

import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Copy, Pencil, Send, Trash2, Users } from "lucide-react";

import { copyText } from "@/lib/clipboard";
import { reachGoal } from "@/lib/metrika";
import {
  MAX_SHOPPING_ITEMS,
  addNames,
  groupsToText,
  itemsToText,
  listSignature,
  type ShoppingGroup,
  type ShoppingItem,
  type SortCache,
} from "@/lib/shoppingList";
import { departmentsFromGroups, nameKey, placeNames, uncoveredNames } from "@/lib/shoppingDepartments";
import { listDisplayName, type ShoppingListRecord } from "@/lib/shoppingLists";
import ListScreen from "@/components/shopping/ListScreen";
import PartnerFooter from "@/components/shopping/PartnerFooter";
import { useAutoPlace } from "@/components/shopping/useAutoPlace";
import { useSortToggle } from "@/components/shopping/useSortToggle";
import type { MenuAction, RowItem } from "@/components/shopping/types";

function pluralizeProduct(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} продукт`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} продукта`;
  return `${n} продуктов`;
}

/** Раскладка через /api/shopping/sort. Сервер ничего не хранит. */
async function requestGroups(names: string[]): Promise<ShoppingGroup[]> {
  const res = await fetch("/api/shopping/sort", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: names }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || "Не удалось разложить по отделам");
  }
  const data = await res.json();
  return Array.isArray(data?.groups) ? data.groups : [];
}

type Props = {
  list: ShoppingListRecord;
  grouped: boolean;
  onGroupedChange: (grouped: boolean) => void;
  onItemsChange: (items: ShoppingItem[]) => void;
  onSortChange: (sort: SortCache | null) => void;
  onOpenMenu: (menu: MenuAction[]) => void;
  onRename: () => void;
  onDelete: () => void;
  onShareCopy: () => void;
  onMakeShared: () => void;
};

/**
 * Локальный список (localStorage) поверх общего экрана.
 *
 * Всё, что знает про хранилище, живёт здесь: добавление через addNames,
 * переключение отметки, кэш раскладки в самом списке. Экран (ListScreen) про
 * localStorage не знает ничего — ровно такой же хозяин есть у общего списка.
 */
export default function LocalList({
  list,
  grouped,
  onGroupedChange,
  onItemsChange,
  onSortChange,
  onOpenMenu,
  onRename,
  onDelete,
  onShareCopy,
  onMakeShared,
}: Props) {
  const items = list.items;
  const names = useMemo(() => items.map((it) => it.name), [items]);

  // Дописывание раскладки заканчивается ПОСЛЕ сетевого запроса, а за это время
  // человек мог добавить ещё что-то. Сохранять надо поверх самого свежего
  // списка, а не того, что был при старте таймера.
  const latest = useRef({ list, onSortChange });
  useEffect(() => {
    latest.current = { list, onSortChange };
  });

  const cache = useAutoPlace({
    names,
    cache: list.sort ?? null,
    active: grouped,
    sync: async ({ unknown, lookup }) => {
      let fromModel: ShoppingGroup[] = [];
      let failure: unknown = null;
      if (unknown.length > 0) {
        try {
          fromModel = await requestGroups(unknown);
        } catch (e) {
          failure = e;
        }
      }

      // Найденное в словаре сохраняем даже при сбое модели: иначе после
      // перезагрузки «сметана» снова считалась бы неразложенной.
      const { list: fresh, onSortChange: save } = latest.current;
      if (fresh.sort) {
        const freshNames = fresh.items.map((it) => it.name);
        const modelDepartments = departmentsFromGroups(fromModel);
        const placements = uncoveredNames(fresh.sort.groups, freshNames).flatMap((name) => {
          const department = modelDepartments.get(nameKey(name)) ?? lookup(name);
          return department ? [{ name, department }] : [];
        });
        if (placements.length > 0) {
          save({ sig: listSignature(fresh.items), groups: placeNames(fresh.sort.groups, placements, freshNames) });
        }
      }

      if (failure) throw failure;
      return fromModel;
    },
  });

  const sort = useSortToggle({
    names,
    cache,
    grouped,
    setGrouped: onGroupedChange,
    empty: items.length === 0,
    run: async () => {
      reachGoal("shopping_sort_click");
      const groups = await requestGroups(names);
      onSortChange({ sig: listSignature(items), groups });
    },
  });

  // Подпись «для «Борщ»» — только у продуктов, приехавших с экрана рецепта.
  // Без неё через день непонятно, зачем это куплено. noteGroup склеивает
  // позиции ОДНОГО рецепта: подпись рисуется у первой из них, остальные идут
  // подряд без повторов (см. ListScreen.renderRows).
  const rows: RowItem[] = useMemo(
    () =>
      items.map((it) => ({
        id: it.id,
        name: it.name,
        checked: it.checked,
        note: it.source ? `для «${it.source}»` : null,
        noteGroup: it.source ?? null,
      })),
    [items],
  );

  const handleAddNames = (newNames: string[]) => {
    const result = addNames(items, newNames);
    if (result.added > 0) {
      onItemsChange(result.items);
      reachGoal("shopping_item_added");
      // Добавили сразу несколько — подтверждаем, сколько именно распознали.
      if (result.added > 1) toast.success(`Добавлено: ${pluralizeProduct(result.added)}`);
    }
    if (result.limited) {
      toast.error(`Список полон: не больше ${MAX_SHOPPING_ITEMS} позиций`);
    } else if (result.added === 0 && result.duplicate > 0) {
      toast("Такой продукт уже в списке");
    }
  };

  const handleCopy = async () => {
    const text = sort.groups ? groupsToText(sort.groups) : itemsToText(items);
    const ok = await copyText(text);
    toast(ok ? "Список скопирован" : "Не удалось скопировать");
  };

  // Внутри списка — три пункта. «Закрепить» живёт в меню карточки в хабе: это
  // порядок списков в хабе, и решать его уместно там, где этот порядок видно.
  //
  // «Поделиться» уводит во вложенный лист, потому что отдать список можно ДВУМЯ
  // способами с противоположными результатами: «Позвать в общий список» —
  // живой синхронный список, «Отправить копию» — снимок в ссылке, у получателя
  // свой список. Раньше они стояли рядом в одном меню, и человек, которому
  // нужно «чтобы дочь отмечала», выбирал мёртвую копию.
  const openMenu = () =>
    onOpenMenu([
      { key: "rename", label: "Переименовать", icon: <Pencil size={20} />, onSelect: onRename },
      {
        key: "share",
        label: "Поделиться",
        icon: <Users size={20} />,
        next: {
          title: "Поделиться списком",
          actions: [
            { key: "shared", label: "Позвать в общий список", icon: <Users size={20} />, onSelect: onMakeShared },
            { key: "copy-link", label: "Отправить копию", icon: <Send size={20} />, onSelect: onShareCopy },
            { key: "copy-text", label: "Скопировать текстом", icon: <Copy size={20} />, onSelect: () => void handleCopy() },
          ],
        },
      },
      { key: "delete", label: "Удалить список", icon: <Trash2 size={20} />, danger: true, onSelect: onDelete },
    ]);

  return (
    <ListScreen
      // Короткое имя, как в хабе: у легаси-списков «Покупки, 9 сентября» слово
      // «Покупки» в шапке дублировало бы название раздела. Переименование
      // работает с полным именем из хранилища.
      title={listDisplayName(list.name)}
      onRename={onRename}
      items={rows}
      sort={sort}
      onToggle={(id) => onItemsChange(items.map((it) => (it.id === id ? { ...it, checked: !it.checked } : it)))}
      onRemove={(id) => onItemsChange(items.filter((it) => it.id !== id))}
      onAddNames={handleAddNames}
      onClearChecked={() => onItemsChange(items.filter((it) => !it.checked))}
      onMenu={openMenu}
      footer={<PartnerFooter items={items} />}
    />
  );
}
