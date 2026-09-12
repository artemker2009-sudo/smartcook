"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, X } from "lucide-react";

import { reachGoal } from "@/lib/metrika";
import { copyText } from "@/lib/clipboard";
import { itemsToText, type ShoppingItem, type SortCache } from "@/lib/shoppingList";
import {
  deleteList,
  listDisplayName,
  loadLists,
  renameList,
  setListItems,
  setListSort,
  type ShoppingListRecord,
} from "@/lib/shoppingLists";
import {
  clearOpenedFromHub,
  loadGroupedMode,
  openedFromHub,
  saveGroupedMode,
} from "@/lib/shoppingActive";
import { buildShareUrl, canShareByLink } from "@/lib/shoppingShare";
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
import LocalList, { type MenuAction } from "@/components/shopping/LocalList";
import SharedList from "@/components/shopping/SharedList";

/**
 * Экран одного списка по адресу /shopping/<id>.
 *
 * Какой это список — решается здесь: id может принадлежать локальному списку из
 * localStorage или общему (семейному), который лежит на сервере. Проверяем
 * указатели общих списков первыми — локальный оригинал общего списка намеренно
 * спрятан (fromLocalId), и открывать надо именно общий.
 *
 * Здесь же живут все окна подтверждений: переименование, удаление, «сделать
 * общим», приглашение. Рисование самого списка — в LocalList / SharedList
 * поверх общего ListScreen.
 */
