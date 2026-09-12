"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, LogOut, Share2, Users, WifiOff, X } from "lucide-react";

import { copyText } from "@/lib/clipboard";
import { reachGoal } from "@/lib/metrika";
import { supabase } from "@/lib/supabase";
import { MAX_SHOPPING_ITEMS, itemsToText, signatureFromNames } from "@/lib/shoppingList";
import {
  addSharedItems,
  clearSharedChecked,
  fetchSharedList,
  parseSnapshotUpdatedAt,
  patchSharedItem,
  sortSharedList,
  updatePointerMeta,
  updatePointerName,
  type SharedItem,
  type SharedMember,
  type SharedSnapshot,
  type SharedSort,
} from "@/lib/sharedShoppingList";
import { TEMP_ITEM_PREFIX, enqueue, flushPending, pendingCount } from "@/lib/sharedShoppingQueue";
import { sharedListChannelName } from "@/lib/sharedShoppingBroadcast";
import ListScreen from "@/components/shopping/ListScreen";
import PartnerFooter from "@/components/shopping/PartnerFooter";
import { useSortToggle } from "@/components/shopping/useSortToggle";
import type { MenuAction } from "@/components/shopping/LocalList";
import type { RowItem } from "@/components/shopping/types";

// Общий (семейный) список поверх того же экрана, что и локальный.
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
  grouped: boolean;
  onGroupedChange: (grouped: boolean) => void;
  onOpenMenu: (menu: MenuAction[]) => void;
  /** Убрать список с этого устройства (подтверждение спрашивает хозяин). */
  onForget: () => void;
};

export default function SharedList({
  listId,
  memberRef,
  initial,
  grouped,
  onGroupedChange,
  onOpenMenu,
  onForget,
}: Props) {
  const [name, setName] = useState(initial.name);
  const [items, setItems] = useState<SharedItem[]>(initial.items);
  const [members, setMembers] = useState<SharedMember[]>(initial.members);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [showMembers, setShowMembers] = useState(false);
  // Раскладка по отделам приходит с сервера вместе со снимком: посчитал один
  // участник — видят все.
  const [sortCache, setSortCache] = useState<SharedSort | null>(initial.sort ?? null);

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
      setSortCache(snap.sort ?? null);
      updatePointerName(listId, snap.name);
      // Карточка в хабе показывает «5/12» и «обновлён сегодня 17:10» ещё до
      // открытия списка — значит эти два числа надо запомнить, пока список
      // открыт: позиции-то лежат на сервере.
      updatePointerMeta(listId, {
        counts: {
          total: snap.items.length,
          done: snap.items.filter((it) => it.checked).length,
        },
        updatedAt: parseSnapshotUpdatedAt(snap.updatedAt),
      });
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

  const sort = useSortToggle({
    sig,
    cache: sortCache,
    grouped,
    setGrouped: onGroupedChange,
    empty: items.length === 0,
    run: async () => {
      reachGoal("shopping_sort_click");
      const result = await sortSharedList(listId, memberRef);
      setSortCache(result);
      // Перечитываем снимок: пока считалась раскладка, кто-то мог чиркнуть
      // позицию, и её состояние важнее нашего локального.
      await refetch();
    },
  });

  const memberByRef = useMemo(() => new Map(members.map((m) => [m.memberRef, m.name])), [members]);

  // Кто уже взял — главная ценность общего списка: видно, что покупку закрыли,
  // и второй раз идти не надо.
  const rows: RowItem[] = useMemo(
    () =>
      items.map((it) => {
        const who = it.checked && it.checkedBy ? memberByRef.get(it.checkedBy) : null;
        return { id: it.id, name: it.name, checked: it.checked, note: who ? `купил(а) ${who}` : null };
      }),
    [items, memberByRef],
  );

  // --- Действия ---------------------------------------------------------------

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

  const toggle = async (id: string) => {
    const item = items.find((it) => it.id === id);
    if (!item) return;
    const next = !item.checked;
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, checked: next, checkedBy: next ? memberRef : null } : it)),
    );
    reachGoal("shopping_shared_check");
    try {
      await patchSharedItem(listId, id, memberRef, { checked: next });
      await refetch();
    } catch {
      enqueue(listId, { kind: "patch", itemId: id, checked: next });
      syncPendingCount();
      setOffline(true);
    }
  };

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    try {
      await patchSharedItem(listId, id, memberRef, { deleted: true });
      await refetch();
    } catch {
      enqueue(listId, { kind: "patch", itemId: id, deleted: true });
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
    // Приглашение в общий список (/shopping/join/<id>) — не копия.
    toast(ok ? "Ссылка скопирована. Список общий — галочки видны всем" : "Не удалось скопировать ссылку");
  };

  const handleCopy = async () => {
    const ok = await copyText(itemsToText(items.map((it) => ({ id: it.id, name: it.name, checked: it.checked }))));
    toast(ok ? "Список скопирован" : "Не удалось скопировать");
  };

  // Переименования общего списка пока нет: для него нужен серверный роут (имя
  // живёт в БД и видно всем участникам). Поэтому и тап по названию тут ничего
  // не делает — см. ListHeader, он не рисует «мёртвую» кнопку.
  const openMenu = () =>
    onOpenMenu([
      { key: "invite", label: "Позвать в список", icon: <Share2 size={20} />, onSelect: () => void handleShare() },
      {
        key: "members",
        label: "Кто в списке",
        icon: <Users size={20} />,
        onSelect: () => setShowMembers(true),
      },
      { key: "copy-text", label: "Скопировать текстом", icon: <Copy size={20} />, onSelect: () => void handleCopy() },
      { key: "forget", label: "Убрать у себя", icon: <LogOut size={20} />, danger: true, onSelect: onForget },
    ]);

  return (
    <>
      <ListScreen
        title={name}
        subtitle={
          <button type="button" className="sh-head-members" onClick={() => setShowMembers(true)}>
            <Users size={15} aria-hidden /> {membersLabel(members)}
          </button>
        }
        items={rows}
        sort={sort}
        onToggle={(id) => void toggle(id)}
        onRemove={(id) => void remove(id)}
        onAddNames={(names) => void handleAddNames(names)}
        onClearChecked={() => void clearChecked()}
        onMenu={openMenu}
        busy={busy}
        banner={
          // Офлайн: спокойное объяснение, а не ошибка. Изменения не теряются.
          (offline || pending > 0) && (
            <div className="sh-offline" role="status">
              <WifiOff size={20} style={{ flexShrink: 0, color: "var(--color-text-muted)" }} />
              <span>
                {pending > 0
                  ? "Связи нет — изменения сохранены и уйдут сами, как только появится интернет."
                  : "Связи нет. Список показан таким, каким был в последний раз."}
              </span>
            </div>
          )
        }
        footer={<PartnerFooter items={items} />}
      />

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
            <button
              type="button"
              className="sl-modal-primary"
              onClick={() => void handleShare()}
              style={{ marginTop: "var(--space-3)" }}
            >
              Позвать ещё
            </button>
          </div>
        </div>
      )}
    </>
  );
}
