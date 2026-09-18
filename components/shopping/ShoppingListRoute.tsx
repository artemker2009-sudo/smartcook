"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

import { SHOPPING_CHANGED_EVENT, type ShoppingItem, type SortCache } from "@/lib/shoppingList";
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
import { unpin } from "@/lib/shoppingPinned";
import { FEATURE_SHOPPING_SYNC } from "@/lib/features";
import { startShoppingSync, syncShoppingLists } from "@/lib/shoppingSync";
import {
  fetchSharedList,
  forgetSharedList,
  loadSharedPointers,
  renameSharedList,
  updatePointerName,
  type SharedListPointer,
  type SharedSnapshot,
} from "@/lib/sharedShoppingList";
import LocalList from "@/components/shopping/LocalList";
import {
  DeleteListModal,
  InviteModal,
  MakeSharedModal,
  RenameListModal,
  ShareTooBigModal,
} from "@/components/shopping/ListModals";
import MenuSheet from "@/components/shopping/MenuSheet";
import SharedList from "@/components/shopping/SharedList";
import { shareListCopy } from "@/components/shopping/shareActions";
import type { MenuAction } from "@/components/shopping/types";

/**
 * Экран одного списка по адресу /shopping/<id>.
 *
 * Какой это список — решается здесь: id может принадлежать локальному списку из
 * localStorage или общему (семейному), который лежит на сервере. Проверяем
 * указатели общих списков первыми — локальный оригинал общего списка намеренно
 * спрятан (fromLocalId), и открывать надо именно общий.
 *
 * Здесь же живут окна подтверждений (сами окна — в ListModals, они общие с
 * хабом). Рисование самого списка — в LocalList / SharedList поверх общего
 * ListScreen.
 */
