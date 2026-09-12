"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { ArrowUp, Camera, Image as ImageIcon, Loader2, Mic, Plus, Square, X } from "lucide-react";

import { isNativePlatform, pickImageIntoInputHandler } from "@/lib/native";
import { reachGoal } from "@/lib/metrika";
import { fetchWithTimeout, preparePhoto, reportPhotoError } from "@/lib/photo";
import { parseNames } from "@/lib/shoppingList";
import { useVoiceInput } from "@/components/useVoiceInput";

// Ввод продуктов: текст, голос и фото — ОДНОЙ строкой, прижатой к низу экрана.
//
// Пришёл на смену ShoppingItemInput: сам пайплайн (голос, подготовка фото,
// распознавание, чипы на подтверждение) перенесён один в один, поменялась
// только подача. Прежний блок занимал ~360px в начале экрана — поле, кнопка
// «Добавить» во всю ширину и подсказка в пять строк, — и вместе с остальной
// обвязкой отодвигал первую позицию списка на 573-й пиксель из 812. Теперь
// добавление всегда под рукой и не отнимает у списка ни одной строки.
//
// Компонент НИЧЕГО не знает про хранилище: отдаёт наверх готовые названия через
// onAdd. Санитайз, дедуп и лимит по-прежнему делает получатель (addNames
// локально, серверный роут для общего списка).

// Потолок для отправки НЕОБРАБОТАННОГО оригинала (когда браузер не смог его
// подготовить). Совпадает с лимитом роута распознавания — больше он не примет.
const RAW_PHOTO_MAX_BYTES = 15 * 1024 * 1024;

// Поле растёт под вставленный список, но не выше: это нижняя панель, а не
// половина экрана.
const MAX_INPUT_HEIGHT = 96;

type Props = {
  /** Готовые названия из любого источника. Родитель решает, куда их девать. */
  onAdd: (names: string[]) => void;
  /** Идёт запись на сервер — блокируем повторные отправки. */
  busy?: boolean;
};

