"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, LogOut, Pencil, Pin, PinOff, Plus, Send, ShoppingCart, Trash2, Users } from "lucide-react";

import { reachGoal } from "@/lib/metrika";
import { addNames } from "@/lib/shoppingList";
import {
  createList,
  deleteList,
  formatUpdatedAt,
  getImportedShareListId,
  listDisplayName,
  listProgress,
  listUpdatedAt,
  loadLists,
  recordImportedShare,
  renameList,
  setListItems,
  type ShoppingListRecord,
} from "@/lib/shoppingLists";
import { decodeSharedList, SHARE_PARAM } from "@/lib/shoppingShare";
import {
  convertedLocalListIds,
  fetchSharedList,
  forgetSharedList,
  loadSharedPointers,
  renameSharedList,
  updatePointerName,
  type SharedListPointer,
  type SharedSnapshot,
} from "@/lib/sharedShoppingList";
import HubRow, { type HubEntry } from "@/components/shopping/HubRow";
import {
  DeleteListModal,
  InviteModal,
  MakeSharedModal,
  MembersModal,
  RenameListModal,
  ShareTooBigModal,
} from "@/components/shopping/ListModals";
import MenuSheet from "@/components/shopping/MenuSheet";
import { copyItemsAsText, shareInviteLink, shareListCopy } from "@/components/shopping/shareActions";
import type { MenuAction } from "@/components/shopping/types";
import { loadPinned, togglePinned, unpin } from "@/lib/shoppingPinned";

/** Список, над которым открыто окно: локальный или общий. */
type Target = { kind: "local"; list: ShoppingListRecord } | { kind: "shared"; pointer: SharedListPointer };

/**
 * Хаб раздела «Покупки»: заголовок, «+ Новый список» и сами списки строками.
 *
 * Структура «хаб → список» вернулась после ленты чипов: чипы экономили переход,
 * но при четырёх списках имя в чипе обрезалось, а счётчик и дата правки в него
 * не влезали вовсе — понять, где что, было нельзя. Здесь у каждого списка своя
 * строка, и открывается он по АДРЕСУ /shopping/<id>: «назад» в браузере, в PWA
 * и в нативной оболочке работает сам, без нашего участия.
 *
 * Локальные и общие списки — одним рядом, без секций «Мои / Общие», по свежести
 * правок. Раньше секции стояли отдельно, и общий список на телефоне оказывался
 * за краем экрана.
 *
 * Меню «⋯» — на каждой карточке: закрепить, переименовать, поделиться, удалить.
 * Раньше «⋯» в хабе только удалял, а закрепление жило внутри списка — то есть
 * порядок в хабе приходилось менять, уйдя из хаба.
 */
