"use client";

import { useMemo } from "react";
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
import type { ShoppingListRecord } from "@/lib/shoppingLists";
import ListScreen from "@/components/shopping/ListScreen";
import PartnerFooter from "@/components/shopping/PartnerFooter";
import { useSortToggle } from "@/components/shopping/useSortToggle";
import type { RowItem } from "@/components/shopping/types";

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
};

/** Пункт меню «⋯». Собирается хозяином списка, рисуется общим нижним листом. */
export type MenuAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  onSelect: () => void;
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
  // Без неё через день непонятно, зачем это куплено.
  const rows: RowItem[] = useMemo(
    () => items.map((it) => ({ id: it.id, name: it.name, checked: it.checked, note: it.source ? `для «${it.source}»` : null })),
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

  // Два способа отдать список ведут к ПРОТИВОПОЛОЖНЫМ результатам: «Позвать в
  // общий список» — живой синхронный список, «Отправить копию» — снимок в
  // ссылке, у получателя свой список. Поэтому у них разные глаголы, разные
  // иконки и живой вариант стоит первым.
  const openMenu = () =>
    onOpenMenu([
      { key: "shared", label: "Позвать в общий список", icon: <Users size={20} />, onSelect: onMakeShared },
      { key: "copy-link", label: "Отправить копию", icon: <Send size={20} />, onSelect: onShareCopy },
      { key: "copy-text", label: "Скопировать текстом", icon: <Copy size={20} />, onSelect: () => void handleCopy() },
      { key: "rename", label: "Переименовать", icon: <Pencil size={20} />, onSelect: onRename },
      { key: "delete", label: "Удалить список", icon: <Trash2 size={20} />, danger: true, onSelect: onDelete },
    ]);

  return (
    <ListScreen
      title={list.name}
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