export default function ShoppingListRoute({ listId }: { listId: string }) {
  const router = useRouter();
  const [lists, setLists] = useState<ShoppingListRecord[]>([]);
  const [pointer, setPointer] = useState<SharedListPointer | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Снимок общего списка: позиции живут на сервере, из localStorage его не
  // достать.
  const [shared, setShared] = useState<{ snapshot: SharedSnapshot; memberRef: string } | null>(null);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [sharedLoading, setSharedLoading] = useState(false);

  const [grouped, setGrouped] = useState(false);
  const [menu, setMenu] = useState<MenuAction[] | null>(null);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareBig, setShareBig] = useState(false);
  const [makeSharedOpen, setMakeSharedOpen] = useState(false);
  const [makeSharedName, setMakeSharedName] = useState("");
  const [makeSharedBusy, setMakeSharedBusy] = useState(false);
  const [forgetOpen, setForgetOpen] = useState(false);
  // Окно «позовите близких» сразу после создания общего списка. Без него
  // владелец остаётся с общим списком, о котором никто не знает.
  const [inviteFor, setInviteFor] = useState<{ id: string; name: string } | null>(null);

  const openShared = useCallback(
    async (p: SharedListPointer) => {
      setSharedLoading(true);
      setSharedError(null);
      try {
        const snap = await fetchSharedList(p.id, p.memberRef);
        if (!snap.joined) {
          // Нас больше не считают участником (например, список пересоздали) —
          // отправляем на экран приглашения, там можно вступить заново.
          router.replace(`/shopping/join/${p.id}`);
          return;
        }
        setShared({ snapshot: snap, memberRef: p.memberRef });
      } catch (e) {
        setSharedError(e instanceof Error ? e.message : "Не удалось открыть список");
      } finally {
        setSharedLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    const init = () => {
      setGrouped(loadGroupedMode());
      const p = loadSharedPointers().find((x) => x.id === listId) ?? null;
      setPointer(p);
      setLists(loadLists());
      setLoaded(true);
      if (p) void openShared(p);
    };
    init();

    // Список могли поменять в другой вкладке.
    const onStorage = () => setLists(loadLists());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [listId, openShared]);

  const local = lists.find((l) => l.id === listId) ?? null;

  const changeGrouped = (next: boolean) => {
    setGrouped(next);
    saveGroupedMode(next);
  };

  // --- Локальный список -------------------------------------------------------

  const confirmRename = () => {
    if (!local) return;
    setLists(renameList(lists, local.id, renameValue));
    setRenameOpen(false);
  };

  const confirmDelete = () => {
    if (!local) return;
    setDeleteOpen(false);
    deleteList(lists, local.id);
    // Возвращаться в удалённый список нельзя — replace, а не push. Хаб сам
    // заведёт первый список, если этот был последним.
    router.replace("/shopping");
  };

  // ВАЖНО не путать с общим списком: здесь весь список укладывается в ссылку, и
  // получатель заводит СВОЮ копию — дальше два списка живут независимо, отметки
  // друг к другу не ходят. Живой сценарий — только «Позвать в общий список».
  // Тексты и иконки разведены именно поэтому.
  const handleShareCopy = async () => {
    if (!local) return;
    reachGoal("shopping_share_click");

    if (!canShareByLink(local.items.length)) {
      setShareBig(true); // слишком большой для ссылки → предложим текст
      return;
    }

    const url = buildShareUrl(
      local.name,
      local.items.map((it) => it.name),
    );

    const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }) : null;
    if (nav?.share) {
      try {
        await nav.share({ title: local.name, text: `Список покупок: ${local.name}`, url });
        return;
      } catch {
        // пользователь отменил share sheet или он недоступен — падаем в копирование
      }
    }
    const ok = await copyText(url);
    // buildShareUrl кладёт САМ СПИСОК в адрес (?shared=<base64url>), получатель
    // разворачивает его в свой локальный список. Это копия, не совместный
    // доступ — тост обязан сказать это прямо, иначе человек ждёт синхронизации,
    // которой не будет.
    toast(ok ? "Ссылка скопирована. Друг получит копию списка — изменения не синхронизируются" : "Не удалось скопировать ссылку");
  };

  const copyBigAsText = async () => {
    if (!local) return;
    const text = `${local.name}\n${itemsToText(local.items)}`;
    const ok = await copyText(text);
    toast(ok ? "Список скопирован текстом" : "Не удалось скопировать");
    setShareBig(false);
  };

  // --- Общий список -----------------------------------------------------------

  // «Сделать общим» копирует ТЕКУЩИЕ позиции на сервер как стартовый набор.
  //
  // Локальный оригинал остаётся в localStorage нетронутым, но в хабе больше НЕ
  // показывается: связь запоминается в fromLocalId. Иначе получались две строки
  // с одинаковым именем — и владелец продукта на приёмке сам открыл не ту,
  // увидел её пустой и решил, что синхронизация сломана. Уберёте общий с
  // устройства — оригинал вернётся на место.
  const confirmMakeShared = async () => {
    if (!local) return;
    const ownerName = makeSharedName.trim();
    if (!ownerName) {
      toast("Напишите, как вас зовут");
      return;
    }
    setMakeSharedBusy(true);
    try {
      const ownerRef = newMemberRef();
      const snap = await createSharedList({
        name: local.name,
        items: local.items.map((it) => it.name),
        ownerRef,
        ownerName,
      });
      saveMemberIdentity(snap.id, { memberRef: ownerRef, name: ownerName });
      rememberSharedList({
        id: snap.id,
        name: snap.name,
        memberRef: ownerRef,
        role: "owner",
        joinedAt: Date.now(),
        fromLocalId: local.id,
        counts: { total: snap.items.length, done: snap.items.filter((it) => it.checked).length },
      });
      reachGoal("shopping_shared_created");
      setMakeSharedOpen(false);
      // Общий список — это ДРУГОЙ адрес. replace, а не push: локальный
      // оригинал спрятан, и возвращаться на него кнопкой «назад» человеку
      // некуда.
      setInviteFor({ id: snap.id, name: snap.name });
      router.replace(`/shopping/${snap.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось создать общий список");
    } finally {
      setMakeSharedBusy(false);
    }
  };

  const confirmForget = () => {
    if (!pointer) return;
    forgetSharedList(pointer.id);
    setForgetOpen(false);
    toast("Список убран с этого устройства");
    router.replace("/shopping");
  };

  // Отправить ссылку-приглашение. Системное окно «Поделиться» на телефоне,
  // копирование в буфер — на десктопе и если человек его отменил.
  const shareInvite = async (id: string, listName: string) => {
    const url = `${window.location.origin}/shopping/join/${id}`;
    reachGoal("shopping_shared_invite_click");
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: listName, text: `Общий список покупок: ${listName}`, url });
        setInviteFor(null);
        return;
      } catch {
        // Отменили системное окно — падаем в копирование.
      }
    }
    const ok = await copyText(url);
    // Здесь наоборот: /shopping/join/<id> добавляет человека участником общего
    // списка (joinSharedList), отметки видят все.
    toast(ok ? "Ссылка скопирована. Список общий — галочки видны всем" : "Не удалось скопировать ссылку");
    if (ok) setInviteFor(null);
  };

  // --- Разметка ---------------------------------------------------------------

  // Ссылка настоящая (href), поэтому её можно открыть в новой вкладке и она
  // работает без JS. Но если хаб остался позади в истории — идём НАЗАД, а не
  // вперёд: иначе история растёт, и системная кнопка «назад» в TWA/Capacitor
  // возвращает в список вместо выхода из раздела.
  const back = (
    <Link
      href="/shopping"
      className="sh-back"
      onClick={(e) => {
        if (!openedFromHub()) return;
        e.preventDefault();
        clearOpenedFromHub();
        router.back();
      }}
    >
      <ArrowLeft size={20} aria-hidden /> Покупки
    </Link>
  );

  if (!loaded) {
    return <main className="container" style={{ minHeight: "60vh" }} />;
  }

  const modals = (
    <>
      {/* Меню «⋯». Пункты пришли от хозяина списка: у локального и общего они
          разные, а лист один. */}
      {menu && (
        <div className="sl-overlay" onClick={() => setMenu(null)}>
          <div className="sl-sheet" onClick={(e) => e.stopPropagation()}>
            {menu.map((action) => (
              <button
                key={action.key}
                type="button"
                className={action.danger ? "sl-sheet-btn sl-sheet-danger" : "sl-sheet-btn"}
                onClick={() => {
                  setMenu(null);
                  action.onSelect();
                }}
              >
                {action.icon} {action.label}
              </button>
            ))}
            <button type="button" className="sl-sheet-cancel" onClick={() => setMenu(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Переименование */}
      {renameOpen && local && (
        <div className="sl-overlay sl-overlay-center" onClick={() => setRenameOpen(false)}>
          <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sl-modal-head">
              <h2 className="sl-modal-title">Название списка</h2>
              <button type="button" className="sl-modal-x" onClick={() => setRenameOpen(false)} aria-label="Закрыть">
                <X size={20} />
              </button>
            </div>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmRename();
              }}
              placeholder="Например, Пятёрочка"
              aria-label="Название списка"
              className="sl-modal-input"
            />
            <button type="button" className="sl-modal-primary" onClick={confirmRename}>
              Сохранить
            </button>
          </div>
        </div>
      )}

      {/* Удаление списка */}
      {deleteOpen && local && (
        <div className="sl-overlay sl-overlay-center" onClick={() => setDeleteOpen(false)}>
          <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="sl-modal-title" style={{ marginBottom: "var(--space-2)" }}>Удалить список?</h2>
            <p style={{ margin: "0 0 var(--space-4) 0", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              «{listDisplayName(local.name)}» и все его позиции будут удалены. Это действие нельзя
              отменить.
            </p>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button type="button" className="sl-modal-secondary" onClick={() => setDeleteOpen(false)}>
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
      {shareBig && local && (
        <div className="sl-overlay sl-overlay-center" onClick={() => setShareBig(false)}>
          <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="sl-modal-title" style={{ marginBottom: "var(--space-2)" }}>Список большой для ссылки</h2>
            <p style={{ margin: "0 0 var(--space-4) 0", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              В ссылку помещается до 80 позиций. Поделитесь списком текстом — скопируйте и отправьте в любой мессенджер.
            </p>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button type="button" className="sl-modal-secondary" onClick={() => setShareBig(false)}>
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
      {makeSharedOpen && local && (
        <div className="sl-overlay sl-overlay-center" onClick={() => !makeSharedBusy && setMakeSharedOpen(false)}>
          <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sl-modal-head">
              <h2 className="sl-modal-title">Общий список с семьёй</h2>
              <button type="button" className="sl-modal-x" onClick={() => setMakeSharedOpen(false)} aria-label="Закрыть">
                <X size={20} />
              </button>
            </div>
            {/* Текст обязан совпадать с тем, что реально произойдёт. Прежняя
                формулировка обещала «этот список останется у вас и таким, как
                есть» — а локальный оригинал сразу прячется из хаба
                (convertedLocalListIds), и человек решал, что список пропал. */}
            <p style={{ margin: "0 0 var(--space-3) 0", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              «{listDisplayName(local.name)}» станет общим: вы получите ссылку, и всё, что кто-то
              отметит, сразу увидят остальные. Позиции и отметки перенесутся, а вместо двух
              одинаковых списков останется один — со значком «людей».
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

      {/* Сразу после создания общего списка */}
      {inviteFor && (
        <div className="sl-overlay sl-overlay-center" onClick={() => setInviteFor(null)}>
          <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sl-modal-head">
              <h2 className="sl-modal-title">Список стал общим</h2>
              <button type="button" className="sl-modal-x" onClick={() => setInviteFor(null)} aria-label="Закрыть">
                <X size={20} />
              </button>
            </div>
            <p style={{ margin: "0 0 var(--space-4) 0", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              Остался один шаг: отправьте ссылку близким. У них список появится
              только после того, как они её откроют.
            </p>
            <button
              type="button"
              className="sl-modal-primary"
              onClick={() => void shareInvite(inviteFor.id, inviteFor.name)}
            >
              Отправить ссылку
            </button>
            <button
              type="button"
              className="sl-modal-secondary"
              style={{ width: "100%", marginTop: "var(--space-2)" }}
              onClick={() => setInviteFor(null)}
            >
              Позже
            </button>
          </div>
        </div>
      )}

      {/* Убрать общий список с устройства. Именно «убрать у себя»: данные
          остаются, у остальных участников список продолжает жить. */}
      {forgetOpen && pointer && (
        <div className="sl-overlay sl-overlay-center" onClick={() => setForgetOpen(false)}>
          <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="sl-modal-title" style={{ marginBottom: "var(--space-2)" }}>
              Убрать список у себя?
            </h2>
            <p style={{ margin: "0 0 var(--space-4) 0", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              «{listDisplayName(pointer.name)}» исчезнет с этого устройства. У остальных участников
              он останется, и вы сможете вернуться по той же ссылке.
            </p>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button type="button" className="sl-modal-secondary" onClick={() => setForgetOpen(false)}>
                Отмена
              </button>
              <button type="button" className="sl-modal-danger" onClick={confirmForget}>
                Убрать
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // Общий список: снимок с сервера.
  if (pointer) {
    if (shared) {
      return (
        <main className="container">
          {back}
          <SharedList
            listId={shared.snapshot.id}
            memberRef={shared.memberRef}
            initial={shared.snapshot}
            grouped={grouped}
            onGroupedChange={changeGrouped}
            onOpenMenu={setMenu}
            onForget={() => setForgetOpen(true)}
          />
          {modals}
        </main>
      );
    }
    return (
      <main className="container">
        {back}
        {sharedLoading ? (
          <div className="sh-loading" role="status">
            <Loader2 size={22} className="animate-spin" /> Открываю список…
          </div>
        ) : (
          // Общий список не открылся (нет сети, список удалили, сервер ответил
          // ошибкой). Экран не должен оставаться пустым: говорим причину и
          // даём повторить.
          <div className="sh-failed" role="alert">
            <p className="sh-failed-title">Не удалось открыть «{listDisplayName(pointer.name)}»</p>
            <p className="sh-failed-text">{sharedError ?? "Список не найден"}</p>
            <button type="button" className="sl-modal-primary" onClick={() => void openShared(pointer)}>
              Повторить
            </button>
            <button type="button" className="sh-failed-link" onClick={() => setForgetOpen(true)}>
              Убрать список у себя
            </button>
          </div>
        )}
        {modals}
      </main>
    );
  }

  // Локальный список.
  if (local) {
    return (
      <main className="container">
        {back}
        <LocalList
          list={local}
          grouped={grouped}
          onGroupedChange={changeGrouped}
          onItemsChange={(items: ShoppingItem[]) => setLists(setListItems(lists, local.id, items))}
          onSortChange={(sort: SortCache | null) => setLists(setListSort(lists, local.id, sort))}
          onOpenMenu={setMenu}
          onRename={() => {
            setRenameValue(local.name);
            setRenameOpen(true);
          }}
          onDelete={() => setDeleteOpen(true)}
          onShareCopy={() => void handleShareCopy()}
          onMakeShared={() => {
            setMakeSharedName(lastKnownMemberName());
            setMakeSharedOpen(true);
          }}
        />
        {modals}
      </main>
    );
  }

  // Ни локального, ни общего: адрес из старой закладки, список удалили на этом
  // устройстве или ссылку прислали с чужого телефона.
  return (
    <main className="container">
      {back}
      <div className="sh-failed" role="alert">
        <p className="sh-failed-title">Список не найден</p>
        <p className="sh-failed-text">
          Возможно, он удалён на этом устройстве. Списки покупок хранятся на телефоне, а не в
          аккаунте, — по ссылке с другого устройства они не открываются.
        </p>
        <Link href="/shopping" className="sl-modal-primary" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
          К моим спискам
        </Link>
      </div>
    </main>
  );
}
