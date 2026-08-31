"use client";

import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, Camera, Check, Copy, Image as ImageIcon, Loader2, Mic, Plus, Share2, ShoppingCart, Sparkles, Square, Trash2, X } from "lucide-react";

import { KUPER_CPA_URL, KUPER_AD_LABEL } from "@/lib/constants";
import { reachGoal } from "@/lib/metrika";
import { copyText } from "@/lib/clipboard";
import { fetchWithTimeout, preparePhoto, reportPhotoError } from "@/lib/photo";
import {
  MAX_SHOPPING_ITEMS,
  type ShoppingGroup,
  type ShoppingItem,
  type SortCache,
  addFromInput,
  addNames,
  groupsToText,
  itemsToText,
  listSignature,
} from "@/lib/shoppingList";
import { splitListTitle, type ShoppingListRecord } from "@/lib/shoppingLists";
import { useVoiceInput } from "@/components/useVoiceInput";

const EMPTY_TEXT =
  "Список пуст. Добавьте продукты — и я расставлю их по отделам магазина, чтобы ничего не забыть и не ходить по залу дважды.";

// Позиции: сначала невычеркнутые, потом купленные (серым, вниз). Стабильно.
function ordered(items: ShoppingItem[]): ShoppingItem[] {
  return [...items].sort((a, b) => Number(a.checked) - Number(b.checked));
}

function pluralizeProduct(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} продукт`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} продукта`;
  return `${n} продуктов`;
}

type Props = {
  list: ShoppingListRecord;
  onItemsChange: (items: ShoppingItem[]) => void;
  onSortChange: (sort: SortCache | null) => void;
  onBack: () => void;
  onShare: () => void;
};

