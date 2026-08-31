"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, Loader2, Mic, Plus, Share2, ShoppingCart, Sparkles, Square, Trash2, X } from "lucide-react";

import { KUPER_CPA_URL, KUPER_AD_LABEL } from "@/lib/constants";
import { reachGoal } from "@/lib/metrika";
import { copyText } from "@/lib/clipboard";
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
import type { ShoppingListRecord } from "@/lib/shoppingLists";
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

  const handleVoiceConfirm = () => {
    const result = addNames(items, voice.chips); // та же санитизация/лимиты, что и у текстового ввода
    if (result.added > 0) {
      onItemsChange(result.items);
      reachGoal("shopping_voice_added", { count: result.added });
      toast.success(`Добавлено: ${pluralizeProduct(result.added)}`);
    } else if (result.duplicate > 0) {
      toast("Всё это уже в списке");
    }
    if (result.limited) {
      toast.error(`Список полон: не больше ${MAX_SHOPPING_ITEMS} позиций`);
    }
    voice.reset();
  };

  const handleVoiceCancel = () => {
    voice.reset();
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
        <h1
          style={{
            flex: 1,
            minWidth: 0,
            margin: 0,
            fontSize: "var(--font-size-title)",
            fontWeight: "var(--font-weight-semibold)",
            lineHeight: 1.2,
            color: "var(--color-text)",
            // Не обрезаем многоточием: длинное название переносится на две
            // строки и остаётся читаемым.
            overflowWrap: "anywhere",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
          }}
        >
          {list.name}
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
              onClick={voice.start}
              aria-label={voice.status === "listening" ? "Остановить запись" : "Сказать, что купить"}
              className={voice.status === "listening" ? "voice-mic-btn voice-mic-btn-active" : "voice-mic-btn"}
              style={{ marginTop: 2 }}
            >
              {voice.status === "listening" ? <Square size={22} fill="currentColor" /> : <Mic size={26} />}
            </button>
          )}
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
          или с новой строки.
        </p>
      </div>

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

      {/* Превью распознанных продуктов: чипами, ничего не улетает в список, пока
          не нажато «Готово». Показывается и во время записи, и после остановки —
          пока пользователь не подтвердит или не отменит. */}
      {(voice.status === "listening" || voice.chips.length > 0) && voice.chips.length > 0 && (
        <div className="voice-preview">
          <div className="voice-preview-title">Добавить:</div>
          <div className="voice-preview-chips">
            {voice.chips.map((name, i) => (
              <span key={`${name}-${i}`} className="voice-chip">
                {name}
                <button
                  type="button"
                  onClick={() => voice.removeChip(i)}
                  aria-label={`Убрать «${name}»`}
                  className="voice-chip-x"
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
          <div className="voice-preview-actions">
            <button type="button" className="voice-btn-cancel" onClick={handleVoiceCancel}>
              Отмена
            </button>
            <button type="button" className="voice-btn-done" onClick={handleVoiceConfirm}>
              Готово
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
