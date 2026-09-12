"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";

import { reachGoal } from "@/lib/metrika";
import { copyText } from "@/lib/clipboard";
import { addNames, itemsToText, type ShoppingItem, type SortCache } from "@/lib/shoppingList";
import {
  createList,
  deleteList,
  getImportedShareListId,
  listChipLabel,
  listProgress,
  loadLists,
  recordImportedShare,
  renameList,
  setListItems,
  setListSort,
  type ShoppingListRecord,
} from "@/lib/shoppingLists";
import { loadActiveListId, loadGroupedMode, saveActiveListId, saveGroupedMode } from "@/lib/shoppingActive";
import { buildShareUrl, canShareByLink, decodeSharedList, SHARE_PARAM } from "@/lib/shoppingShare";
import {
  convertedLocalListIds,
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
import ListChips, { type ChipEntry } from "@/components/shopping/ListChips";
import LocalList, { type MenuAction } from "@/components/shopping/LocalList";
import SharedList from "@/components/shopping/SharedList";

/**
 * Раздел «Покупки» — ОДИН экран.
 *
 * Хаба с карточками списков больше нет. Он стоил лишнего перехода до самого
 * списка, повторял слово «Покупки» пять раз на одном экране (заголовок, три
 * карточки с именем по умолчанию, таб-бар) и при четырёх списках уже не
 * влезал в 812px. Теперь всегда открыт один список во весь экран, а остальные
 * переключаются лентой чипов сверху — как в Bring!.
 *
 * Этот компонент — хозяин состояния: списки, указатели общих списков, что
 * открыто, окна подтверждений. Рисование одного списка живёт в LocalList /
 * SharedList поверх общего ListScreen.
 */
export default function ShoppingApp() {
  const router = useRouter();
  const [lists, setLists] = useState<ShoppingListRecord[]>([]);
  const [pointers, setPointers] = useState<SharedListPointer[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Что открыто. id локального или общего списка — они из разных хранилищ, но
  // оба uuid и не пересекаются.
  const [activeId, setActiveId] = useState<string | null>(null);
  // Загруженный снимок общего списка. Позиции общего списка живут на сервере,
  // поэтому его нельзя просто взять из состояния, как локальный.
  const [shared, setShared] = useState<{ snapshot: SharedSnapshot; memberRef: string } | null>(null);
  const [sharedLoading, setSharedLoading] = useState<string | null>(null);
  // Общий список не открылся (нет сети, список удалили, сервер ответил
  // ошибкой). Раньше в этом случае раздел оставался с надписью «Открываю
  // список…» навсегда: тост уезжал, а выхода с экрана не было.
  const [sharedError, setSharedError] = useState<string | null>(null);

  // Режим просмотра — один на раздел, переживает переключение списков.
  const [grouped, setGrouped] = useState(false);

  // Меню «⋯»: пункты собирает хозяин списка (они разные у локального и
  // общего), нижний лист один.
  const [menu, setMenu] = useState<MenuAction[] | null>(null);

  // Окна подтверждений
  const [renameTarget, setRenameTarget] = useState<ShoppingListRecord | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ShoppingListRecord | null>(null);
  const [shareBig, setShareBig] = useState<ShoppingListRecord | null>(null);
  const [makeSharedTarget, setMakeSharedTarget] = useState<ShoppingListRecord | null>(null);
  const [makeSharedName, setMakeSharedName] = useState("");
  const [makeSharedBusy, setMakeSharedBusy] = useState(false);
  const [forgetTarget, setForgetTarget] = useState<SharedListPointer | null>(null);
  // Окно «позовите близких» сразу после создания общего списка. Без него
  // владелец остаётся с общим списком, о котором никто не знает.
  const [inviteFor, setInviteFor] = useState<{ id: string; name: string } | null>(null);

  // Нижний отступ документа под прижатую к низу панель ввода — тем же
  // приёмом, каким таб-бар вешает has-tabbar. Без него нижняя строка футера
  // сайта уезжает под панель.
  useEffect(() => {
    document.body.classList.add("has-addbar");
    return () => document.body.classList.remove("has-addbar");
  }, []);

  // Счётчик открытого общего списка приехал со снимка — обновляем чип. Равные
  // значения пропускаем: перечитывание снимка идёт на каждое действие, и лишний
  // новый массив заставлял бы перерисовываться всю ленту.
  const handleSharedCounts = useCallback((id: string, counts: { total: number; done: number }) => {
    setPointers((prev) =>
      prev.some((p) => p.id === id && (p.counts?.total !== counts.total || p.counts?.done !== counts.done))
        ? prev.map((p) => (p.id === id ? { ...p, counts } : p))
        : prev,
    );
  }, []);

  const selectActive = useCallback((id: string | null) => {
    setActiveId(id);
    saveActiveListId(id);
  }, []);

  // Открыть общий список: тянем снимок с сервера. Пока тянется — на чипе
  // спиннер, экран продолжает показывать предыдущий список.
  const openShared = useCallback(
    async (pointer: SharedListPointer) => {
      setSharedLoading(pointer.id);
      setSharedError(null);
      try {
        const snap = await fetchSharedList(pointer.id, pointer.memberRef);
        if (!snap.joined) {
          // Нас больше не считают участником (например, список пересоздали) —
          // отправляем на экран приглашения, там можно вступить заново.
          router.push(`/shopping/join/${pointer.id}`);
          return;
        }
        setShared({ snapshot: snap, memberRef: pointer.memberRef });
        selectActive(pointer.id);
      } catch (e) {
        // Активным оставляем тот же список: человек выбрал именно его, и
        // молча подменять его другим нельзя. Вместо этого показываем, что
        // случилось, и даём повторить.
        setShared(null);
        selectActive(pointer.id);
        setSharedError(e instanceof Error ? e.message : "Не удалось открыть список");
      } finally {
        setSharedLoading(null);
      }
    },
    [router, selectActive],
  );

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
      let openId: string | null = null;

      if (sharedPayload && enc) {
        const existingId = getImportedShareListId(enc);
        const existing = existingId ? initialLists.find((l) => l.id === existingId) : undefined;

        if (existing) {
          openId = existing.id;
          toast(`Список «${existing.name}» сохранён`);
        } else {
          const { lists: afterCreate, list } = createList(initialLists, sharedPayload.name);
          const withItems = addNames([], sharedPayload.items);
          initialLists = setListItems(afterCreate, list.id, withItems.items, null);
          recordImportedShare(enc, list.id);
          openId = list.id;
          reachGoal("shopping_share_import");
          toast(`Список «${list.name}» сохранён`);
        }
        // Убираем ?shared= из адреса, чтобы обновление страницы не
        // переимпортировало.
        router.replace("/shopping");
      }

      const hidden = convertedLocalListIds(initialPointers);
      const visible = initialLists.filter((l) => !hidden.has(l.id));

      // Пустого состояния у РАЗДЕЛА не бывает: человек пришёл писать продукты,
      // а не заводить списки. Нет ни одного — первый создаём сами.
      if (visible.length === 0 && initialPointers.length === 0) {
        const created = createList(initialLists);
        initialLists = created.lists;
        openId = created.list.id;
      }

      setLists(initialLists);
      setPointers(initialPointers);
      setGrouped(loadGroupedMode());

      // Куда встать: список из ссылки → последний открытый → первый видимый.
      const restored = openId ?? loadActiveListId();
      const stillHere =
        restored &&
        (initialLists.some((l) => l.id === restored && !hidden.has(l.id)) ||
          initialPointers.some((p) => p.id === restored));
      const fallbackPointer = initialPointers[0];
      const fallbackLocal = initialLists.find((l) => !hidden.has(l.id));
      const targetId = stillHere ? restored : (fallbackLocal?.id ?? fallbackPointer?.id ?? null);

      setActiveId(targetId);
      if (openId) saveActiveListId(openId);

      const targetPointer = initialPointers.find((p) => p.id === targetId);
      if (targetPointer) void openShared(targetPointer);

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

  // Локальные списки, которые уже стали общими, не показываем: иначе рядом
  // стоят два чипа с одним именем, и не угадать, какой «настоящий». Данные в
  // localStorage целы — убрав общий с устройства, оригинал получите обратно.
  const hidden = useMemo(() => convertedLocalListIds(pointers), [pointers]);
  const visibleLists = useMemo(() => lists.filter((l) => !hidden.has(l.id)), [lists, hidden]);

  // Лента чипов: локальные и общие в одном ряду, свежие первыми. Общий список
  // здесь — такой же чип со значком «людей», а не отдельная секция с
  // заголовком и абзацем-объяснением.
  const entries = useMemo<ChipEntry[]>(() => {
    const local: Array<ChipEntry & { at: number }> = visibleLists.map((l) => {
      const { total, done } = listProgress(l);
      return {
        id: l.id,
        kind: "local",
        label: listChipLabel(l.name),
        counts: { total, done },
        at: l.createdAt,
      };
    });
    const shared: Array<ChipEntry & { at: number }> = pointers.map((p) => ({
      id: p.id,
      kind: "shared",
      label: listChipLabel(p.name),
      // Счётчик может быть неизвестен: позиции на сервере, и до первого
      // открытия списка их количество мы не знаем.
      counts: p.counts ?? null,
      at: p.joinedAt,
    }));
    return [...local, ...shared]
      .sort((a, b) => b.at - a.at)
      .map((e) => ({ id: e.id, kind: e.kind, label: e.label, counts: e.counts }));
  }, [visibleLists, pointers]);

  const activeLocal = activeId ? visibleLists.find((l) => l.id === activeId) ?? null : null;
  const activeShared = activeId && shared?.snapshot.id === activeId ? shared : null;
  const activePointer = activeId ? pointers.find((p) => p.id === activeId) ?? null : null;

  const changeGrouped = (next: boolean) => {
    setGrouped(next);
    saveGroupedMode(next);
  };

  // --- Списки -----------------------------------------------------------------

  const handleCreate = () => {
    const { lists: next, list } = createList(lists);
    setLists(next);
    reachGoal("shopping_list_created");
    selectActive(list.id);
    // Новый список сразу предлагаем назвать: «Список 3» — имя-заглушка, а
    // осмысленное («Пятёрочка», «Дача») превращает ленту чипов в понятную.
    setRenameValue(list.name);
    setRenameTarget(list);
  };

  const handleSelect = (entry: ChipEntry) => {
    // Повторное нажатие на чип уже открытого списка ничего не делает — кроме
    // случая, когда общий список не открылся: тогда это и есть естественный
    // жест «попробовать ещё раз».
    if (entry.id === activeId && !(entry.kind === "shared" && sharedError)) return;
    if (entry.kind === "shared") {
      const pointer = pointers.find((p) => p.id === entry.id);
      if (pointer) void openShared(pointer);
      return;
    }
    selectActive(entry.id);
  };

  const handleItemsChange = (id: string, items: ShoppingItem[]) => {
    setLists(setListItems(lists, id, items));
  };

  const handleSortChange = (id: string, sort: SortCache | null) => {
    setLists(setListSort(lists, id, sort));
  };

  const openRename = (list: ShoppingListRecord) => {
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
    const next = deleteList(lists, id);
    setLists(next);
    if (activeId === id) {
      // Удалили открытый список — встаём на следующий. Пустого раздела не
      // бывает: не осталось ни одного — создаём первый заново.
      const rest = next.filter((l) => !hidden.has(l.id));
      if (rest.length > 0) selectActive(rest[0].id);
      else if (pointers.length > 0) {
        const pointer = pointers[0];
        void openShared(pointer);
      } else {
        const created = createList(next);
        setLists(created.lists);
        selectActive(created.list.id);
      }
    }
    setDeleteTarget(null);
  };

  // --- Отправить копию списка -------------------------------------------------
  //
  // ВАЖНО не путать с общим списком (openMakeShared): здесь весь список
  // укладывается в ссылку, и получатель заводит СВОЮ копию — дальше два списка
  // живут независимо, отметки друг к другу не ходят. Живой сценарий — только
  // «Позвать в общий список». Тексты и иконки разведены именно поэтому.
  const handleShareCopy = async (list: ShoppingListRecord) => {
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
    // buildShareUrl кладёт САМ СПИСОК в адрес (?shared=<base64url>), получатель
    // разворачивает его в свой локальный список. Это копия, не совместный
    // доступ — тост обязан сказать это прямо, иначе человек ждёт
    // синхронизации, которой не будет.
    toast(ok ? "Ссылка скопирована. Друг получит копию списка — изменения не синхронизируются" : "Не удалось скопировать ссылку");
  };

  const copyBigAsText = async () => {
    if (!shareBig) return;
    const text = `${shareBig.name}\n${itemsToText(shareBig.items)}`;
    const ok = await copyText(text);
    toast(ok ? "Список скопирован текстом" : "Не удалось скопировать");
    setShareBig(null);
  };

  // --- Общие (семейные) списки ------------------------------------------------

  // «Сделать общим» копирует ТЕКУЩИЕ позиции на сервер как стартовый набор.
  //
  // Локальный оригинал остаётся в localStorage нетронутым, но в ленте чипов
  // больше НЕ показывается: связь запоминается в fromLocalId. Иначе получались
  // два чипа с одинаковым именем — и владелец продукта на приёмке сам открыл
  // не тот, увидел его пустым и решил, что синхронизация сломана. Уберёте
  // общий с устройства — оригинал вернётся на место.
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
      setPointers(
        rememberSharedList({
          id: snap.id,
          name: snap.name,
          memberRef: ownerRef,
          role: "owner",
          joinedAt: Date.now(),
          fromLocalId: makeSharedTarget.id,
          counts: { total: snap.items.length, done: snap.items.filter((it) => it.checked).length },
        }),
      );
      reachGoal("shopping_shared_created");
      setMakeSharedTarget(null);
      setShared({ snapshot: snap, memberRef: ownerRef });
      selectActive(snap.id);
      // Без разосланной ссылки общий список ничем не отличается от обычного, и
      // владелец остаётся с ощущением «ничего не произошло». Поэтому не тост, а
      // окно с одной большой кнопкой.
      setInviteFor({ id: snap.id, name: snap.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось создать общий список");
    } finally {
      setMakeSharedBusy(false);
    }
  };

  const confirmForget = () => {
    if (!forgetTarget) return;
    const id = forgetTarget.id;
    const next = forgetSharedList(id);
    setPointers(next);
    setForgetTarget(null);
    if (activeId === id) {
      setShared(null);
      // Локальный оригинал больше не скрыт — он и станет активным.
      const back = lists.find((l) => l.id === forgetTarget.fromLocalId) ?? lists[0];
      if (back) selectActive(back.id);
      else if (next.length > 0) void openShared(next[0]);
      else {
        const created = createList(lists);
        setLists(created.lists);
        selectActive(created.list.id);
      }
    }
    toast("Список убран с этого устройства");
  };

  // Отправить ссылку-приглашение. Системное окно «Поделиться» на телефоне,
  // копирование в буфер — на десктопе и если человек его отменил.
  const shareInvite = async (listId: string, listName: string) => {
    const url = `${window.location.origin}/shopping/join/${listId}`;
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

  if (!loaded) {
    return <main className="container sh-main" style={{ minHeight: "60vh" }} />;
  }

  return (
    <main className="container sh-main">
      <ListChips
        entries={entries}
        activeId={activeId}
        loadingId={sharedLoading}
        onSelect={handleSelect}
        onCreate={handleCreate}
      />

      {activeShared ? (
        <SharedList
          key={activeShared.snapshot.id}
          listId={activeShared.snapshot.id}
          memberRef={activeShared.memberRef}
          initial={activeShared.snapshot}
          grouped={grouped}
          onGroupedChange={changeGrouped}
          onOpenMenu={setMenu}
          onCounts={handleSharedCounts}
          onForget={() => {
            const pointer = pointers.find((p) => p.id === activeShared.snapshot.id);
            if (pointer) setForgetTarget(pointer);
          }}
        />
      ) : activeLocal ? (
        <LocalList
          key={activeLocal.id}
          list={activeLocal}
          grouped={grouped}
          onGroupedChange={changeGrouped}
          onItemsChange={(items) => handleItemsChange(activeLocal.id, items)}
          onSortChange={(sort) => handleSortChange(activeLocal.id, sort)}
          onOpenMenu={setMenu}
          onRename={() => openRename(activeLocal)}
          onDelete={() => setDeleteTarget(activeLocal)}
          onShareCopy={() => void handleShareCopy(activeLocal)}
          onMakeShared={() => {
            setMakeSharedName(lastKnownMemberName());
            setMakeSharedTarget(activeLocal);
          }}
        />
      ) : sharedError && activePointer ? (
        // Общий список не открылся. Экран не должен оставаться пустым: говорим
        // причину и даём повторить, не трогая выбор человека.
        <div className="sh-failed" role="alert">
          <p className="sh-failed-title">Не удалось открыть «{activePointer.name}»</p>
          <p className="sh-failed-text">{sharedError}</p>
          <button type="button" className="sl-modal-primary" onClick={() => void openShared(activePointer)}>
            Повторить
          </button>
          <button type="button" className="sh-failed-link" onClick={() => setForgetTarget(activePointer)}>
            Убрать список у себя
          </button>
        </div>
      ) : (
        // Общий список ещё тянется с сервера, а локального под рукой нет.
        <div className="sh-loading" role="status">
          <Loader2 size={22} className="animate-spin" /> Открываю список…
        </div>
      )}

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
      {renameTarget && (
        <div className="sl-overlay sl-overlay-center" onClick={() => setRenameTarget(null)}>
          <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sl-modal-head">
              <h2 className="sl-modal-title">Название списка</h2>
              <button type="button" className="sl-modal-x" onClick={() => setRenameTarget(null)} aria-label="Закрыть">
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
              <h2 className="sl-modal-title">Общий список с семьёй</h2>
              <button type="button" className="sl-modal-x" onClick={() => setMakeSharedTarget(null)} aria-label="Закрыть">
                <X size={20} />
              </button>
            </div>
            {/* Текст обязан совпадать с тем, что реально произойдёт. Прежняя
                формулировка обещала «этот список останется у вас и таким, как
                есть» — а локальный оригинал сразу прячется из ленты
                (convertedLocalListIds), и человек решал, что список пропал. */}
            <p style={{ margin: "0 0 var(--space-3) 0", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              «{makeSharedTarget.name}» станет общим: вы получите ссылку, и всё, что кто-то отметит,
              сразу увидят остальные. Позиции и отметки перенесутся, а вместо двух одинаковых
              списков останется один — со значком «людей».
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
      {forgetTarget && (
        <div className="sl-overlay sl-overlay-center" onClick={() => setForgetTarget(null)}>
          <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="sl-modal-title" style={{ marginBottom: "var(--space-2)" }}>
              Убрать список у себя?
            </h2>
            <p style={{ margin: "0 0 var(--space-4) 0", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              «{forgetTarget.name}» исчезнет с этого устройства. У остальных участников он останется,
              и вы сможете вернуться по той же ссылке.
            </p>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button type="button" className="sl-modal-secondary" onClick={() => setForgetTarget(null)}>
                Отмена
              </button>
              <button type="button" className="sl-modal-danger" onClick={confirmForget}>
                Убрать
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
