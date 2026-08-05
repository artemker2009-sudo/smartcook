"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, Copy, Loader2, Plus, ShoppingCart, Sparkles, Trash2, X } from "lucide-react";

import { KUPER_CPA_URL, KUPER_AD_LABEL } from "@/lib/constants";
import { reachGoal } from "@/lib/metrika";
import { copyText } from "@/lib/clipboard";
import {
  MAX_SHOPPING_ITEMS,
  type ShoppingGroup,
  type ShoppingItem,
  addFromInput,
  groupsToText,
  itemsToText,
  listSignature,
  loadItems,
  loadSortCache,
  saveItems,
  saveSortCache,
} from "@/lib/shoppingList";

const EMPTY_TEXT =
  "Список пуст. Добавьте продукты — и я расставлю их по отделам магазина, чтобы ничего не забыть и не ходить по залу дважды.";

// Позиции внутри группы/списка: сначала невычеркнутые (в своём порядке), потом
// купленные (серым, вниз). Стабильно — не пересортировываем при каждом рендере.
function ordered(items: ShoppingItem[]): ShoppingItem[] {
  return [...items].sort((a, b) => Number(a.checked) - Number(b.checked));
}

export default function ShoppingApp() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [input, setInput] = useState("");
  const [sortedGroups, setSortedGroups] = useState<ShoppingGroup[] | null>(null);
  const [sortedSig, setSortedSig] = useState<string | null>(null);
  const [sorting, setSorting] = useState(false);
  const [sortError, setSortError] = useState<string | null>(null);

  // Первичная загрузка списка и кэша сортировки + цель открытия раздела.
  useEffect(() => {
    const loaded = loadItems();
    setItems(loaded);
    const cache = loadSortCache();
    if (cache && cache.sig === listSignature(loaded)) {
      setSortedGroups(cache.groups);
      setSortedSig(cache.sig);
    }
    reachGoal("shopping_list_open");

    // Синхронизация между вкладками: список поправили в другой вкладке (или
    // добавили из рецепта) — перечитываем. Своя вкладка событие 'storage' не
    // получает, поэтому цикла сохранений нет.
    const onStorage = () => setItems(loadItems());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const sig = useMemo(() => listSignature(items), [items]);
  const isSorted = sortedGroups !== null && sortedSig === sig;
  const hasChecked = items.some((it) => it.checked);
  const nameToItem = useMemo(() => {
    const map = new Map<string, ShoppingItem>();
    for (const it of items) map.set(it.name.trim().toLowerCase(), it);
    return map;
  }, [items]);

  const persist = (next: ShoppingItem[]) => {
    setItems(next);
    saveItems(next);
  };

  const handleAdd = () => {
    if (!input.trim()) return;
    const result = addFromInput(items, input);
    setInput("");
    if (result.added > 0) {
      persist(result.items);
      reachGoal("shopping_item_added");
    }
    if (result.limited) {
      toast.error(`Список полон: не больше ${MAX_SHOPPING_ITEMS} позиций`);
    } else if (result.added === 0 && result.duplicate > 0) {
      toast("Такой продукт уже в списке");
    }
  };

  const toggle = (id: string) => {
    persist(items.map((it) => (it.id === id ? { ...it, checked: !it.checked } : it)));
  };

  const remove = (id: string) => {
    persist(items.filter((it) => it.id !== id));
  };

  const clearChecked = () => {
    persist(items.filter((it) => !it.checked));
  };

  const handleSort = async () => {
    if (items.length === 0 || sorting) return;
    reachGoal("shopping_sort_click");

    const cache = loadSortCache();
    if (cache && cache.sig === sig) {
      setSortedGroups(cache.groups);
      setSortedSig(sig);
      return;
    }

    setSorting(true);
    setSortError(null);
    try {
      const res = await fetch("/api/shopping/sort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items.map((it) => it.name) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Не удалось отсортировать список");
      }
      const data = await res.json();
      const groups: ShoppingGroup[] = Array.isArray(data?.groups) ? data.groups : [];
      setSortedGroups(groups);
      setSortedSig(sig);
      saveSortCache({ sig, groups });
    } catch (e) {
      setSortError(e instanceof Error ? e.message : "Не удалось отсортировать список");
    } finally {
      setSorting(false);
    }
  };

  const handleCopy = async () => {
    const text = isSorted && sortedGroups ? groupsToText(sortedGroups) : itemsToText(items);
    const ok = await copyText(text);
    toast(ok ? "Список скопирован" : "Не удалось скопировать");
  };

  const handleKuper = () => {
    reachGoal("shopping_kuper_click");
  };

  // Одна строка списка: круглый чекбокс (тап — вычеркнул), название, крестик.
  const renderRow = (it: ShoppingItem) => (
    <li
      key={it.id}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-3)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <button
        type="button"
        onClick={() => toggle(it.id)}
        aria-pressed={it.checked}
        aria-label={it.checked ? `Вернуть «${it.name}»` : `Вычеркнуть «${it.name}»`}
        style={{
          flexShrink: 0,
          width: 30,
          height: 30,
          borderRadius: "var(--radius-full)",
          border: `2px solid ${it.checked ? "var(--color-accent)" : "var(--color-border)"}`,
          background: it.checked ? "var(--color-accent)" : "var(--color-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {it.checked && <Check size={18} color="#fff" strokeWidth={3} />}
      </button>

      <button
        type="button"
        onClick={() => toggle(it.id)}
        style={{
          flex: 1,
          textAlign: "left",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          padding: 0,
          fontSize: "var(--font-size-heading)",
          lineHeight: 1.3,
          color: it.checked ? "var(--color-text-muted)" : "var(--color-text)",
          textDecoration: it.checked ? "line-through" : "none",
        }}
      >
        {it.name}
      </button>

      <button
        type="button"
        onClick={() => remove(it.id)}
        aria-label={`Удалить «${it.name}»`}
        style={{
          flexShrink: 0,
          width: 40,
          height: 40,
          borderRadius: "var(--radius-full)",
          border: "none",
          background: "transparent",
          color: "var(--color-text-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <X size={22} />
      </button>
    </li>
  );

  const listCard = (children: ReactNode) => (
    <ul
      style={{
        listStyle: "none",
        margin: "0 0 var(--space-4) 0",
        padding: 0,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
      }}
    >
      {children}
    </ul>
  );

  return (
    <main className="container">
      <header style={{ margin: "0 0 var(--space-4) 0" }}>
        <h1
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            fontSize: "var(--font-size-title)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text)",
            margin: 0,
          }}
        >
          <ShoppingCart size={28} color="var(--color-accent)" /> Покупки
        </h1>
      </header>

      {/* Ввод: поле + «Добавить». Enter работает; запятая = несколько продуктов. */}
      <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Молоко, хлеб, яйца…"
          aria-label="Добавить продукт"
          enterKeyHint="done"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "var(--space-3)",
            fontSize: "var(--font-size-heading)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
          }}
        />
        <button
          type="button"
          onClick={handleAdd}
          aria-label="Добавить"
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-1)",
            padding: "0 var(--space-4)",
            background: "var(--color-accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--font-size-body)",
            fontWeight: "var(--font-weight-semibold)",
            cursor: "pointer",
          }}
        >
          <Plus size={22} strokeWidth={2.6} />
          Добавить
        </button>
      </div>

      {items.length === 0 ? (
        <div
          style={{
            background: "var(--color-surface)",
            border: "1px dashed var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-5) var(--space-4)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: "var(--space-3)" }}>🛒</div>
          <p
            style={{
              margin: 0,
              fontSize: "var(--font-size-heading)",
              lineHeight: 1.5,
              color: "var(--color-text-secondary)",
            }}
          >
            {EMPTY_TEXT}
          </p>
        </div>
      ) : (
        <>
          {/* Умная сортировка. */}
          <button
            type="button"
            onClick={handleSort}
            disabled={sorting}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
              width: "100%",
              padding: "var(--space-3) var(--space-4)",
              marginBottom: "var(--space-3)",
              background: isSorted ? "var(--color-accent-subtle)" : "var(--color-accent)",
              color: isSorted ? "var(--color-accent)" : "#fff",
              border: isSorted ? "1px solid var(--color-accent)" : "none",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--font-size-heading)",
              fontWeight: "var(--font-weight-semibold)",
              cursor: sorting ? "wait" : "pointer",
              opacity: sorting ? 0.7 : 1,
            }}
          >
            {sorting ? <Loader2 size={22} className="animate-spin" /> : <Sparkles size={22} />}
            {sorting ? "Раскладываю по отделам…" : isSorted ? "Отсортировано по отделам" : "Умная сортировка"}
          </button>

          {sortError && (
            <div
              style={{
                marginBottom: "var(--space-3)",
                padding: "var(--space-3)",
                borderRadius: "var(--radius-sm)",
                background: "var(--color-danger-subtle)",
                color: "var(--color-danger)",
                fontSize: "var(--font-size-body)",
              }}
            >
              {sortError}
            </div>
          )}

          {/* Список: сгруппированный после сортировки, иначе плоский. */}
          {isSorted && sortedGroups
            ? sortedGroups.map((group) => {
                const groupItems = ordered(
                  group.items
                    .map((name) => nameToItem.get(name.trim().toLowerCase()))
                    .filter((it): it is ShoppingItem => Boolean(it)),
                );
                if (groupItems.length === 0) return null;
                return (
                  <section key={group.department} style={{ marginBottom: "var(--space-3)" }}>
                    <h2
                      style={{
                        margin: "0 0 var(--space-2) var(--space-1)",
                        fontSize: "var(--font-size-caption)",
                        fontWeight: "var(--font-weight-semibold)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--color-accent)",
                      }}
                    >
                      {group.department}
                    </h2>
                    {listCard(groupItems.map(renderRow))}
                  </section>
                );
              })
            : listCard(ordered(items).map(renderRow))}

          {hasChecked && (
            <button
              type="button"
              onClick={clearChecked}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--space-2)",
                width: "100%",
                padding: "var(--space-3)",
                marginBottom: "var(--space-4)",
                background: "var(--color-surface)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--font-size-body)",
                fontWeight: "var(--font-weight-medium)",
                cursor: "pointer",
              }}
            >
              <Trash2 size={20} /> Очистить купленное
            </button>
          )}

          {/* Действия внизу: заказ в Купере (реклама) + копирование текстом. */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <a
              href={KUPER_CPA_URL}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={handleKuper}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--space-2)",
                width: "100%",
                padding: "var(--space-3) var(--space-4)",
                background: "var(--color-accent)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--font-size-heading)",
                fontWeight: "var(--font-weight-semibold)",
                textDecoration: "none",
              }}
            >
              <ShoppingCart size={22} /> Заказать всё в Купере
            </a>

            <button
              type="button"
              onClick={handleCopy}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--space-2)",
                width: "100%",
                padding: "var(--space-3)",
                background: "var(--color-surface)",
                color: "var(--color-accent)",
                border: "1px solid var(--color-accent)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--font-size-body)",
                fontWeight: "var(--font-weight-semibold)",
                cursor: "pointer",
              }}
            >
              <Copy size={20} /> Скопировать список
            </button>

            {/* Обязательная маркировка рекламы (erid в ссылке Купера). */}
            <div
              style={{
                fontSize: "var(--font-size-caption)",
                color: "var(--color-text-muted)",
                lineHeight: 1.4,
              }}
            >
              {KUPER_AD_LABEL}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