export default function AddBar({ onAdd, busy = false }: Props) {
  const [input, setInput] = useState("");
  // Подсказка про запятую показывается ТОЛЬКО когда поле в работе. Раньше под
  // полем висел абзац в пять строк — прочитанный один раз, он потом просто
  // занимал ~150px на каждом экране.
  const [focused, setFocused] = useState(false);

  // Поле ввода — textarea, а не input: однострочный input по спецификации
  // ВЫРЕЗАЕТ переводы строк из вставленного текста, и список из заметок
  // склеивался в одну кашу («молоко 2л» + «яйца» → «молоко 2ляйца»).
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const autoGrow = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  };

  const resetHeight = () => {
    if (inputRef.current) inputRef.current.style.height = "";
  };

  // --- Экранная клавиатура ----------------------------------------------------
  //
  // Панель прижата к низу через position: fixed. На iOS клавиатура НЕ уменьшает
  // layout viewport — она просто наезжает сверху, и панель вместе с полем
  // оказывается под ней: человек печатает вслепую. Поднимаем панель на высоту
  // клавиатуры — разницу между окном и видимой частью.
  //
  // Слушаем ТОЛЬКО resize, то есть само появление и исчезновение клавиатуры.
  // Первая версия слушала ещё и visualViewport «scroll» — и панель дёргалась на
  // каждый пиксель прокрутки страницы с открытой клавиатурой, потому что
  // offsetTop меняется постоянно. Отсюда же transition в CSS: панель переезжает
  // один раз и плавно, а не скачет.
  //
  // Там, где клавиатура сама сжимает вёрстку (Android Chrome), разница выходит
  // нулевой и ничего не происходит — отдельной ветки по платформе не нужно.
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : undefined;
    if (!vv) return;
    const apply = () => {
      const inset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      // Мелочь до 80px — это не клавиатура, а панель браузера или округление.
      // Реагировать на неё значит гонять панель туда-обратно без причины.
      document.documentElement.style.setProperty("--sh-kb-inset", inset > 80 ? `${Math.round(inset)}px` : "0px");
    };
    apply();
    vv.addEventListener("resize", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      document.documentElement.style.removeProperty("--sh-kb-inset");
    };
  }, []);

  const handleAdd = () => {
    if (!input.trim() || busy) return;
    const names = parseNames(input);
    setInput("");
    resetHeight();
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

  const hasText = input.trim().length > 0;

  return (
    <>
      <div className="sh-bar">
        {/* Всё, что требует внимания — статус фото, «Слушаю…», чипы на
            подтверждение — всплывает НАД полем, в той же прижатой к низу
            панели. Раньше эти блоки жили в начале экрана, и человек, нажавший
            микрофон и смотрящий на низ экрана, не видел ни «Слушаю…», ни
            распознанных слов. */}
        {photoBusy && (
          <div className="sh-bar-status" role="status">
            <Loader2 size={20} className="animate-spin" style={{ flexShrink: 0, color: "var(--color-accent)" }} />
            <div style={{ minWidth: 0 }}>
              <div className="sl-photo-status-title">Читаю список с фото…</div>
              <div className="sl-photo-status-hint">Это займёт пару секунд</div>
            </div>
          </div>
        )}

        {voice.status === "listening" && (
          <div className="sh-bar-status" role="status">
            <span className="voice-listening-dot" aria-hidden />
            <div style={{ minWidth: 0 }}>
              <div className="voice-listening-title">Слушаю…</div>
              <div className="voice-listening-hint">
                {voice.interim ? voice.interim : "Говорите как удобно — я разберу на продукты"}
              </div>
            </div>
          </div>
        )}

        {voice.status === "denied" && (
          <div className="sh-bar-status">
            Разрешите доступ к микрофону в настройках браузера, чтобы говорить продукты вслух.
          </div>
        )}

        {/* Превью распознанного: чипами, ничего не улетает в список, пока не
            нажато «Готово». Один и тот же блок для голоса и для фото — и то и
            другое читается с ошибками, поэтому подтверждение обязательно. */}
        {pendingNames.length > 0 && (
          <div className="sh-bar-pending">
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

        {focused && (
          <p className="sh-bar-hint">
            Через запятую или с новой строки — сразу несколько продуктов.
          </p>
        )}

        {/* Одно поле на всю ширину, иконки внутри него — как строка ввода в
            мессенджере. Раньше это были три отдельных кружка в воздухе: поле и
            рядом два круга, которые читались как чужие кнопки поверх экрана. */}
        <div className="sh-field">
          <Plus size={22} className="sh-field-plus" aria-hidden />

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
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            // Подсказка про запятую переехала в строку над полем и видна только
            // пока поле в работе: прежние пять строк объяснений под полем
            // человек читал один раз, а место они занимали всегда.
            placeholder="Добавить продукт"
            aria-label="Добавить продукт"
            enterKeyHint="done"
            className="sh-field-input"
          />

          {/* Пока поле пустое — голос и фото. Как только в поле что-то есть,
              обе иконки уступают место кнопке отправки: на 375px три контрола
              не оставляют места самому полю, а главное действие должно быть
              очевидным. */}
          {hasText ? (
            <button
              type="button"
              onClick={handleAdd}
              disabled={busy}
              className="sh-field-send"
              aria-label="Добавить в список"
            >
              <ArrowUp size={22} strokeWidth={2.6} />
            </button>
          ) : (
            <>
              {/* Микрофон — только если браузер поддерживает Web Speech API
                  (мягкая деградация: без поддержки кнопки просто нет). */}
              {voice.supported && (
                <button
                  type="button"
                  onClick={startVoice}
                  aria-label={voice.status === "listening" ? "Остановить запись" : "Сказать, что купить"}
                  className={voice.status === "listening" ? "sh-field-icon sh-field-icon-rec" : "sh-field-icon"}
                >
                  {voice.status === "listening" ? <Square size={20} fill="currentColor" /> : <Mic size={24} />}
                </button>
              )}

              <button
                type="button"
                onClick={openPhotoSheet}
                disabled={photoBusy}
                aria-label="Распознать список по фото"
                className="sh-field-icon"
              >
                {photoBusy ? <Loader2 size={24} className="animate-spin" /> : <Camera size={24} />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Выбор источника фото. Две явные кнопки, как в поиске по фото: одно
          общее меню на Android открывало только галерею, камера была недоступна.
          capture="environment" — задняя камера; на десктопе игнорируется. */}
      {photoSheet && (
        <div className="sl-overlay" onClick={() => setPhotoSheet(false)}>
          <div className="sl-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sl-sheet-title">Список по фото</div>
            <label
              className="sl-sheet-btn"
              onClick={(e) => {
                // preventDefault строго синхронно — см. комментарий в ServiceView.
                if (!isNativePlatform()) return;
                e.preventDefault();
                setPhotoSheet(false);
                void pickImageIntoInputHandler(handlePhotoFile, "camera");
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
              onClick={(e) => {
                if (!isNativePlatform()) return;
                e.preventDefault();
                setPhotoSheet(false);
                void pickImageIntoInputHandler(handlePhotoFile, "photos");
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