export default function ShoppingListView({ list, onItemsChange, onSortChange, onBack, onShare }: Props) {
  const [input, setInput] = useState("");
  const [sorting, setSorting] = useState(false);
  const [sortError, setSortError] = useState<string | null>(null);

  const items = list.items;
  const { title, subtitle } = useMemo(() => splitListTitle(list.name), [list.name]);
  const sig = useMemo(() => listSignature(items), [items]);
  const sortedGroups: ShoppingGroup[] | null = list.sort ? list.sort.groups : null;
  const isSorted = list.sort !== null && list.sort !== undefined && list.sort.sig === sig;
  const hasChecked = items.some((it) => it.checked);
  const nameToItem = useMemo(() => {
    const map = new Map<string, ShoppingItem>();
    for (const it of items) map.set(it.name.trim().toLowerCase(), it);
    return map;
  }, [items]);

  // Поле ввода — textarea, а не input: однострочный input по спецификации
  // ВЫРЕЗАЕТ переводы строк из вставленного текста, и список из заметок
  // склеивался в одну кашу («молоко 2л» + «яйца» → «молоко 2ляйца»). Textarea
  // сохраняет строки; растёт по содержимому, Enter = «Добавить».
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const autoGrow = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  };

  const handleAdd = () => {
    if (!input.trim()) return;
    const result = addFromInput(items, input);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "";
    if (result.added > 0) {
      onItemsChange(result.items);
      reachGoal("shopping_item_added");
      // Вставили сразу несколько — подтверждаем, сколько именно распознали.
      if (result.added > 1) toast.success(`Добавлено: ${pluralizeProduct(result.added)}`);
    }
    if (result.limited) {
      toast.error(`Список полон: не больше ${MAX_SHOPPING_ITEMS} позиций`);
    } else if (result.added === 0 && result.duplicate > 0) {
      toast("Такой продукт уже в списке");
    }
  };

  // Голосовой ввод: браузерный Web Speech API (никакого сервера/OpenAI). Если
  // API не поддерживается — voice.supported=false, кнопку микрофона не рисуем.
  const voice = useVoiceInput();

  // --- Распознавание списка по фото ------------------------------------------
  // Фото уходит на НАШ роут /api/shopping/recognize — ключ OpenAI живёт только
  // на сервере. Результат НЕ попадает в список сразу: рукописное читается с
  // ошибками, поэтому позиции ждут подтверждения в том же блоке чипов, что и
  // голосовые.
  const [photoSheet, setPhotoSheet] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoNames, setPhotoNames] = useState<string[] | null>(null);

  // Чипы на подтверждение приходят либо из голоса, либо из фото — одновременно
  // не бывает: старт одного источника гасит другой.
  const pendingSource: "photo" | "voice" | null = photoNames ? "photo" : voice.chips.length > 0 ? "voice" : null;
  const pendingNames = photoNames ?? voice.chips;

  const startVoice = () => {
    setPhotoNames(null);
    voice.start();
  };

  const openPhotoSheet = () => {
    reachGoal("shopping_photo_click");
    setPhotoSheet(true);
  };

  const handlePhotoFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const raw = files[0];
    e.target.value = ""; // иначе повторный выбор ТОГО ЖЕ файла не даст события
    setPhotoSheet(false);
    voice.reset();
    setPhotoNames(null);
    setPhotoBusy(true);
    let httpStatus = 0;
    try {
      // Общий клиентский пайплайн фото: HEIC → JPEG (декод на сервере), ресайз,
      // очистка EXIF. Свой путь тут заводить нельзя — сломается HEIC на Android.
      const prepared = await preparePhoto(
        raw,
        { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true },
        "shopping-list.jpg",
      );
      const form = new FormData();
      form.append("image", prepared);
      // 30-секундный потолок: на плохой сети запрос иначе висит молча.
      const res = await fetchWithTimeout(
        "/api/shopping/recognize",
        { method: "POST", body: form },
        "shopping-recognize-timeout",
      );
      httpStatus = res.status;
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Не удалось распознать фото");

      const names: string[] = Array.isArray(json?.items) ? json.items : [];
      if (json?.noList || names.length === 0) {
        // Честный отказ вместо пустых чипов.
        reachGoal("shopping_photo_no_list");
        toast("Не нашёл список на фото");
        return;
      }
      setPhotoNames(names);
      reachGoal("shopping_photo_recognized", { count: names.length });
    } catch (err) {
      void reportPhotoError("shopping-recognize", raw, err, {
        marker: "photo_client_error",
        httpStatus: httpStatus || undefined,
      });
      toast.error(err instanceof Error ? err.message : "Не удалось распознать фото");
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePending = (index: number) => {
    if (pendingSource === "photo") {
      setPhotoNames((prev) => {
        if (!prev) return prev;
        const next = prev.filter((_, i) => i !== index);
        return next.length > 0 ? next : null; // убрали всё — блок закрывается
      });
      return;
    }
    voice.removeChip(index);
  };

  const cancelPending = () => {
    setPhotoNames(null);
    voice.reset();
  };

  const confirmPending = () => {
    const fromPhoto = pendingSource === "photo";
    const result = addNames(items, pendingNames); // та же санитизация/лимиты, что и у текстового ввода
    if (result.added > 0) {
      onItemsChange(result.items);
      reachGoal(fromPhoto ? "shopping_photo_added" : "shopping_voice_added", { count: result.added });
      toast.success(`Добавлено: ${pluralizeProduct(result.added)}`);
    } else if (result.duplicate > 0) {
      toast("Всё это уже в списке");
    }
    if (result.limited) {
      toast.error(`Список полон: не больше ${MAX_SHOPPING_ITEMS} позиций`);
    }
    cancelPending();
  };

  const toggle = (id: string) => {
    onItemsChange(items.map((it) => (it.id === id ? { ...it, checked: !it.checked } : it)));
  };

  const remove = (id: string) => {
    onItemsChange(items.filter((it) => it.id !== id));
  };

  const clearChecked = () => {
    onItemsChange(items.filter((it) => !it.checked));
  };

  const handleSort = async () => {
    if (items.length === 0 || sorting || isSorted) return;
    reachGoal("shopping_sort_click");
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
      onSortChange({ sig, groups });
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

  const renderRow = (it: ShoppingItem) => (
    <li
      key={it.id}
      style={{
        display: "flex",
        // Длинное название переносится на несколько строк — чекбокс и крестик
        // прижаты к верху, а не к середине трёхстрочной позиции.
        alignItems: "flex-start",
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
          // minWidth: 0 обязателен — без него флекс-элемент не даёт тексту
          // переноситься и позиция уезжает за край экрана телефона.
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
    <>
      {/* Шапка списка: назад, название, поделиться. */}
      <header style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", margin: "0 0 var(--space-4) 0" }}>
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
        {/* Имя и дата — разными строками: «Покупки, 31 августа» переносилось по
            ширине как попало («Покупки, 31» / «августа»). Разбивка чисто
            визуальная, в хранилище имя остаётся одной строкой. */}
        <h1
          style={{
            flex: 1,
            minWidth: 0,
            margin: 0,
            lineHeight: 1.2,
            color: "var(--color-text)",
          }}
        >
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
            {title}
          </span>
          {subtitle && (
            <span
              style={{
                display: "block",
                marginTop: 2,
                fontSize: "var(--font-size-body)",
                fontWeight: "var(--font-weight-regular)",
                color: "var(--color-text-secondary)",
                overflowWrap: "anywhere",
              }}
            >
              {subtitle}
            </span>
          )}
        </h1>
        <button
          type="button"
          onClick={onShare}
          aria-label="Поделиться списком"
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

      {/* Ввод. Телефон — главный сценарий: поле на всю ширину, микрофон рядом с
          ним, крупная кнопка «Добавить» отдельной строкой под полем. */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        {/* flex-start: когда поле вырастает под вставленный список, микрофон
            остаётся у первой строки, а не уезжает в середину. */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
          <textarea
            ref={inputRef}
            value={input}
            rows={1}
            onChange={(e) => {
              setInput(e.target.value);
              autoGrow();
            }}
            onKeyDown={(e) => {
              // Enter — добавить (главный сценарий). Shift+Enter — новая строка,
              // если человек набирает список руками.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="Молоко 2 л"
            aria-label="Добавить продукт"
            enterKeyHint="done"
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 52,
              padding: "var(--space-3)",
              fontFamily: "inherit",
              fontSize: "var(--font-size-heading)",
              lineHeight: 1.3,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--color-surface)",
              color: "var(--color-text)",
              resize: "none",
              overflowY: "auto",
            }}
          />

          {/* Кнопка-микрофон: только если браузер поддерживает Web Speech API
              (мягкая деградация — без поддержки кнопки просто нет). Тап во время
              записи — стоп (обрабатывается внутри voice.start()). */}
          {voice.supported && (
            <button
              type="button"
              onClick={startVoice}
              aria-label={voice.status === "listening" ? "Остановить запись" : "Сказать, что купить"}
              className={voice.status === "listening" ? "voice-mic-btn voice-mic-btn-active" : "voice-mic-btn"}
              style={{ marginTop: 2 }}
            >
              {voice.status === "listening" ? <Square size={22} fill="currentColor" /> : <Mic size={26} />}
            </button>
          )}

          {/* Распознать список по фото. Рядом с микрофоном, тот же размер. */}
          <button
            type="button"
            onClick={openPhotoSheet}
            disabled={photoBusy}
            aria-label="Распознать список по фото"
            className="voice-mic-btn"
            style={{ marginTop: 2, opacity: photoBusy ? 0.6 : 1 }}
          >
            {photoBusy ? <Loader2 size={24} className="animate-spin" /> : <Camera size={26} />}
          </button>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={!input.trim()}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-2)",
            width: "100%",
            minHeight: 52,
            marginTop: "var(--space-2)",
            padding: "var(--space-3) var(--space-4)",
            background: "var(--color-accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--font-size-heading)",
            fontWeight: "var(--font-weight-semibold)",
            cursor: input.trim() ? "pointer" : "default",
            opacity: input.trim() ? 1 : 0.45,
            transition: "opacity 0.15s ease",
          }}
        >
          <Plus size={24} strokeWidth={2.6} />
          Добавить
        </button>

        <p
          style={{
            margin: "var(--space-2) 0 0 0",
            fontSize: "var(--font-size-caption)",
            lineHeight: 1.4,
            color: "var(--color-text-muted)",
          }}
        >
          Можно вписать или вставить сразу весь список — через пробел, запятую
          или с новой строки. Или сфотографировать написанный от руки.
        </p>
      </div>

      {/* Пока читаем фото. Отдельный блок, а не тост: распознавание занимает
          несколько секунд, и человек должен видеть, что процесс идёт. */}
      {photoBusy && (
        <div className="sl-photo-status" role="status">
          <Loader2 size={22} className="animate-spin" style={{ flexShrink: 0, color: "var(--color-accent)" }} />
          <div style={{ minWidth: 0 }}>
            <div className="sl-photo-status-title">Читаю список с фото…</div>
            <div className="sl-photo-status-hint">Это займёт пару секунд</div>
          </div>
        </div>
      )}

      {/* Индикатор «Слушаю…». Ниже — то, что распознаётся прямо сейчас: в позицию
          оно попадёт только когда фраза договорена (финальный результат). */}
      {voice.status === "listening" && (
        <div className="voice-listening" role="status">
          <span className="voice-listening-dot" aria-hidden />
          <div style={{ minWidth: 0 }}>
            <div className="voice-listening-title">Слушаю…</div>
            <div className="voice-listening-hint">
              {voice.interim ? voice.interim : "Говорите как удобно — я разберу на продукты"}
            </div>
          </div>
        </div>
      )}

      {/* Спокойная подсказка при отказе в доступе к микрофону — не ошибка. */}
      {voice.status === "denied" && (
        <div className="voice-denied">
          Разрешите доступ к микрофону в настройках браузера, чтобы говорить продукты вслух.
        </div>
      )}

      {/* Превью распознанного: чипами, ничего не улетает в список, пока не нажато
          «Готово». Один и тот же блок для голоса и для фото — и то и другое
          читается с ошибками, поэтому подтверждение обязательно. */}
      {pendingNames.length > 0 && (
        <div className="voice-preview">
          <div className="voice-preview-title">
            {pendingSource === "photo" ? "Добавить с фото:" : "Добавить:"}
          </div>
          <div className="voice-preview-chips">
            {pendingNames.map((name, i) => (
              <span key={`${name}-${i}`} className="voice-chip">
                {name}
                <button
                  type="button"
                  onClick={() => removePending(i)}
                  aria-label={`Убрать «${name}»`}
                  className="voice-chip-x"
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
          {pendingSource === "photo" && (
            <div className="voice-preview-hint">
              Проверьте: с фото я мог прочитать что-то неверно. Лишнее уберите крестиком.
            </div>
          )}
          <div className="voice-preview-actions">
            <button type="button" className="voice-btn-cancel" onClick={cancelPending}>
              Отмена
            </button>
            <button type="button" className="voice-btn-done" onClick={confirmPending}>
              Готово
            </button>
          </div>
        </div>
      )}

      {/* Выбор источника фото. Две явные кнопки, как в поиске по фото: одно
          общее меню на Android открывало только галерею, камера была недоступна.
          capture="environment" — задняя камера; на десктопе игнорируется. */}
      {photoSheet && (
        <div className="sl-overlay" onClick={() => setPhotoSheet(false)}>
          <div className="sl-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sl-sheet-title">Список по фото</div>
            <label className="sl-sheet-btn">
              <Camera size={20} /> Снять фото
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="upload-action-input"
                onChange={handlePhotoFile}
              />
            </label>
            <label className="sl-sheet-btn">
              <ImageIcon size={20} /> Из галереи
              <input
                type="file"
                accept="image/png, image/jpeg, image/jpg, .heic, .HEIC"
                className="upload-action-input"
                onChange={handlePhotoFile}
              />
            </label>
            <button type="button" className="sl-sheet-cancel" onClick={() => setPhotoSheet(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}

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
            {EMPTY_TEXT}
          </p>
        </div>
      ) : (
        <>
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

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <button
              type="button"
              onClick={onShare}
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
              <Share2 size={20} /> Поделиться списком
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
    </>
  );
}
