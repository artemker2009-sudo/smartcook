"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { Copy, Pencil, Pin, PinOff, Send, Share2, Trash2, Users } from "lucide-react";

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
import { listDisplayName, type ShoppingListRecord } from "@/lib/shoppingLists";
import ListScreen from "@/components/shopping/ListScreen";
import PartnerFooter from "@/components/shopping/PartnerFooter";
import { useSortToggle } from "@/components/shopping/useSortToggle";
import type { MenuAction, RowItem } from "@/components/shopping/types";

function pluralizeProduct(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} продукт`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} продукта`;
  return `${n} продуктов`;
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
  /** Список закреплён в хабе — стоит там первым. */
  pinned: boolean;
  onTogglePin: () => void;
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
  pinned,
  onTogglePin,
}: Props) {
  const items = list.items;
  const sig = useMemo(() => listSignature(items), [items]);

  const sort = useSortToggle({
    sig,
    cache: list.sort ?? null,
    grouped,
    setGrouped: onGroupedChange,
    empty: items.length === 0,
    run: async () => {
      reachGoal("shopping_sort_click");
      const res = await fetch("/api/shopping/sort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items.map((it) => it.name) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Не удалось разложить по отделам");
      }
      const data = await res.json();
      const groups: ShoppingGroup[] = Array.isArray(data?.groups) ? data.groups : [];
      onSortChange({ sig, groups });
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

  const handleAddNames = (names: string[]) => {
    const result = addNames(items, names);
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

  // Меню верхнего уровня — ровно четыре пункта. «Поделиться» уводит во
  // вложенный лист, потому что отдать список можно ДВУМЯ способами с
  // противоположными результатами: «Позвать в общий список» — живой синхронный
  // список, «Отправить копию» — снимок в ссылке, у получателя свой список.
  // Раньше они стояли рядом в одном меню, и человек, которому нужно «чтобы
  // дочь отмечала», выбирал мёртвую копию. Теперь у них разные глаголы, разные
  // иконки, живой вариант первый, и оба объяснены подписью.
  const openMenu = () =>
    onOpenMenu([
      {
        key: "pin",
        label: pinned ? "Открепить" : "Закрепить",
        icon: pinned ? <PinOff size={20} /> : <Pin size={20} />,
        onSelect: onTogglePin,
      },
      { key: "rename", label: "Переименовать", icon: <Pencil size={20} />, onSelect: onRename },
      {
        key: "share",
        label: "Поделиться",
        icon: <Share2 size={20} />,
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
