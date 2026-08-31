"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, Loader2, Share2, ShoppingCart, Sparkles, Trash2, Users, WifiOff, X } from "lucide-react";

import { KUPER_CPA_URL, KUPER_AD_LABEL } from "@/lib/constants";
import { reachGoal } from "@/lib/metrika";
import { copyText } from "@/lib/clipboard";
import { supabase } from "@/lib/supabase";
import { MAX_SHOPPING_ITEMS, itemsToText, signatureFromNames } from "@/lib/shoppingList";
import {
  addSharedItems,
  clearSharedChecked,
  fetchSharedList,
  patchSharedItem,
  sortSharedList,
  updatePointerName,
  type SharedItem,
  type SharedMember,
  type SharedSnapshot,
  type SharedSort,
} from "@/lib/sharedShoppingList";
import { TEMP_ITEM_PREFIX, enqueue, flushPending, pendingCount } from "@/lib/sharedShoppingQueue";
import { sharedListChannelName } from "@/lib/sharedShoppingBroadcast";
import ShoppingItemInput from "@/components/ShoppingItemInput";

// Экран одного общего (семейного) списка.
//
// Модель простая и намеренно без слияния состояний на клиенте: сервер —
// единственный источник истины. Локально мы показываем изменение сразу
// (оптимистично), отправляем его и перечитываем снимок. Если двое чиркнули
// один пункт одновременно — победит последняя запись в БД, а не наша догадка.
//
// Живое обновление — Broadcast, НЕ postgres_changes: RLS на shared_*-таблицах
// намеренно не пускает anon к чтению, поэтому WAL-события до клиента не
// доходят (см. supabase_shared_shopping_lists.sql). Сервер после каждой записи
// шлёт пинг «changed», мы в ответ перечитываем.

const REFETCH_DEBOUNCE_MS = 250;

function pluralizeProduct(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} продукт`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} продукта`;
  return `${n} продуктов`;
}

function ordered(items: SharedItem[]): SharedItem[] {
  return [...items].sort((a, b) => Number(a.checked) - Number(b.checked));
}