export default function ShoppingListRoute({ listId }: { listId: string }) {
  const router = useRouter();
  const [lists, setLists] = useState<ShoppingListRecord[]>([]);
  // Самые свежие списки для записи. Раскладка дописывается ПОСЛЕ сетевого
  // запроса, и между двумя записями (позиции, затем раскладка) state ещё не
  // успевает обновиться: запись поверх старого массива стёрла бы только что
  // добавленный продукт.
  const listsRef = useRef<ShoppingListRecord[]>([]);
  const [pointer, setPointer] = useState<SharedListPointer | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Снимок общего списка: позиции живут на сервере, из localStorage его не
  // достать.
  const [shared, setShared] = useState<{ snapshot: SharedSnapshot; memberRef: string } | null>(null);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [sharedLoading, setSharedLoading] = useState(false);

  const [grouped, setGrouped] = useState(false);
  const [menu, setMenu] = useState<MenuAction[] | null>(null);
  // Переименование общего списка идёт на сервер и может не долететь.
  const [renameBusy, setRenameBusy] = useState(false);
  // Имя, с которым открыто окно переименования. null — окно закрыто.
  const [renameFrom, setRenameFrom] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareBig, setShareBig] = useState(false);
  const [makeSharedOpen, setMakeSharedOpen] = useState(false);
  const [forgetOpen, setForgetOpen] = useState(false);
  // Окно «позовите близких» сразу после создания общего списка. Без него
  // владелец остаётся с общим списком, о котором никто не знает.
  const [inviteFor, setInviteFor] = useState<{ id: string; name: string } | null>(null);

  const updateLists = (change: (prev: ShoppingListRecord[]) => ShoppingListRecord[]) => {
    const next = change(listsRef.current);
    listsRef.current = next;
    setLists(next);
  };

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
      listsRef.current = loadLists();
      setLists(listsRef.current);
      setLoaded(true);
      if (p) void openShared(p);
    };
    init();

    // Список могли поменять в другой вкладке — или его могла обновить
    // синхронизация, забрав версию с другого устройства: она пишет через
    // saveLists, а тот шлёт SHOPPING_CHANGED_EVENT.
    const onStorage = () => {
      listsRef.current = loadLists();
      setLists(listsRef.current);
    };
    window.addEventListener("storage", onStorage);
    // Под флагом: выключенная синхронизация = сегодняшнее поведение один в один.
    if (FEATURE_SHOPPING_SYNC) window.addEventListener(SHOPPING_CHANGED_EVENT, onStorage);

    // При выключенном флаге и у гостей — пустышки.
    const stopSync = startShoppingSync();
    void syncShoppingLists("list");

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SHOPPING_CHANGED_EVENT, onStorage);
      stopSync();
    };
  }, [listId, openShared]);

  const local = lists.find((l) => l.id === listId) ?? null;

  const changeGrouped = (next: boolean) => {
    setGrouped(next);
    saveGroupedMode(next);
  };

  const confirmRename = async (name: string) => {
    if (local) {
      updateLists((prev) => renameList(prev, local.id, name));
      setRenameFrom(null);
      return;
    }
    // Общий список: имя лежит в БД, значит это запрос на сервер. Локально
    // ничего не меняем до ответа — иначе при неудаче на экране осталось бы
    // имя, которого нет ни у кого из участников.
    if (!pointer || !shared) return;
    setRenameBusy(true);
    try {
      const result = await renameSharedList(pointer.id, shared.memberRef, name);
      updatePointerName(pointer.id, result.name);
      setPointer({ ...pointer, name: result.name });
      setShared({ ...shared, snapshot: { ...shared.snapshot, name: result.name } });
      setRenameFrom(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось переименовать список");
    } finally {
      setRenameBusy(false);
    }
  };

  const confirmDelete = () => {
    if (!local) return;
    setDeleteOpen(false);
    updateLists((prev) => deleteList(prev, local.id));
    unpin(local.id);
    // Возвращаться в удалённый список нельзя — replace, а не push. Если этот
    // был последним, хаб покажет пустой экран «Списков пока нет».
    router.replace("/shopping");
  };

  const handleShareCopy = async () => {
    if (!local) return;
    const result = await shareListCopy(
      local.name,
      local.items.map((it) => it.name),
    );
    if (result === "too-big") setShareBig(true);
  };

  const confirmForget = () => {
    if (!pointer) return;
    forgetSharedList(pointer.id);
    unpin(pointer.id);
    setForgetOpen(false);
    toast("Список убран с этого устройства");
    router.replace("/shopping");
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
      {menu && <MenuSheet actions={menu} onClose={() => setMenu(null)} />}

      {/* Переименование. Локальное имя правится в localStorage, имя общего
          списка уходит на сервер и возвращается всем участникам. */}
      {renameFrom !== null && (local || pointer) && (
        <RenameListModal
          initialName={renameFrom}
          busy={renameBusy}
          onSave={(name) => void confirmRename(name)}
          onClose={() => setRenameFrom(null)}
        />
      )}

      {deleteOpen && local && (
        <DeleteListModal kind="local" name={local.name} onConfirm={confirmDelete} onClose={() => setDeleteOpen(false)} />
      )}

      {shareBig && local && <ShareTooBigModal name={local.name} items={local.items} onClose={() => setShareBig(false)} />}

      {makeSharedOpen && local && (
        <MakeSharedModal
          list={local}
          onClose={() => setMakeSharedOpen(false)}
          onCreated={(created) => {
            setMakeSharedOpen(false);
            // Общий список — это ДРУГОЙ адрес. replace, а не push: локальный
            // оригинал спрятан, и возвращаться на него кнопкой «назад» человеку
            // некуда.
            setInviteFor(created);
            router.replace(`/shopping/${created.id}`);
          }}
        />
      )}

      {inviteFor && <InviteModal id={inviteFor.id} name={inviteFor.name} onClose={() => setInviteFor(null)} />}

      {/* Убрать общий список с устройства. Именно «убрать у себя»: данные
          остаются, у остальных участников список продолжает жить. */}
      {forgetOpen && pointer && (
        <DeleteListModal kind="shared" name={pointer.name} onConfirm={confirmForget} onClose={() => setForgetOpen(false)} />
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
            onRename={() => setRenameFrom(shared.snapshot.name)}
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
          onItemsChange={(items: ShoppingItem[]) => updateLists((prev) => setListItems(prev, local.id, items))}
          onSortChange={(sort: SortCache | null) => updateLists((prev) => setListSort(prev, local.id, sort))}
          onOpenMenu={setMenu}
          onRename={() => setRenameFrom(local.name)}
          onDelete={() => setDeleteOpen(true)}
          onShareCopy={() => void handleShareCopy()}
          onMakeShared={() => setMakeSharedOpen(true)}
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