export default function ShoppingApp() {
  const router = useRouter();
  const [lists, setLists] = useState<ShoppingListRecord[]>([]);
  const [pointers, setPointers] = useState<SharedListPointer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  const [menu, setMenu] = useState<MenuAction[] | null>(null);
  // Что удаляем: локальный список удаляется насовсем, общий — только с этого
  // устройства. Разные последствия — разные тексты подтверждения.
  const [deleteTarget, setDeleteTarget] = useState<Target | null>(null);
  const [renameTarget, setRenameTarget] = useState<Target | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [makeSharedFor, setMakeSharedFor] = useState<ShoppingListRecord | null>(null);
  const [inviteFor, setInviteFor] = useState<{ id: string; name: string } | null>(null);
  const [shareBigFor, setShareBigFor] = useState<ShoppingListRecord | null>(null);
  const [membersFor, setMembersFor] = useState<{ pointer: SharedListPointer; snapshot: SharedSnapshot } | null>(null);
  // Снимки общих списков, подгруженные при открытии меню карточки. Позиции
  // общего списка лежат на сервере, а «Скопировать текстом» обязан уложиться в
  // жест тапа: после сетевого ожидания iOS буфер обмена уже не даёт.
  const [snapshots, setSnapshots] = useState<Record<string, SharedSnapshot>>({});

  useEffect(() => {
    // Инициализация вынесена в функцию: localStorage/URL читаются только на
    // клиенте, а setState не вызывается синхронно прямо в теле эффекта.
    const init = () => {
      // Разбираем ?shared= (данные из URL — decodeSharedList жёстко санитизирует
      // и возвращает null на мусор, страница не ломается). Экрана-подтверждения
      // «Сохранить себе?» нет: переход по ссылке сразу сохраняет список и
      // открывает его — getImportedShareListId бережёт от дублей при повторном
      // переходе по той же ссылке (обновление страницы, повторный клик в чате).
      let enc: string | null = null;
      try {
        enc = new URLSearchParams(window.location.search).get(SHARE_PARAM);
      } catch {
        enc = null;
      }
      const sharedPayload = enc ? decodeSharedList(enc) : null;
      const initialLists = loadLists();
      const initialPointers = loadSharedPointers();

      if (sharedPayload && enc) {
        const existingId = getImportedShareListId(enc);
        const existing = existingId ? initialLists.find((l) => l.id === existingId) : undefined;

        if (existing) {
          toast(`Список «${listDisplayName(existing.name)}» сохранён`);
          // replace, а не push: ?shared= отработал, и возвращаться на него
          // кнопкой «назад» человеку незачем.
          router.replace(`/shopping/${existing.id}`);
          return;
        }
        const { lists: afterCreate, list } = createList(initialLists, sharedPayload.name);
        const withItems = addNames([], sharedPayload.items);
        setListItems(afterCreate, list.id, withItems.items, null);
        recordImportedShare(enc, list.id);
        reachGoal("shopping_share_import");
        toast(`Список «${listDisplayName(list.name)}» сохранён`);
        router.replace(`/shopping/${list.id}`);
        return;
      }

      // Списков нет — ничего не создаём: хаб покажет пустой экран с призывом.
      // Раньше «Список 1» заводился сам и лежал у каждого, кто просто заглянул.
      setLists(initialLists);
      setPointers(initialPointers);
      setPinnedIds(loadPinned());
      setLoaded(true);
      reachGoal("shopping_list_open");
    };
    init();

    // Списки могли поменять в другой вкладке.
    const onStorage = () => {
      setLists(loadLists());
      setPointers(loadSharedPointers());
      setPinnedIds(loadPinned());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router (App Router) стабилен между рендерами, эффект должен выполниться только один раз при монтировании.
  }, []);

  // Локальные списки, которые уже стали общими, не показываем: иначе рядом
  // стоят две строки с одним именем, и не угадать, какая «настоящая». Данные в
  // localStorage целы — убрав общий с устройства, оригинал получите обратно.
  const hidden = useMemo(() => convertedLocalListIds(pointers), [pointers]);

  const entries = useMemo<HubEntry[]>(() => {
    const local = lists
      .filter((l) => !hidden.has(l.id))
      .map((l) => {
        const { total, done } = listProgress(l);
        const at = listUpdatedAt(l);
        return {
          id: l.id,
          kind: "local" as const,
          label: listDisplayName(l.name),
          updatedLabel: formatUpdatedAt(at),
          counts: { total, done },
          pinned: pinnedIds.has(l.id),
          at,
        };
      });
    const shared = pointers.map((p) => {
      const at = p.updatedAt ?? p.joinedAt;
      return {
        id: p.id,
        kind: "shared" as const,
        label: listDisplayName(p.name),
        updatedLabel: formatUpdatedAt(at),
        // Счётчик может быть неизвестен: позиции на сервере, и до первого
        // открытия списка их количество мы не знаем.
        counts: p.counts ?? null,
        pinned: pinnedIds.has(p.id),
        at,
      };
    });
    // Сначала закреплённые, внутри каждой группы — по свежести правок.
    // Закрепление локальное (lib/shoppingPinned), в том числе у общего списка:
    // это порядок на ЭТОМ телефоне, а не свойство списка для всех участников.
    return [...local, ...shared]
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at - a.at)
      .map(({ id, kind, label, updatedLabel, counts, pinned }) => ({
        id,
        kind,
        label,
        updatedLabel,
        counts,
        pinned,
      }));
  }, [lists, pointers, hidden, pinnedIds]);

  const targetOf = (entry: HubEntry): Target | null => {
    if (entry.kind === "local") {
      const list = lists.find((l) => l.id === entry.id);
      return list ? { kind: "local", list } : null;
    }
    const pointer = pointers.find((p) => p.id === entry.id);
    return pointer ? { kind: "shared", pointer } : null;
  };

  const handleCreate = (fromEmpty = false) => {
    if (fromEmpty) reachGoal("shopping_empty_cta");
    const { lists: next, list } = createList(lists);
    setLists(next);
    reachGoal("shopping_list_created");
    // Сразу в список: «+» нажимают, чтобы писать продукты, а не чтобы
    // полюбоваться новой строкой в хабе. Переименовать можно тапом по названию.
    router.push(`/shopping/${list.id}`);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "local") {
      const next = deleteList(lists, deleteTarget.list.id);
      unpin(deleteTarget.list.id);
      setPinnedIds(loadPinned());
      // Удалили последний — новый не заводим, хаб покажет пустой экран.
      setLists(next);
    } else {
      setPointers(forgetSharedList(deleteTarget.pointer.id));
      unpin(deleteTarget.pointer.id);
      setPinnedIds(loadPinned());
      toast("Список убран с этого устройства");
    }
    setDeleteTarget(null);
  };

  const confirmRename = async (name: string) => {
    if (!renameTarget) return;
    if (renameTarget.kind === "local") {
      setLists(renameList(lists, renameTarget.list.id, name));
      setRenameTarget(null);
      return;
    }
    // Имя общего списка лежит в БД и видно всем участникам — запрос на сервер.
    const { pointer } = renameTarget;
    setRenameBusy(true);
    try {
      const result = await renameSharedList(pointer.id, pointer.memberRef, name);
      updatePointerName(pointer.id, result.name);
      setPointers(loadSharedPointers());
      setRenameTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось переименовать список");
    } finally {
      setRenameBusy(false);
    }
  };

  /** Снимок общего списка: из подгруженного или с сервера. */
  const loadSnapshot = async (pointer: SharedListPointer): Promise<SharedSnapshot | null> => {
    const cached = snapshots[pointer.id];
    if (cached) return cached;
    try {
      const snap = await fetchSharedList(pointer.id, pointer.memberRef);
      if (!snap.joined) return null;
      setSnapshots((prev) => ({ ...prev, [pointer.id]: snap }));
      return snap;
    } catch {
      return null;
    }
  };

  // Порядок: частое и безопасное сверху, под большим пальцем; удаление —
  // последним и отделено чертой (её рисует MenuSheet перед опасным пунктом).
  const openMenu = (entry: HubEntry) => {
    const target = targetOf(entry);
    if (!target) return;
    if (target.kind === "shared") void loadSnapshot(target.pointer);

    const shareActions: MenuAction[] =
      target.kind === "local"
        ? [
            {
              key: "shared",
              label: "Позвать в общий список",
              icon: <Users size={20} />,
              onSelect: () => setMakeSharedFor(target.list),
            },
            {
              key: "copy-link",
              label: "Отправить копию",
              icon: <Send size={20} />,
              onSelect: async () => {
                const names = target.list.items.map((it) => it.name);
                if ((await shareListCopy(target.list.name, names)) === "too-big") setShareBigFor(target.list);
              },
            },
            {
              key: "copy-text",
              label: "Скопировать текстом",
              icon: <Copy size={20} />,
              onSelect: () => void copyItemsAsText(target.list.items),
            },
          ]
        : [
            {
              key: "invite",
              label: "Позвать в список",
              icon: <Users size={20} />,
              onSelect: () => void shareInviteLink(target.pointer.id, target.pointer.name),
            },
            {
              key: "members",
              label: "Кто в списке",
              icon: <Users size={20} />,
              onSelect: async () => {
                const snapshot = await loadSnapshot(target.pointer);
                if (snapshot) setMembersFor({ pointer: target.pointer, snapshot });
                else toast.error("Не удалось загрузить список");
              },
            },
            {
              key: "copy-text",
              label: "Скопировать текстом",
              icon: <Copy size={20} />,
              onSelect: async () => {
                const snapshot = await loadSnapshot(target.pointer);
                if (snapshot) void copyItemsAsText(snapshot.items);
                else toast.error("Не удалось загрузить список");
              },
            },
          ];

    setMenu([
      {
        key: "pin",
        label: entry.pinned ? "Открепить" : "Закрепить",
        icon: entry.pinned ? <PinOff size={20} /> : <Pin size={20} />,
        onSelect: () => {
          togglePinned(entry.id);
          setPinnedIds(loadPinned());
        },
      },
      { key: "rename", label: "Переименовать", icon: <Pencil size={20} />, onSelect: () => setRenameTarget(target) },
      {
        key: "share",
        label: "Поделиться",
        icon: <Users size={20} />,
        next: { title: `Поделиться: ${entry.label}`, actions: shareActions },
      },
      target.kind === "local"
        ? {
            key: "delete",
            label: "Удалить список",
            icon: <Trash2 size={20} />,
            danger: true,
            onSelect: () => setDeleteTarget(target),
          }
        : {
            // Общий список нельзя удалить у всех — только убрать у себя, и
            // называться пункт обязан так, как работает.
            key: "forget",
            label: "Убрать у себя",
            icon: <LogOut size={20} />,
            danger: true,
            onSelect: () => setDeleteTarget(target),
          },
    ]);
  };

  if (!loaded) {
    return <main className="container" style={{ minHeight: "60vh" }} />;
  }

  return (
    <main className="container">
      <h1 className="sh-hub-head">
        <ShoppingCart size={26} color="var(--color-accent)" aria-hidden /> Покупки
      </h1>

      {entries.length === 0 ? (
        <section className="sh-hub-empty">
          <h2 className="sh-hub-empty-title">Списков пока нет</h2>
          <p className="sh-hub-empty-lead">Создайте первый список — и забудьте бумажки.</p>
          <p className="sh-hub-empty-text">
            Диктуйте голосом, сфотографируйте написанный от руки список или добавьте одной кнопкой то, чего
            не хватает для рецепта. Продукты сами разложатся по отделам магазина. Откройте список семье —
            кто что купил, видно сразу.
          </p>
          <button type="button" className="sh-hub-new sh-hub-empty-cta" onClick={() => handleCreate(true)}>
            <Plus size={22} strokeWidth={2.6} aria-hidden /> Создать первый список
          </button>
        </section>
      ) : (
        <button type="button" className="sh-hub-new" onClick={() => handleCreate()}>
          <Plus size={22} strokeWidth={2.6} aria-hidden /> Новый список
        </button>
      )}

      <div className="sh-hub-list">
        {entries.map((entry) => (
          <HubRow
            key={entry.id}
            entry={entry}
            onMenu={() => openMenu(entry)}
            onDelete={() => {
              const target = targetOf(entry);
              if (target) setDeleteTarget(target);
            }}
          />
        ))}
      </div>

      {menu && <MenuSheet actions={menu} onClose={() => setMenu(null)} />}

      {deleteTarget && (
        <DeleteListModal
          kind={deleteTarget.kind}
          name={deleteTarget.kind === "local" ? deleteTarget.list.name : deleteTarget.pointer.name}
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {renameTarget && (
        <RenameListModal
          initialName={renameTarget.kind === "local" ? renameTarget.list.name : renameTarget.pointer.name}
          busy={renameBusy}
          onSave={(name) => void confirmRename(name)}
          onClose={() => setRenameTarget(null)}
        />
      )}

      {makeSharedFor && (
        <MakeSharedModal
          list={makeSharedFor}
          onClose={() => setMakeSharedFor(null)}
          onCreated={(created) => {
            setMakeSharedFor(null);
            // Локальный оригинал спрячется сам (convertedLocalListIds), на его
            // месте встанет общий — со значком «людей».
            setPointers(loadSharedPointers());
            setInviteFor(created);
          }}
        />
      )}

      {inviteFor && <InviteModal id={inviteFor.id} name={inviteFor.name} onClose={() => setInviteFor(null)} />}

      {shareBigFor && (
        <ShareTooBigModal name={shareBigFor.name} items={shareBigFor.items} onClose={() => setShareBigFor(null)} />
      )}

      {membersFor && (
        <MembersModal
          members={membersFor.snapshot.members}
          ownerRef={membersFor.snapshot.ownerRef}
          memberRef={membersFor.pointer.memberRef}
          onInvite={() => void shareInviteLink(membersFor.pointer.id, membersFor.pointer.name)}
          onClose={() => setMembersFor(null)}
        />
      )}
    </main>
  );
}
