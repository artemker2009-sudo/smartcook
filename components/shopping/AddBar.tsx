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

// Подсказку «через запятую или с новой строки» человек видит, пока не добавит
// первый продукт. Дальше он уже знает, как это работает, а строка над полем
// только отъедает высоту над клавиатурой.
const HINT_SEEN_KEY = "smartcook_shopping_hint_seen_v1";

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
  // По умолчанию «уже видел»: до чтения localStorage подсказка не мигает.
  const [hintSeen, setHintSeen] = useState(true);
  useEffect(() => {
    const init = () => {
      try {
        setHintSeen(localStorage.getItem(HINT_SEEN_KEY) === "1");
      } catch {
        setHintSeen(false);
      }
    };
    init();
  }, []);
  const markHintSeen = () => {
    if (hintSeen) return;
    setHintSeen(true);
    try {
      localStorage.setItem(HINT_SEEN_KEY, "1");
    } catch {
      // Приватный режим — подсказка просто покажется ещё раз.
    }
  };

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
  // Панель прижата к низу через position: fixed. Пока клавиатура открыта,
  // ставим нижний край панели ровно на нижний край ВИДИМОЙ области:
  // top = visualViewport.offsetTop + visualViewport.height, панель — вверх на
  // свою высоту (CSS, html.sh-kb-open).
  //
  // Именно от видимой области, а не «отступ снизу = окно − видимая часть»:
  // прежняя формула зависела от высоты раскладки, а она у всех своя. Замеры в
  // симуляторе iOS 26:
  //   • Safari, страница прокрутилась: offsetTop 0 — формулы совпадают;
  //   • Safari, фокус у низа страницы: видимая область сдвинута (offsetTop 337),
  //     отступ выходил отрицательным, его обрезали до нуля — панель вставала на
  //     таб-бар, а таб-бар накрывал поле;
  //   • Capacitor: innerHeight сжимается до видимой части (471), а фиксированные
  //     элементы по-прежнему живут в полной высоте (offsetTop 403) — отступ
  //     выходил −403, и панель уехала бы под экран.
  // top от offsetTop + height верен во всех трёх.
  //
  // Прокрутку с открытой клавиатурой НЕ отслеживаем попиксельно: первая версия
  // так и делала, и панель дёргалась. Поправка — одна, когда прокрутка затихла.
  // Показать поле после фокуса. Живёт в эффекте с visualViewport, а зовётся
  // из onFocus.
  const revealRef = useRef<() => void>(() => {});
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : undefined;
    if (!vv) return;
    const root = document.documentElement;
    // Высота окна БЕЗ клавиатуры. Нужна для оболочек, где клавиатура сама
    // сжимает раскладку (Capacitor/WKWebView, Android): там innerHeight падает
    // вместе с visualViewport, разница между ними нулевая, и по ней клавиатуру
    // не видно — таб-бар оставался стоять прямо на клавиатуре.
    let baseline = window.innerHeight;
    let baseWidth = window.innerWidth;
    // Клавиатура бывает открыта только при фокусе в поле ввода. Без этой
    // проверки складывание панели Safari (окно выросло, потом уменьшилось)
    // принималось бы за клавиатуру.
    const editing = () => {
      const el = document.activeElement as HTMLElement | null;
      return Boolean(el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable));
    };
    const apply = () => {
      if (window.innerWidth !== baseWidth) {
        // Поворот экрана — старая высота больше не годится.
        baseWidth = window.innerWidth;
        baseline = window.innerHeight;
      }
      if (!editing()) baseline = window.innerHeight;
      const keyboard = editing() ? baseline - vv.height : 0;
      if (keyboard > 80) {
        root.style.setProperty("--sh-vv-bottom", `${Math.round(vv.offsetTop + vv.height)}px`);
        root.classList.add("sh-kb-open");
      } else {
        root.style.removeProperty("--sh-vv-bottom");
        root.classList.remove("sh-kb-open");
      }
    };

    // Прокрутка с открытой клавиатурой: панель НЕ двигаем на каждый пиксель
    // (так она дёргалась), а поправляем один раз, когда прокрутка затихла.
    // В Safari iOS 26 offsetTop при прокрутке не меняется, и поправка ничего
    // не сдвигает; iOS 17/18 сдвигает саму видимую область — там панель
    // встанет на место одним переездом.
    let settle: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      if (!root.classList.contains("sh-kb-open")) return;
      clearTimeout(settle);
      settle = setTimeout(apply, 150);
    };

    // После фокуса: дождаться, пока клавиатура выедет, пересчитать отступ и
    // показать поле, если его всё-таки перекрыло. block: "nearest" не
    // прокручивает страницу, когда поле и так видно.
    let reveal: ReturnType<typeof setTimeout> | undefined;
    revealRef.current = () => {
      clearTimeout(reveal);
      const run = () => {
        apply();
        inputRef.current?.scrollIntoView({ block: "nearest" });
      };
      const onKeyboard = () => {
        vv.removeEventListener("resize", onKeyboard);
        clearTimeout(reveal);
        // Клавиатура выезжает с анимацией, и resize приходит в её начале.
        reveal = setTimeout(run, 120);
      };
      vv.addEventListener("resize", onKeyboard);
      // Клавиатура уже была открыта (фокус переходит с другого поля) — resize
      // не придёт вовсе.
      reveal = setTimeout(() => {
        vv.removeEventListener("resize", onKeyboard);
        run();
      }, 600);
    };

    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", onScroll);
    // Сжатие раскладки (Capacitor) приходит событием окна, а не visualViewport;
    // фокус и уход из поля меняют ответ на «открыта ли клавиатура».
    window.addEventListener("resize", apply);
    document.addEventListener("focusin", apply);
    document.addEventListener("focusout", apply);
    return () => {
      clearTimeout(settle);
      clearTimeout(reveal);
      revealRef.current = () => {};
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", apply);
      document.removeEventListener("focusin", apply);
      document.removeEventListener("focusout", apply);
      root.style.removeProperty("--sh-vv-bottom");
      root.classList.remove("sh-kb-open");
    };
  }, []);

  // Добавление одной позиции. Зовётся из трёх мест: стрелка, Enter с
  // физической клавиатуры и клавиша действия экранной клавиатуры.
  //
  // Фокус ВОЗВРАЩАЕМ в поле всегда: человек добавляет продукты подряд, и
  // закрывшаяся после каждого клавиатура превращает список из десяти позиций
  // в десять заходов в поле. Вызов у уже сфокусированного поля — пустая
  // операция, страницу он не двигает.
  const handleAdd = () => {
    if (!input.trim() || busy) return;
    const names = parseNames(input);
    setInput("");
    resetHeight();
    inputRef.current?.focus();
    if (names.length > 0) {
      onAdd(names);
      markHintSeen();
    }
  };

  // Что последним пришло в keydown. Нужно, чтобы отличить «перенос строки,
  // который человек попросил сам» (Shift+Enter — тогда в keydown был честный
  // key === "Enter") от клавиши действия экранной клавиатуры, которая на
  // мобильных приходит в keydown как "Unidentified"/"Process" (клавиатура
  // работает через IME-композицию) и до обработчика Enter просто не доходит.
  const lastKeyRef = useRef<string>("");

  // Тап по стрелке уже добавил позицию — следующий click по ней же надо
  // проглотить. Время, а не булев флаг: click после preventDefault на
  // pointerdown приходит не во всех браузерах, и флаг остался бы висеть.
  const pointerAddAtRef = useRef(0);

  // Клавиша действия ЭКРАННОЙ клавиатуры («Готово» на iOS, «Отправить» на
  // Android) до обработчика Enter не доходит: пока работает автоподбор слова,
  // мобильные клавиатуры шлют keydown с key === "Unidentified" — Enter в нём
  // не опознать. В поле вместо добавления продукта падал перенос строки:
  // проверено в симуляторе iOS 26 на русской раскладке, поле молча вырастало
  // до двух строк.
  //
  // Слушатель именно НАТИВНЫЙ: React-овский onBeforeInput — своя синтетика
  // поверх textInput, в ней нет inputType и она не приходит на перенос строки
  // вовсе.
  //
  // Намеренный перенос строки (Shift+Enter с физической клавиатуры) сюда тоже
  // приходит, но у него в keydown был честный "Enter" — такой пропускаем.
  // Обычный Enter до beforeinput не доживает: его гасит onKeyDown.
  const handleAddRef = useRef(() => {});
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onBeforeInput = (e: InputEvent) => {
      if (e.inputType !== "insertLineBreak" && e.inputType !== "insertParagraph") return;
      if (lastKeyRef.current === "Enter") return;
      e.preventDefault();
      handleAddRef.current();
    };
    el.addEventListener("beforeinput", onBeforeInput);
    return () => el.removeEventListener("beforeinput", onBeforeInput);
  }, []);

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
    markHintSeen();
  };

  // Нативный слушатель beforeinput живёт один на всю жизнь компонента, а
  // handleAdd замыкается на текущий input — держим ссылку свежей.
  useEffect(() => {
    handleAddRef.current = handleAdd;
  });

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

        {focused && !hintSeen && (
          <p className="sh-bar-hint">
            Через запятую или с новой строки — сразу несколько продуктов.
          </p>
        )}

        {/* Одно поле на всю ширину, иконки внутри него — как строка ввода в
            мессенджере. Раньше это были три отдельных кружка в воздухе: поле и
            рядом два круга, которые читались как чужие кнопки поверх экрана. */}
        <div
          className="sh-field"
          // Промах по кнопке не должен стоить человеку клавиатуры. Поле —
          // 52px высотой, кнопка внутри — круг 40px: палец легко попадает в
          // поля вокруг неё, а это уже пустое место контейнера. Тап по нему
          // закрывал клавиатуру и не делал ровно ничего — со стороны
          // неотличимо от «кнопка не работает».
          //
          // Поэтому тап по пустому месту рамки оставляет фокус в поле. Тапы по
          // самому полю и по кнопкам внутри не трогаем: им нужно и обычное
          // поведение, и свой click.
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget) return;
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
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
              lastKeyRef.current = e.key;
              // Enter — добавить (главный сценарий). Shift+Enter — новая строка,
              // если человек набирает список руками.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAdd();
              }
            }}
            onFocus={() => {
              setFocused(true);
              revealRef.current();
            }}
            onBlur={() => setFocused(false)}
            // Подсказка про запятую переехала в строку над полем и видна только
            // пока поле в работе: прежние пять строк объяснений под полем
            // человек читал один раз, а место они занимали всегда.
            placeholder="Добавить продукт"
            aria-label="Добавить продукт"
            // «Отправить», а не «Готово»: IME_ACTION_DONE на Android закрывает
            // клавиатуру сразу после нажатия, и следующий продукт приходится
            // начинать с нового тапа по полю. Действие «отправить» клавиатуру
            // оставляет открытой — ровно то, что нужно для списка из десяти
            // позиций подряд.
            enterKeyHint="send"
            className="sh-field-input"
          />

          {/* Пока поле пустое — голос и фото. Как только в поле что-то есть,
              обе иконки уступают место кнопке отправки: на 375px три контрола
              не оставляют места самому полю, а главное действие должно быть
              очевидным. */}
          {hasText ? (
            <button
              type="button"
              // Кнопка НЕ забирает фокус у поля: иначе тап уходил в blur,
              // клавиатура закрывалась, панель съезжала вниз — и сам тап
              // приходился уже мимо кнопки.
              //
              // С пальца добавляем ПРЯМО ЗДЕСЬ, а не в onClick: preventDefault
              // на pointerdown отменяет и совместимостные события касания, а
              // click в WebKit — одно из них, и до кнопки он может не дойти
              // вовсе. Ровно так и выглядел отчёт: клавиатура прячется,
              // продукт не добавляется. Мышь оставляем на onClick — там
              // нажатие можно ещё отменить, отведя курсор.
              onPointerDown={(e) => {
                if (e.pointerType === "mouse" && e.button !== 0) return;
                e.preventDefault();
                if (e.pointerType === "mouse") return;
                pointerAddAtRef.current = Date.now();
                handleAdd();
              }}
              onClick={() => {
                // Браузеры, которые click всё-таки прислали (Android), не
                // должны добавить позицию второй раз.
                if (Date.now() - pointerAddAtRef.current < 700) return;
                handleAdd();
              }}
              disabled={busy}
              className="sh-field-send"
              aria-label="Добавить в список"
            >
              <ArrowUp size={22} strokeWidth={2.6} />
            </button>
          ) : (
            // Голос и фото — ОДНОЙ группой справа, каждая кнопка в своём
            // круге. Голые серые иконки без подложки не читались как кнопки.
            <div className="sh-field-actions">
              {/* Микрофон — только если браузер поддерживает Web Speech API
                  (мягкая деградация: без поддержки кнопки просто нет). */}
              {voice.supported && (
                <button
                  type="button"
                  onClick={startVoice}
                  aria-label={voice.status === "listening" ? "Остановить запись" : "Сказать, что купить"}
                  className={voice.status === "listening" ? "sh-field-icon sh-field-icon-rec" : "sh-field-icon"}
                >
                  {voice.status === "listening" ? <Square size={16} fill="currentColor" /> : <Mic size={20} />}
                </button>
              )}

              <button
                type="button"
                onClick={openPhotoSheet}
                disabled={photoBusy}
                aria-label="Распознать список по фото"
                className="sh-field-icon"
              >
                {photoBusy ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
              </button>
            </div>
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
