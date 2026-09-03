"use client";
import { pickImageIntoInputHandler } from "@/lib/native";

import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Camera, Image as ImageIcon, Loader2, Mic, Plus, Square, X } from "lucide-react";

import { reachGoal } from "@/lib/metrika";
import { fetchWithTimeout, preparePhoto, reportPhotoError } from "@/lib/photo";
import { parseNames } from "@/lib/shoppingList";
import { useVoiceInput } from "@/components/useVoiceInput";

// Ввод продуктов: текст, голос и фото в одном блоке.
//
// Вынесен из ShoppingListView, чтобы ОБА экрана списка — локальный и общий
// (семейный) — имели один и тот же ввод. Дублировать здесь нечего: пайплайн
// фото и разбор голоса нетривиальны, и две расходящиеся копии разъехались бы
// после первой же правки.
//
// Компонент НИЧЕГО не знает про хранилище: он отдаёт наверх готовые названия
// через onAdd, а куда они лягут — в localStorage или на сервер — решает
// родитель. Санитайз и дедуп при этом всё равно происходят дальше (addNames
// локально, серверный роут для общего списка).

// Потолок для отправки НЕОБРАБОТАННОГО оригинала (когда браузер не смог его
// подготовить). Совпадает с лимитом роута распознавания — больше он не примет.
const RAW_PHOTO_MAX_BYTES = 15 * 1024 * 1024;

type Props = {
  /** Готовые названия из любого источника. Родитель решает, куда их девать. */
  onAdd: (names: string[]) => void;
  /** Идёт запись на сервер — блокируем повторные отправки. */
  busy?: boolean;
  placeholder?: string;
};

export default function ShoppingItemInput({ onAdd, busy = false, placeholder = "Молоко 2 л" }: Props) {
  const [input, setInput] = useState("");

  // Поле ввода — textarea, а не input: однострочный input по спецификации
  // ВЫРЕЗАЕТ переводы строк из вставленного текста, и список из заметок
  // склеивался в одну кашу («молоко 2л» + «яйца» → «молоко 2ляйца»).
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const autoGrow = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  };

  const handleAdd = () => {
    if (!input.trim() || busy) return;
    const names = parseNames(input);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "";
    if (names.length > 0) onAdd(names);
  };

  // Голосовой ввод: браузерный Web Speech API (никакого сервера/OpenAI). Если
  // API не поддерживается — voice.supported=false, кнопку микрофона не рисуем.
  const voice = useVoiceInput();

  // --- Распознавание списка по фото ------------------------------------------
  // Фото уходит на НАШ роут /api/shopping/recognize — ключ OpenAI живёт только
  // на сервере. Результат НЕ попадает в список сразу: рукописное читается с
  // ошибками, поэтому позиции ждут подтверждения в блоке чипов.
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
      //
      // Если браузер формат не осилил (canvas не знает TIFF, BMP со сканера,
      // экзотику) — отправляем ОРИГИНАЛ: роут распознавания умеет привести к
      // JPEG сам. Лучше лишний мегабайт по сети, чем «не удалось обработать
      // фото» на файле, который на сервере читается прекрасно.
      let payload: File;
      try {
        payload = await preparePhoto(
          raw,
          { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true },
          "shopping-list.jpg",
        );
      } catch (prepareErr) {
        if (raw.size > RAW_PHOTO_MAX_BYTES) throw prepareErr; // слишком тяжёлый как есть
        void reportPhotoError("shopping-recognize-prepare", raw, prepareErr);
        payload = raw;
      }

      const form = new FormData();
      form.append("image", payload);
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
    if (busy) return;
    const fromPhoto = pendingSource === "photo";
    const names = [...pendingNames];
    cancelPending();
    if (names.length === 0) return;
    reachGoal(fromPhoto ? "shopping_photo_added" : "shopping_voice_added", { count: names.length });
    onAdd(names);
  };

  return (
    <>
      {/* Телефон — главный сценарий: поле на всю ширину, микрофон и камера рядом
          с ним, крупная кнопка «Добавить» отдельной строкой под полем. */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        {/* flex-start: когда поле вырастает под вставленный список, кнопки
            остаются у первой строки, а не уезжают в середину. */}
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
            placeholder={placeholder}
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
              (мягкая деградация — без поддержки кнопки просто нет). */}
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
          disabled={!input.trim() || busy}
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
            cursor: input.trim() && !busy ? "pointer" : "default",
            opacity: input.trim() && !busy ? 1 : 0.45,
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
            <button type="button" className="voice-btn-done" onClick={confirmPending} disabled={busy}>
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
            <label
              className="sl-sheet-btn"
              onClick={async (e) => {
                if (await pickImageIntoInputHandler(handlePhotoFile, "camera")) { e.preventDefault(); setPhotoSheet(false); }
              }}
            >
              <Camera size={20} /> Снять фото
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="upload-action-input"
                onChange={handlePhotoFile}
              />
            </label>
            <label
              className="sl-sheet-btn"
              onClick={async (e) => {
                if (await pickImageIntoInputHandler(handlePhotoFile, "photos")) { e.preventDefault(); setPhotoSheet(false); }
              }}
            >
              <ImageIcon size={20} /> Из галереи
              {/* accept без списка форматов: любой снимок должен быть выбираемым.
                  Расширения HEIC/HEIF дописаны отдельно — часть Android-пикеров
                  не относит их к image/* и гасит файл в списке. */}
              <input
                type="file"
                accept="image/*,.heic,.HEIC,.heif,.HEIF"
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
    </>
  );
}
