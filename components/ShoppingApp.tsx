"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, MoreHorizontal, Pencil, Plus, Share2, ShoppingCart, Trash2, X } from "lucide-react";

import { reachGoal } from "@/lib/metrika";
import { copyText } from "@/lib/clipboard";
import { addNames, itemsToText, type ShoppingItem, type SortCache } from "@/lib/shoppingList";
import {
  createList,
  deleteList,
  formatListDate,
  listProgress,
  loadLists,
  renameList,
  setListItems,
  setListSort,
  type ShoppingListRecord,
} from "@/lib/shoppingLists";
import { buildShareUrl, canShareByLink, decodeSharedList, SHARE_PARAM, type SharedPayload } from "@/lib/shoppingShare";
import ShoppingListView from "@/components/ShoppingListView";
import ShoppingSharedImport from "@/components/ShoppingSharedImport";

function pluralizePositions(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} позиция`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} позиции`;
  return `${n} позиций`;
}

export default function ShoppingApp() {
  const router = useRouter();
  const [lists, setLists] = useState<ShoppingListRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [shared, setShared] = useState<SharedPayload | null>(null);

  // Модалки
  const [sheetList, setSheetList] = useState<ShoppingListRecord | null>(null); // меню списка
  const [renameTarget, setRenameTarget] = useState<ShoppingListRecord | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ShoppingListRecord | null>(null);
  const [shareBig, setShareBig] = useState<ShoppingListRecord | null>(null); // список слишком большой для ссылки

  useEffect(() => {
    // Инициализация вынесена в функцию: localStorage/URL читаются только на
    // клиенте, а setState не вызывается синхронно прямо в теле эффекта.
    const init = () => {
      // Разбираем ?shared= (данные из URL — decodeSharedList жёстко санитизирует
      // и возвращает null на мусор, страница не ломается).
      let sharedPayload: SharedPayload | null = null;
      try {
        const params = new URLSearchParams(window.location.search);
        const enc = params.get(SHARE_PARAM);
        if (enc) sharedPayload = decodeSharedList(enc);
      } catch {
        // невалидный URL — просто показываем хаб
      }
      setShared(sharedPayload);
      setLists(loadLists());
      setLoaded(true);
      reachGoal("shopping_list_open");
    };
    init();

    // Синхронизация между вкладками.
    const onStorage = () => setLists(loadLists());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const openList = openId ? lists.find((l) => l.id === openId) || null : null;

  // --- CRUD ---

  const handleCreate = () => {
    const { lists: next, list } = createList(lists);
    setLists(next);
    reachGoal("shopping_list_created");
    setOpenId(list.id);
  };

  const handleItemsChange = (id: string, items: ShoppingItem[]) => {
    setLists(setListItems(lists, id, items));
  };

  const handleSortChange = (id: string, sort: SortCache | null) => {
    setLists(setListSort(lists, id, sort));
  };

  const openRename = (list: ShoppingListRecord) => {
    setSheetList(null);
    setRenameValue(list.name);
    setRenameTarget(list);
  };

  const confirmRename = () => {
    if (!renameTarget) return;
    setLists(renameList(lists, renameTarget.id, renameValue));
    setRenameTarget(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setLists(deleteList(lists, id));
    if (openId === id) setOpenId(null);
    setDeleteTarget(null);
  };

  // --- Поделиться ---

  const handleShare = async (list: ShoppingListRecord) => {
    setSheetList(null);
    reachGoal("shopping_share_click");

    if (!canShareByLink(list.items.length)) {
      setShareBig(list); // слишком большой для ссылки → предложим текст
      return;
    }

    const url = buildShareUrl(
      list.name,
      list.items.map((it) => it.name),
    );

    const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }) : null;
    if (nav?.share) {
      try {
        await nav.share({ title: list.name, text: `Список покупок: ${list.name}`, url });
        return;
      } catch {
        // пользователь отменил share sheet или он недоступен — падаем в копирование
      }
    }
    const ok = await copyText(url);
    toast(ok ? "Ссылка скопирована — отправьте её кому угодно" : "Не удалось скопировать ссылку");
  };

  const copyBigAsText = async () => {
    if (!shareBig) return;
    const text = `${shareBig.name}\n${itemsToText(shareBig.items)}`;
    const ok = await copyText(text);
    toast(ok ? "Список скопирован текстом" : "Не удалось скопировать");
    setShareBig(null);
  };

  // --- Импорт из ссылки ---

  const handleImportSave = () => {
    if (!shared) return;
    const { lists: afterCreate, list } = createList(lists, shared.name);
    const withItems = addNames([], shared.items);
    const next = setListItems(afterCreate, list.id, withItems.items, null);
    setLists(next);
    reachGoal("shopping_share_import");
    clearSharedParam();
    setShared(null);
    setOpenId(list.id);
  };

  const clearSharedParam = () => {
    // Убираем ?shared= из адреса, чтобы обновление страницы не переспрашивало импорт.
    router.replace("/shopping");
  };

  const dismissShared = () => {
    clearSharedParam();
    setShared(null);
  };

  if (!loaded) {
    return <main className="container" style={{ minHeight: "60vh" }} />;
  }

  // 1) Кто-то поделился списком по ссылке — экран импорта поверх всего.
  if (shared) {
    return (
      <main className="container">
        <ShoppingSharedImport payload={shared} onSave={handleImportSave} onDismiss={dismissShared} />
      </main>
    );
  }

  // 2) Открыт конкретный список — редактор (экран из MVP).
  if (openList) {
    return (
      <main className="container">
        <ShoppingListView
          list={openList}
          onItemsChange={(items) => handleItemsChange(openList.id, items)}
          onSortChange={(sort) => handleSortChange(openList.id, sort)}
          onBack={() => setOpenId(null)}
          onShare={() => handleShare(openList)}
        />
      </main>
    );
  }

  // 3) Хаб — все списки.
  return (
    <main className="container">
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-2)",
          margin: "0 0 var(--space-4) 0",
        }}
      >
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

      <button
        type="button"
        onClick={handleCreate}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--space-2)",
          width: "100%",
          padding: "var(--space-3) var(--space-4)",
          marginBottom: "var(--space-4)",
          background: "var(--color-accent)",
          color: "#fff",
          border: "none",
          borderRadius: "var(--radius-sm)",
          fontSize: "var(--font-size-heading)",
          fontWeight: "var(--font-weight-semibold)",
          cursor: "pointer",
        }}
      >
        <Plus size={22} strokeWidth={2.6} /> Новый список
      </button>

      {lists.length === 0 ? (
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
          <p style={{ margin: "0 0 var(--space-1) 0", fontSize: "var(--font-size-heading)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>
            Здесь будут ваши списки
          </p>
          <p style={{ margin: 0, fontSize: "var(--font-size-body)", lineHeight: 1.5, color: "var(--color-text-secondary)" }}>
            Создайте первый — и я расставлю продукты по отделам магазина, чтобы ничего не забыть.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {lists.map((list) => {
            const { total, done } = listProgress(list);
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <div key={list.id} className="sl-card">
                <button type="button" className="sl-card-main" onClick={() => setOpenId(list.id)}>
                  <span className="sl-card-icon" aria-hidden>
                    <ShoppingCart size={22} />
                  </span>
                  <span className="sl-card-text">
                    <span className="sl-card-title">{list.name}</span>
                    <span className="sl-card-meta">
                      {formatListDate(list.createdAt)} · {pluralizePositions(total)}
                    </span>
                    {total > 0 && (
                      <>
                        <span className="sl-progress-track" aria-hidden>
                          <span className="sl-progress-fill" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="sl-card-progress">куплено {done} из {total}</span>
                      </>
                    )}
                  </span>
                  <ChevronRight size={20} className="sl-card-arrow" aria-hidden />
                </button>
                <button
                  type="button"
                  className="sl-card-menu"
                  onClick={() => setSheetList(list)}
                  aria-label={`Меню списка «${list.name}»`}
                >
                  <MoreHorizontal size={20} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Меню списка (нижний лист): переименовать / поделиться / удалить */}
      {sheetList && (
        <div className="sl-overlay" onClick={() => setSheetList(null)}>
          <div className="sl-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sl-sheet-title">{sheetList.name}</div>
            <button type="button" className="sl-sheet-btn" onClick={() => openRename(sheetList)}>
              <Pencil size={20} /> Переименовать
            </button>
            <button type="button" className="sl-sheet-btn" onClick={() => handleShare(sheetList)}>
              <Share2 size={20} /> Поделиться
            </button>
            <button type="button" className="sl-sheet-btn sl-sheet-danger" onClick={() => { setDeleteTarget(sheetList); setSheetList(null); }}>
              <Trash2 size={20} /> Удалить
            </button>
            <button type="button" className="sl-sheet-cancel" onClick={() => setSheetList(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Переименование */}
      {renameTarget && (
        <div className="sl-overlay sl-overlay-center" onClick={() => setRenameTarget(null)}>
          <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sl-modal-head">
              <h2 className="sl-modal-title">Переименовать список</h2>
              <button type="button" className="sl-modal-x" onClick={() => setRenameTarget(null)} aria-label="Закрыть">
                <X size={20} />
              </button>
            </div>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmRename(); }}
              aria-label="Название списка"
              className="sl-modal-input"
            />
            <button type="button" className="sl-modal-primary" onClick={confirmRename}>
              Сохранить
            </button>
          </div>
        </div>
      )}

      {/* Удаление */}
      {deleteTarget && (
        <div className="sl-overlay sl-overlay-center" onClick={() => setDeleteTarget(null)}>
          <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="sl-modal-title" style={{ marginBottom: "var(--space-2)" }}>Удалить список?</h2>
            <p style={{ margin: "0 0 var(--space-4) 0", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              «{deleteTarget.name}» и все его позиции будут удалены. Это действие нельзя отменить.
            </p>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button type="button" className="sl-modal-secondary" onClick={() => setDeleteTarget(null)}>
                Отмена
              </button>
              <button type="button" className="sl-modal-danger" onClick={confirmDelete}>
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Список слишком большой для ссылки → поделиться текстом */}
      {shareBig && (
        <div className="sl-overlay sl-overlay-center" onClick={() => setShareBig(null)}>
          <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="sl-modal-title" style={{ marginBottom: "var(--space-2)" }}>Список большой для ссылки</h2>
            <p style={{ margin: "0 0 var(--space-4) 0", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              В ссылку помещается до 80 позиций. Поделитесь списком текстом — скопируйте и отправьте в любой мессенджер.
            </p>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button type="button" className="sl-modal-secondary" onClick={() => setShareBig(null)}>
                Отмена
              </button>
              <button type="button" className="sl-modal-primary" style={{ flex: 1 }} onClick={copyBigAsText}>
                Скопировать
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
