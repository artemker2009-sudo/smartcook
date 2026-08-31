"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, Loader2, MoreHorizontal, Pencil, Plus, Share2, ShoppingCart, Trash2, Users, X } from "lucide-react";

import { reachGoal } from "@/lib/metrika";
import { copyText } from "@/lib/clipboard";
import { addNames, itemsToText, type ShoppingItem, type SortCache } from "@/lib/shoppingList";
import {
  createList,
  deleteList,
  formatListDate,
  getImportedShareListId,
  listProgress,
  loadLists,
  recordImportedShare,
  renameList,
  setListItems,
  setListSort,
  splitListTitle,
  type ShoppingListRecord,
} from "@/lib/shoppingLists";
import { buildShareUrl, canShareByLink, decodeSharedList, SHARE_PARAM } from "@/lib/shoppingShare";
import {
  createSharedList,
  fetchSharedList,
  forgetSharedList,
  lastKnownMemberName,
  loadSharedPointers,
  newMemberRef,
  rememberSharedList,
  saveMemberIdentity,
  type SharedListPointer,
  type SharedSnapshot,
} from "@/lib/sharedShoppingList";
import ShoppingListView from "@/components/ShoppingListView";
import SharedShoppingListView from "@/components/SharedShoppingListView";

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

  // Модалки
  const [sheetList, setSheetList] = useState<ShoppingListRecord | null>(null); // меню списка
  const [renameTarget, setRenameTarget] = useState<ShoppingListRecord | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ShoppingListRecord | null>(null);
  const [shareBig, setShareBig] = useState<ShoppingListRecord | null>(null); // список слишком большой для ссылки

  // --- Семейные (общие) списки ------------------------------------------------
  // Указатели «я состою в таком-то списке» лежат в localStorage, сами позиции —
  // на сервере. Локальные списки этим не затрагиваются вообще.
  const [sharedPointers, setSharedPointers] = useState<SharedListPointer[]>([]);
  const [openShared, setOpenShared] = useState<{ snapshot: SharedSnapshot; memberRef: string } | null>(null);
  const [sharedLoading, setSharedLoading] = useState<string | null>(null); // id открываемого списка
  const [makeSharedTarget, setMakeSharedTarget] = useState<ShoppingListRecord | null>(null);
  const [makeSharedName, setMakeSharedName] = useState("");
  const [makeSharedBusy, setMakeSharedBusy] = useState(false);
  const [forgetShared, setForgetShared] = useState<SharedListPointer | null>(null);

  useEffect(() => {
    // Инициализация вынесена в функцию: localStorage/URL читаются только на
    // клиенте, а setState не вызывается синхронно прямо в теле эффекта.
    const init = () => {
      // Разбираем ?shared= (данные из URL — decodeSharedList жёстко санитизирует
      // и возвращает null на мусор, страница не ломается). Экрана-подтверждения
      // «Сохранить себе?» больше нет: переход по ссылке сразу сохраняет список
      // и открывает его — getImportedShareListId бережёт от дублей при повторном
      // переходе по той же ссылке (обновление страницы, повторный клик в чате).
      let enc: string | null = null;
      try {
        const params = new URLSearchParams(window.location.search);
        enc = params.get(SHARE_PARAM);
      } catch {
        enc = null;
      }
      const sharedPayload = enc ? decodeSharedList(enc) : null;
      const initialLists = loadLists();

      if (sharedPayload && enc) {
        const existingId = getImportedShareListId(enc);
        const existingList = existingId ? initialLists.find((l) => l.id === existingId) : undefined;

        if (existingList) {
          setLists(initialLists);
          setOpenId(existingList.id);
          toast(`Список «${existingList.name}» сохранён`);
        } else {
          const { lists: afterCreate, list } = createList(initialLists, sharedPayload.name);
          const withItems = addNames([], sharedPayload.items);
          const next = setListItems(afterCreate, list.id, withItems.items, null);
          recordImportedShare(enc, list.id);
          setLists(next);
          setOpenId(list.id);
          reachGoal("shopping_share_import");
          toast(`Список «${list.name}» сохранён`);
        }
        // Убираем ?shared= из адреса, чтобы обновление страницы не переимпортировало.
        router.replace("/shopping");
      } else {
        setLists(initialLists);
      }

      setSharedPointers(loadSharedPointers());
      setLoaded(true);
      reachGoal("shopping_list_open");
    };
    init();

    // Синхронизация между вкладками.
    const onStorage = () => setLists(loadLists());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router (App Router) стабилен между рендерами, эффект должен выполниться только один раз при монтировании.
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

  // --- Семейные списки --------------------------------------------------------

  const openSharedList = async (pointer: SharedListPointer) => {
    setSharedLoading(pointer.id);
    try {
      const snap = await fetchSharedList(pointer.id, pointer.memberRef);
      if (!snap.joined) {
        // Нас больше не считают участником (например, список пересоздали) —
        // отправляем на экран приглашения, там можно вступить заново.
        router.push(`/shopping/join/${pointer.id}`);
        return;
      }
      setOpenShared({ snapshot: snap, memberRef: pointer.memberRef });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось открыть список");
    } finally {
      setSharedLoading(null);
    }
  };

  const openMakeShared = (list: ShoppingListRecord) => {
    setSheetList(null);
    setMakeSharedName(lastKnownMemberName());
    setMakeSharedTarget(list);
  };

  // «Сделать общим» копирует ТЕКУЩИЕ позиции на сервер как стартовый набор.
  // Локальный список при этом остаётся у человека нетронутым — дальше это две
  // независимые сущности.
  const confirmMakeShared = async () => {
    if (!makeSharedTarget) return;
    const ownerName = makeSharedName.trim();
    if (!ownerName) {
      toast("Напишите, как вас зовут");
      return;
    }
    setMakeSharedBusy(true);
    try {
      const ownerRef = newMemberRef();
      const snap = await createSharedList({
        name: makeSharedTarget.name,
        items: makeSharedTarget.items.map((it) => it.name),
        ownerRef,
        ownerName,
      });
      saveMemberIdentity(snap.id, { memberRef: ownerRef, name: ownerName });
      setSharedPointers(
        rememberSharedList({
          id: snap.id,
          name: snap.name,
          memberRef: ownerRef,
          role: "owner",
          joinedAt: Date.now(),
        }),
      );
      reachGoal("shopping_shared_created");
      setMakeSharedTarget(null);
      setOpenShared({ snapshot: snap, memberRef: ownerRef });
      toast.success("Список стал общим — позовите близких по ссылке");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось создать общий список");
    } finally {
      setMakeSharedBusy(false);
    }
  };

  const confirmForgetShared = () => {
    if (!forgetShared) return;
    setSharedPointers(forgetSharedList(forgetShared.id));
    setForgetShared(null);
    toast("Список убран с этого устройства");
  };

  if (!loaded) {
    return <main className="container" style={{ minHeight: "60vh" }} />;
  }

  // Открыт общий список — тот же экран, что и по ссылке-приглашению.
  if (openShared) {
    return (
      <main className="container">
        <SharedShoppingListView
          listId={openShared.snapshot.id}
          memberRef={openShared.memberRef}
          initial={openShared.snapshot}
          onBack={() => {
            setOpenShared(null);
            setSharedPointers(loadSharedPointers());
          }}
        />
      </main>
    );
  }

  // 1) Открыт конкретный список — редактор (экран из MVP). Импорт по shared-
  // ссылке уже произошёл в init() и сразу открыл нужный список этой веткой.
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

  // 2) Хаб — все списки.
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
            const dateLabel = formatListDate(list.createdAt);
            // Имя по умолчанию — «Покупки, 31 августа», а дата и так стоит в
            // подписи под ним: на карточке она дублировалась и вытесняла само
            // имя в многоточие. Дату из имени убираем ТОЛЬКО когда она совпала
            // с датой создания, иначе это осмысленная часть своего названия
            // («Дача, 1 мая») — такое имя показываем целиком.
            const parts = splitListTitle(list.name);
            const cardTitle = parts.subtitle === dateLabel ? parts.title : list.name;
            return (
              <div key={list.id} className="sl-card">
                <button type="button" className="sl-card-main" onClick={() => setOpenId(list.id)}>
                  <span className="sl-card-icon" aria-hidden>
                    <ShoppingCart size={22} />
                  </span>
                  <span className="sl-card-text">
                    <span className="sl-card-title">{cardTitle}</span>
                    <span className="sl-card-meta">
                      {dateLabel} · {pluralizePositions(total)}
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

      {/* Семейные списки — отдельная секция РЯДОМ с обычными, а не вместо них.
          Здесь позиции живут на сервере и видны всем участникам сразу. */}
      {sharedPointers.length > 0 && (
        <section style={{ marginTop: "var(--space-5)" }}>
          <h2
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              margin: "0 0 var(--space-3) 0",
              fontSize: "var(--font-size-heading)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text)",
            }}
          >
            <Users size={22} color="var(--color-accent)" /> Семейные списки
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {sharedPointers.map((pointer) => (
              <div key={pointer.id} className="sl-card">
                <button
                  type="button"
                  className="sl-card-main"
                  onClick={() => void openSharedList(pointer)}
                  disabled={sharedLoading === pointer.id}
                >
                  <span className="sl-card-icon" aria-hidden>
                    {sharedLoading === pointer.id ? (
                      <Loader2 size={22} className="animate-spin" />
                    ) : (
                      <Users size={22} />
                    )}
                  </span>
                  <span className="sl-card-text">
                    <span className="sl-card-title">{pointer.name}</span>
                    <span className="sl-card-meta">
                      {pointer.role === "owner" ? "вы создали · общий" : "общий список"}
                    </span>
                  </span>
                  <ChevronRight size={20} className="sl-card-arrow" aria-hidden />
                </button>
                <button
                  type="button"
                  className="sl-card-menu"
                  onClick={() => setForgetShared(pointer)}
                  aria-label={`Убрать «${pointer.name}» с этого устройства`}
                >
                  <MoreHorizontal size={20} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Меню списка (нижний лист): переименовать / поделиться / сделать общим / удалить */}
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
            <button type="button" className="sl-sheet-btn" onClick={() => openMakeShared(sheetList)}>
              <Users size={20} /> Сделать общим
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

      {/* Сделать список общим: спрашиваем только имя — регистрации нет. */}
      {makeSharedTarget && (
        <div className="sl-overlay sl-overlay-center" onClick={() => !makeSharedBusy && setMakeSharedTarget(null)}>
          <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sl-modal-head">
              <h2 className="sl-modal-title">Сделать общим</h2>
              <button
                type="button"
                className="sl-modal-x"
                onClick={() => setMakeSharedTarget(null)}
                aria-label="Закрыть"
              >
                <X size={20} />
              </button>
            </div>
            <p style={{ margin: "0 0 var(--space-3) 0", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              «{makeSharedTarget.name}» станет общим: вы получите ссылку, и всё, что кто-то отметит,
              сразу увидят остальные. Этот список останется у вас и таким, как есть.
            </p>
            <label
              htmlFor="make-shared-name"
              style={{
                display: "block",
                marginBottom: "var(--space-2)",
                fontSize: "var(--font-size-body)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--color-text)",
              }}
            >
              Ваше имя
            </label>
            <input
              id="make-shared-name"
              autoFocus
              value={makeSharedName}
              onChange={(e) => setMakeSharedName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirmMakeShared();
              }}
              placeholder="Например, Мама"
              maxLength={50}
              className="sl-modal-input"
            />
            <button
              type="button"
              className="sl-modal-primary"
              onClick={() => void confirmMakeShared()}
              disabled={makeSharedBusy || !makeSharedName.trim()}
              style={{ opacity: makeSharedBusy || !makeSharedName.trim() ? 0.5 : 1 }}
            >
              {makeSharedBusy ? "Создаю…" : "Сделать общим"}
            </button>
          </div>
        </div>
      )}

      {/* Убрать общий список с устройства. Именно «убрать у себя»: данные
          остаются, у остальных участников список продолжает жить. */}
      {forgetShared && (
        <div className="sl-overlay sl-overlay-center" onClick={() => setForgetShared(null)}>
          <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="sl-modal-title" style={{ marginBottom: "var(--space-2)" }}>
              Убрать список у себя?
            </h2>
            <p style={{ margin: "0 0 var(--space-4) 0", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              «{forgetShared.name}» исчезнет с этого устройства. У остальных участников он останется,
              и вы сможете вернуться по той же ссылке.
            </p>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button type="button" className="sl-modal-secondary" onClick={() => setForgetShared(null)}>
                Отмена
              </button>
              <button type="button" className="sl-modal-danger" onClick={confirmForgetShared}>
                Убрать
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
