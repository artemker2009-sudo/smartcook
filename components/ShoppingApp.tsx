"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, ShoppingCart } from "lucide-react";

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
  setListItems,
  type ShoppingListRecord,
} from "@/lib/shoppingLists";
import { decodeSharedList, SHARE_PARAM } from "@/lib/shoppingShare";
import {
  convertedLocalListIds,
  forgetSharedList,
  loadSharedPointers,
  type SharedListPointer,
} from "@/lib/sharedShoppingList";
import HubRow, { type HubEntry } from "@/components/shopping/HubRow";
import { loadPinned, unpin } from "@/lib/shoppingPinned";

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
 */
export default function ShoppingApp() {
  const router = useRouter();
  const [lists, setLists] = useState<ShoppingListRecord[]>([]);
  const [pointers, setPointers] = useState<SharedListPointer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  // Что удаляем: локальный список удаляется насовсем, общий — только с этого
  // устройства. Разные последствия — разные тексты подтверждения.
  const [deleteTarget, setDeleteTarget] = useState<
    { kind: "local"; list: ShoppingListRecord } | { kind: "shared"; pointer: SharedListPointer } | null
  >(null);

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
      let initialLists = loadLists();
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

      const hidden = convertedLocalListIds(initialPointers);
      const visible = initialLists.filter((l) => !hidden.has(l.id));

      // Пустого состояния у хаба не бывает: человек пришёл писать продукты, а
      // не заводить списки. Нет ни одного — первый создаём сами.
      if (visible.length === 0 && initialPointers.length === 0) {
        initialLists = createList(initialLists).lists;
      }

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

  const handleCreate = () => {
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
      // Не осталось ни одного списка — заводим первый заново: пустого хаба не
      // бывает.
      const empty = next.filter((l) => !hidden.has(l.id)).length === 0 && pointers.length === 0;
      setLists(empty ? createList(next).lists : next);
    } else {
      setPointers(forgetSharedList(deleteTarget.pointer.id));
      unpin(deleteTarget.pointer.id);
      setPinnedIds(loadPinned());
      toast("Список убран с этого устройства");
    }
    setDeleteTarget(null);
  };

  if (!loaded) {
    return <main className="container" style={{ minHeight: "60vh" }} />;
  }

  return (
    <main className="container">
      <h1 className="sh-hub-head">
        <ShoppingCart size={26} color="var(--color-accent)" aria-hidden /> Покупки
      </h1>

      <button type="button" className="sh-hub-new" onClick={handleCreate}>
        <Plus size={22} strokeWidth={2.6} aria-hidden /> Новый список
      </button>

      <div className="sh-hub-list">
        {entries.map((entry) => (
          <HubRow
            key={entry.id}
            entry={entry}
            onDelete={() => {
              if (entry.kind === "local") {
                const list = lists.find((l) => l.id === entry.id);
                if (list) setDeleteTarget({ kind: "local", list });
                return;
              }
              const pointer = pointers.find((p) => p.id === entry.id);
              if (pointer) setDeleteTarget({ kind: "shared", pointer });
            }}
          />
        ))}
      </div>

      {/* Удаление. У локального списка и у общего последствия РАЗНЫЕ, и текст
          обязан это говорить: свой список исчезает насовсем, общий остаётся у
          остальных участников и возвращается по той же ссылке. */}
      {deleteTarget && (
        <div className="sl-overlay sl-overlay-center" onClick={() => setDeleteTarget(null)}>
          <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
            {deleteTarget.kind === "local" ? (
              <>
                <h2 className="sl-modal-title" style={{ marginBottom: "var(--space-2)" }}>Удалить список?</h2>
                <p style={{ margin: "0 0 var(--space-4) 0", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                  «{listDisplayName(deleteTarget.list.name)}» и все его позиции будут удалены. Это
                  действие нельзя отменить.
                </p>
              </>
            ) : (
              <>
                <h2 className="sl-modal-title" style={{ marginBottom: "var(--space-2)" }}>Убрать список у себя?</h2>
                <p style={{ margin: "0 0 var(--space-4) 0", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                  «{listDisplayName(deleteTarget.pointer.name)}» исчезнет с этого устройства. У
                  остальных участников он останется, и вы сможете вернуться по той же ссылке.
                </p>
              </>
            )}
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button type="button" className="sl-modal-secondary" onClick={() => setDeleteTarget(null)}>
                Отмена
              </button>
              <button type="button" className="sl-modal-danger" onClick={confirmDelete}>
                {deleteTarget.kind === "local" ? "Удалить" : "Убрать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