function membersLabel(members: SharedMember[]): string {
  if (members.length === 0) return "";
  const names = members.map((m) => m.name).filter(Boolean);
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} и ещё ${names.length - 3}`;
}

type Props = {
  listId: string;
  memberRef: string;
  initial: SharedSnapshot;
  onBack: () => void;
};

export default function SharedShoppingListView({ listId, memberRef, initial, onBack }: Props) {
  const [name, setName] = useState(initial.name);
  const [items, setItems] = useState<SharedItem[]>(initial.items);
  const [members, setMembers] = useState<SharedMember[]>(initial.members);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [showMembers, setShowMembers] = useState(false);
  // Раскладка по отделам приходит с сервера вместе со снимком: посчитал один
  // участник — видят все.
  const [sort, setSort] = useState<SharedSort | null>(initial.sort ?? null);
  const [sorting, setSorting] = useState(false);
  const [sortError, setSortError] = useState<string | null>(null);

  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Не даём двум перечитываниям идти внахлёст: пинги могут прийти пачкой.
  const refetching = useRef(false);

  const syncPendingCount = useCallback(() => {
    setPending(pendingCount(listId));
  }, [listId]);

  const applySnapshot = useCallback(
    (snap: SharedSnapshot) => {
      setName(snap.name);
      setItems(snap.items);
      setMembers(snap.members);
      setSort(snap.sort ?? null);
      updatePointerName(listId, snap.name);
    },
    [listId],
  );

  const refetch = useCallback(async () => {
    if (refetching.current) return;
    refetching.current = true;
    try {
      const snap = await fetchSharedList(listId, memberRef);
      if (snap.joined) applySnapshot(snap);
      setOffline(false);
    } catch {
      // Молча: экран продолжает показывать последнее известное состояние.
      // Баннер офлайна поднимает обработчик navigator.onLine.
    } finally {
      refetching.current = false;
    }
  }, [listId, memberRef, applySnapshot]);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => void refetch(), REFETCH_DEBOUNCE_MS);
  }, [refetch]);

  // --- Живое обновление -------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel(sharedListChannelName(listId))
      .on("broadcast", { event: "changed" }, () => {
        scheduleRefetch();
      })
      .subscribe();

    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [listId, scheduleRefetch]);

  // --- Офлайн и возврат в приложение -----------------------------------------
  useEffect(() => {
    const flush = async () => {
      const ok = await flushPending(listId, memberRef);
      syncPendingCount();
      if (ok) void refetch();
    };

    const onOnline = () => {
      setOffline(false);
      void flush();
    };
    const onOffline = () => setOffline(true);
    // Вернулись во вкладку/приложение — пинг мог не дойти, пока экран спал.
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush();
    };

    if (typeof navigator !== "undefined" && navigator.onLine === false) setOffline(true);
    syncPendingCount();
    void flush();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [listId, memberRef, refetch, syncPendingCount]);

  // Подпись считается из тех же названий и той же формулой, что на сервере
  // (signatureFromNames). Разъедется формула — раскладка будет вечно считаться
  // устаревшей, поэтому она одна на обе стороны.
  const sig = useMemo(() => signatureFromNames(items.map((it) => it.name)), [items]);
  const isSorted = sort !== null && sort.sig === sig;
  const nameToItem = useMemo(() => {
    const map = new Map<string, SharedItem>();
    for (const it of items) map.set(it.name.trim().toLowerCase(), it);
    return map;
  }, [items]);

  // --- Действия ---------------------------------------------------------------

  const handleSort = async () => {
    if (items.length === 0 || sorting || isSorted) return;
    reachGoal("shopping_sort_click");
    setSorting(true);
    setSortError(null);
    try {
      const result = await sortSharedList(listId, memberRef);
      setSort(result);
      // Перечитываем снимок: пока считалась раскладка, кто-то мог чиркнуть
      // позицию, и её состояние важнее нашего локального.
      await refetch();
    } catch (e) {
      setSortError(e instanceof Error ? e.message : "Не удалось разложить по отделам");
    } finally {
      setSorting(false);
    }
  };

  const handleAddNames = async (names: string[]) => {
    if (items.length >= MAX_SHOPPING_ITEMS) {
      toast.error(`Список полон: не больше ${MAX_SHOPPING_ITEMS} позиций`);
      return;
    }

    // Оптимистично: позиции появляются сразу, до ответа сервера. tmp-id живут
    // только до ближайшего перечитывания снимка.
    const optimistic: SharedItem[] = names.map((itemName, i) => ({
      id: `${TEMP_ITEM_PREFIX}${Date.now()}-${i}`,
      name: itemName,
      checked: false,
      createdBy: memberRef,
    }));
    setItems((prev) => [...prev, ...optimistic]);
    setBusy(true);
    try {
      const result = await addSharedItems(listId, memberRef, names);
      reachGoal("shopping_shared_item_added", { count: result.added });
      if (result.limited) toast.error(`Список полон: не больше ${MAX_SHOPPING_ITEMS} позиций`);
      else if (result.added === 0 && result.duplicate > 0) toast("Это уже в списке");
      else if (result.added > 1) toast.success(`Добавлено: ${pluralizeProduct(result.added)}`);
      await refetch();
    } catch {
      // Не отменяем оптимистичную вставку: она уйдёт на сервер, когда вернётся
      // связь. Повторная отправка безопасна — сервер дедупит по названию.
      enqueue(listId, { kind: "add", names });
      syncPendingCount();
      setOffline(true);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (item: SharedItem) => {
    const next = !item.checked;
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, checked: next, checkedBy: next ? memberRef : null } : it)),
    );
    reachGoal("shopping_shared_check");
    try {
      await patchSharedItem(listId, item.id, memberRef, { checked: next });
      await refetch();
    } catch {
      enqueue(listId, { kind: "patch", itemId: item.id, checked: next });
      syncPendingCount();
      setOffline(true);
    }
  };

  const remove = async (item: SharedItem) => {
    setItems((prev) => prev.filter((it) => it.id !== item.id));
    try {
      await patchSharedItem(listId, item.id, memberRef, { deleted: true });
      await refetch();
    } catch {
      enqueue(listId, { kind: "patch", itemId: item.id, deleted: true });
      syncPendingCount();
      setOffline(true);
    }
  };

  const clearChecked = async () => {
    setItems((prev) => prev.filter((it) => !it.checked));
    try {
      await clearSharedChecked(listId, memberRef);
      await refetch();
    } catch {
      enqueue(listId, { kind: "clear" });
      syncPendingCount();
      setOffline(true);
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/shopping/join/${listId}`;
    reachGoal("shopping_shared_invite_click");
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: name, text: `Общий список покупок: ${name}`, url });
        return;
      } catch {
        // Отменили системное окно — падаем в копирование.
      }
    }
    const ok = await copyText(url);
    toast(ok ? "Ссылка скопирована — отправьте близким" : "Не удалось скопировать ссылку");
  };

  const handleCopy = async () => {
    const ok = await copyText(itemsToText(items.map((it) => ({ id: it.id, name: it.name, checked: it.checked }))));
    toast(ok ? "Список скопирован" : "Не удалось скопировать");
  };

  const hasChecked = items.some((it) => it.checked);

  // Строка позиции вынесена в функцию: при раскладке по отделам тот же ряд
  // рисуется внутри каждой группы, без раскладки — одним списком. Так же
  // устроен личный экран.
  const renderRow = (it: SharedItem) => {
    const who = it.checked && it.checkedBy ? memberByRef.get(it.checkedBy) : null;
    return (
      <li
        key={it.id}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "var(--space-3)",
          padding: "var(--space-3)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <button
          type="button"
          onClick={() => void toggle(it)}
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

        {/* Зачёркивание живёт на ВНУТРЕННЕМ span с названием, а не на кнопке.
            В CSS text-decoration протягивается сквозь потомков, и снять его
            изнутри через text-decoration: none нельзя — именно поэтому подпись
            «купил(а) …» тоже оказывалась перечёркнутой. Она не выполненный
            пункт, а пояснение, и черты на ней быть не должно. */}
        <button
          type="button"
          onClick={() => void toggle(it)}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: "left",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            padding: "2px 0",
            fontSize: "var(--font-size-heading)",
            lineHeight: 1.35,
            whiteSpace: "normal",
            overflowWrap: "anywhere",
            color: it.checked ? "var(--color-text-muted)" : "var(--color-text)",
          }}
        >
          <span style={{ textDecoration: it.checked ? "line-through" : "none" }}>{it.name}</span>
          {/* Кто уже взял — главная ценность общего списка: видно, что покупку
              закрыли, и второй раз идти не надо. */}
          {who && (
            <span
              style={{
                display: "block",
                marginTop: 2,
                fontSize: "var(--font-size-caption)",
                color: "var(--color-text-muted)",
              }}
            >
              купил(а) {who}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => void remove(it)}
          aria-label={`Убрать «${it.name}»`}
          style={{
            flexShrink: 0,
            width: 44,
            height: 44,
            marginTop: -6,
            marginRight: -8,
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
  };

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
  const memberByRef = new Map(members.map((m) => [m.memberRef, m.name]));

  return (
    <>
      <header style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", margin: "0 0 var(--space-3) 0" }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="К спискам"
          style={{
            flexShrink: 0,
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-full)",
            color: "var(--color-text)",
            cursor: "pointer",
          }}
        >
          <ArrowLeft size={22} />
        </button>
        <h1 style={{ flex: 1, minWidth: 0, margin: 0, lineHeight: 1.2, color: "var(--color-text)" }}>
          <span
            style={{
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
              overflow: "hidden",
              overflowWrap: "anywhere",
              fontSize: "var(--font-size-title)",
              fontWeight: "var(--font-weight-semibold)",
            }}
          >
            {name}
          </span>
          <button
            type="button"
            onClick={() => setShowMembers(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 2,
              padding: 0,
              border: "none",
              background: "transparent",
              fontSize: "var(--font-size-body)",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
            }}
          >
            <Users size={16} /> {membersLabel(members)}
          </button>
        </h1>
        <button
          type="button"
          onClick={handleShare}
          aria-label="Позвать в список"
          style={{
            flexShrink: 0,
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--color-accent-subtle)",
            border: "1px solid var(--color-accent)",
            borderRadius: "var(--radius-full)",
            color: "var(--color-accent)",
            cursor: "pointer",
          }}
        >
          <Share2 size={20} />
        </button>
      </header>

      {/* Офлайн: спокойное объяснение, а не ошибка. Изменения не теряются. */}
      {(offline || pending > 0) && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            marginBottom: "var(--space-3)",
            padding: "var(--space-3)",
            borderRadius: "var(--radius-sm)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)",
            fontSize: "var(--font-size-body)",
            lineHeight: 1.4,
          }}
        >
          <WifiOff size={20} style={{ flexShrink: 0, color: "var(--color-text-muted)" }} />
          <span>
            {pending > 0
              ? "Связи нет — изменения сохранены и уйдут сами, как только появится интернет."
              : "Связи нет. Список показан таким, каким был в последний раз."}
          </span>
        </div>
      )}

      <ShoppingItemInput onAdd={handleAddNames} busy={busy} />

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
          <p style={{ margin: 0, fontSize: "var(--font-size-heading)", lineHeight: 1.5, color: "var(--color-text-secondary)" }}>
            Список пуст. Добавьте продукты — их сразу увидят все, кого вы позвали.
          </p>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => void handleSort()}
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
            {sorting ? "Раскладываю по отделам…" : isSorted ? "Разложено по отделам" : "Разложить по отделам"}
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

          {isSorted && sort
            ? sort.groups.map((group) => {
                const groupItems = ordered(
                  group.items
                    .map((name) => nameToItem.get(name.trim().toLowerCase()))
                    .filter((it): it is SharedItem => Boolean(it)),
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
              onClick={() => void clearChecked()}
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

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <button
              type="button"
              onClick={handleShare}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--space-2)",
                width: "100%",
                padding: "var(--space-3) var(--space-4)",
                background: "var(--color-accent-subtle)",
                color: "var(--color-accent)",
                border: "1px solid var(--color-accent)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--font-size-body)",
                fontWeight: "var(--font-weight-semibold)",
                cursor: "pointer",
              }}
            >
              <Share2 size={20} /> Позвать в список
            </button>

            <a
              href={KUPER_CPA_URL}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={() => reachGoal("shopping_kuper_click")}
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

            <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>
              {KUPER_AD_LABEL}
            </div>
          </div>
        </>
      )}

      {/* Кто в списке */}
      {showMembers && (
        <div className="sl-overlay sl-overlay-center" onClick={() => setShowMembers(false)}>
          <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sl-modal-head">
              <h2 className="sl-modal-title">Кто в списке</h2>
              <button type="button" className="sl-modal-x" onClick={() => setShowMembers(false)} aria-label="Закрыть">
                <X size={20} />
              </button>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {members.map((m) => (
                <li
                  key={m.memberRef}
                  style={{
                    padding: "var(--space-3) 0",
                    borderBottom: "1px solid var(--color-border)",
                    fontSize: "var(--font-size-heading)",
                    color: "var(--color-text)",
                  }}
                >
                  {m.name}
                  {m.memberRef === initial.ownerRef && (
                    <span style={{ marginLeft: 8, fontSize: "var(--font-size-caption)", color: "var(--color-text-muted)" }}>
                      создал(а) список
                    </span>
                  )}
                  {m.memberRef === memberRef && (
                    <span style={{ marginLeft: 8, fontSize: "var(--font-size-caption)", color: "var(--color-accent)" }}>
                      это вы
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <button type="button" className="sl-modal-primary" onClick={handleShare} style={{ marginTop: "var(--space-3)" }}>
              Позвать ещё
            </button>
          </div>
        </div>
      )}

      {busy && (
        <div style={{ display: "flex", justifyContent: "center", padding: "var(--space-2)" }} aria-hidden>
          <Loader2 size={20} className="animate-spin" style={{ color: "var(--color-text-muted)" }} />
        </div>
      )}
    </>
  );
}
