"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, RotateCw, ListChecks, Check, Mic } from "lucide-react";
import { reachGoal } from "@/lib/metrika";

// Режим «Готовим вместе» (задача Z + AC). Проектирование под целевого
// пользователя — женщина 60+, готовит, очки сняты, руки в муке:
//   • Один экран = одно действие. Инвентарь экрана шага СТРОГО ограничен:
//     номер шага, текст шага, 2 гигантские кнопки Назад/Дальше, «Повторить»,
//     компактный «Состав», выход. Единственная добавка (AC) — маленький
//     индикатор «🎤 Слушаю» / кнопка «Продолжить голосом», когда включён голос.
//   • Случайный тап не выбрасывает: выход — только явный ✕ с подтверждением.
//
// Голос (AC) — ВЕЗДЕ, но строго ОПТ-ИН: разрешение микрофона запрашивается
// явным тапом на выделенном экране выбора, а не автозапуском (в AA автозапуск
// на iOS показывал системный промпт поверх экрана → «мёртвые кнопки»). Экран
// выбора показывается КАЖДЫЙ вход — это и предсказуемость для 60+, и жест,
// разблокирующий TTS/микрофон на iOS.

export type CookIngredient = { name: string; amount?: string };

const VOICE_PREF_KEY = "sc_cook_voice_pref"; // "voice" | "buttons" — какая кнопка первична

// «Разблокировка» озвучки для iOS: самый первый speak() обязан идти из
// пользовательского жеста, иначе на iOS дальнейшая озвучка не работает.
// Вызывается СИНХРОННО в обработчике кнопок экрана выбора (это и есть жест).
export function primeCookVoice() {
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(" "));
    }
  } catch {
    /* озвучка не должна ломать запуск режима */
  }
}

type View = "choice" | "step" | "finish";

export default function CookMode({
  title,
  steps,
  ingredients = [],
  onClose,
  onCookedPhoto,
}: {
  title: string;
  steps: string[];
  ingredients?: CookIngredient[];
  onClose: () => void;
  onCookedPhoto?: () => void;
}) {
  // steps приходят новым массивом на каждый рендер; без useMemo cleanSteps менял
  // идентичность каждый рендер, и эффекты озвучки/распознавания перезапускались
  // бесконечно (баг зацикливания AA). Стабилизируем по ссылке на steps.
  const cleanSteps = useMemo(
    () => (steps || []).map((s) => (s || "").trim()).filter(Boolean),
    [steps],
  );
  const total = cleanSteps.length;

  const [view, setView] = useState<View>("choice");
  const [stepIndex, setStepIndex] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  // --- Голос (AC) ---
  const [voiceMode, setVoiceMode] = useState(false); // пользователь выбрал старт с голосом
  const [listening, setListening] = useState(false); // микрофон сейчас слушает
  const [speaking, setSpeaking] = useState(false); // сейчас звучит озвучка
  const [voicePaused, setVoicePaused] = useState(false); // сказали «стоп»
  const [voiceUnavailable, setVoiceUnavailable] = useState(false); // отказ/ошибка микрофона

  // Поддержка распознавания — вычисляем один раз на клиенте (компонент не
  // рендерится на сервере, поэтому lazy-init без риска рассинхрона гидрации).
  const [srSupported] = useState(
    () =>
      typeof window !== "undefined" &&
      !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
  );
  // Последний выбор: какая кнопка первична по умолчанию (по умолчанию — с голосом).
  const [voicePref, setVoicePref] = useState<"voice" | "buttons">(() => {
    try {
      return localStorage.getItem(VOICE_PREF_KEY) === "buttons" ? "buttons" : "voice";
    } catch {
      return "voice";
    }
  });

  const wakeLockRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const voiceUsedRef = useRef(false);
  const finishedGoalRef = useRef(false);
  const spokenKeyRef = useRef<string>(""); // гарантия «озвучка ровно раз на шаг»

  // --- Озвучка (speechSynthesis) ---
  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ru-RU";
      u.rate = 0.9; // чуть медленнее дефолта — диктуем, а не тараторим
      const ruVoice = window.speechSynthesis
        .getVoices()
        .find((v) => v.lang && v.lang.toLowerCase().startsWith("ru"));
      if (ruVoice) u.voice = ruVoice;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    } catch {
      /* озвучка не должна ломать сценарий */
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
    setSpeaking(false);
  }, []);

  // --- Навигация по шагам ---
  const goNext = useCallback(() => {
    setStepIndex((i) => {
      if (i >= total - 1) {
        setView("finish");
        return i;
      }
      return i + 1;
    });
  }, [total]);

  const goPrev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const repeat = useCallback(() => {
    if (cleanSteps[stepIndex]) speak(cleanSteps[stepIndex]);
  }, [cleanSteps, stepIndex, speak]);

  const markVoiceUsed = useCallback(() => {
    if (!voiceUsedRef.current) {
      voiceUsedRef.current = true;
      reachGoal("cook_mode_voice_used");
    }
  }, []);

  // «Стоп» (команда): пауза озвучки и микрофона; появляется «Продолжить голосом».
  const pauseVoice = useCallback(() => {
    stopSpeaking();
    setVoicePaused(true);
  }, [stopSpeaking]);

  // Желаем ли слушать прямо сейчас (для решения об автоперезапуске в onend).
  const voiceDesiredRef = useRef(false);
  voiceDesiredRef.current = voiceMode && !voicePaused && view === "step";

  // Актуальные команды в ref — чтобы старт/onend не зависели от свежих замыканий.
  const commandsRef = useRef({ goNext, goPrev, repeat, markVoiceUsed, pauseVoice });
  commandsRef.current = { goNext, goPrev, repeat, markVoiceUsed, pauseVoice };

  const stopRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    setListening(false);
    if (rec) {
      try {
        rec.onend = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Старт распознавания. Вызывается ТОЛЬКО из пользовательского жеста (кнопки
  // «с голосом» / «Продолжить голосом»), чтобы на iOS системный промпт микрофона
  // всегда был привязан к тапу и не «прилетал» поверх шага. Все гварды из AA:
  // игнор распознанного во время озвучки, без «готов» в регекспе.
  const startRecognition = useCallback(() => {
    if (typeof window === "undefined") return;
    if (recognitionRef.current) return; // уже слушаем
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVoiceUnavailable(true);
      return;
    }
    let rec: any;
    try {
      rec = new SR();
    } catch {
      setVoiceUnavailable(true);
      return;
    }
    rec.lang = "ru-RU";
    rec.continuous = true;
    rec.interimResults = false;

    rec.onstart = () => setListening(true);
    rec.onresult = (event: any) => {
      // Пока звучит озвучка — микрофон слышит ЕЁ; не трактуем как команду (эхо).
      if (window.speechSynthesis?.speaking) return;
      const last = event.results[event.results.length - 1];
      const phrase = (last?.[0]?.transcript || "").toLowerCase();
      const cmd = commandsRef.current;
      if (/дальш|вперёд|вперед|следующ/.test(phrase)) {
        cmd.markVoiceUsed();
        cmd.goNext();
      } else if (/назад|предыдущ|вернись/.test(phrase)) {
        cmd.markVoiceUsed();
        cmd.goPrev();
      } else if (/повтор|ещё раз|еще раз|прочитай/.test(phrase)) {
        cmd.markVoiceUsed();
        cmd.repeat();
      } else if (/стоп|хватит|замолч|тихо/.test(phrase)) {
        cmd.markVoiceUsed();
        cmd.pauseVoice();
      }
    };
    rec.onerror = (e: any) => {
      setListening(false);
      const err = e?.error;
      // Отказ в доступе — тихо деградируем в кнопки, БЕЗ повторных запросов.
      if (err === "not-allowed" || err === "service-not-allowed") {
        if (recognitionRef.current === rec) recognitionRef.current = null;
        setVoiceUnavailable(true);
        setVoiceMode(false);
      }
      // Прочие ошибки (no-speech, aborted, network) не фатальны — решит onend.
    };
    // Аккуратный перезапуск после onend: iOS сам останавливает распознавание
    // после паузы. Перезапускаем с небольшой задержкой (без тайт-лупа) и НЕ во
    // время озвучки — если ещё говорим, откладываем ещё раз (само-планирование).
    const scheduleRestart = () => {
      window.setTimeout(() => {
        if (recognitionRef.current !== rec || !voiceDesiredRef.current) return;
        if (window.speechSynthesis?.speaking) {
          scheduleRestart();
          return;
        }
        try {
          rec.start();
        } catch {
          recognitionRef.current = null;
        }
      }, 400);
    };
    rec.onend = () => {
      setListening(false);
      if (recognitionRef.current !== rec) return; // нас остановили/заменили
      if (!voiceDesiredRef.current) return; // «стоп»/ушли с шага — не перезапускаем
      scheduleRestart();
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      // Старт упал (например, отключена системная диктовка) — тихо в кнопки.
      recognitionRef.current = null;
      setVoiceUnavailable(true);
    }
  }, []);

  // Автоозвучка ровно ОДИН раз при входе на шаг (ключ view+index в ref).
  useEffect(() => {
    if (view !== "step") return;
    const key = `step:${stepIndex}`;
    if (spokenKeyRef.current === key) return;
    spokenKeyRef.current = key;
    if (cleanSteps[stepIndex]) speak(cleanSteps[stepIndex]);
  }, [view, stepIndex, cleanSteps, speak]);

  // Финальный экран: поздравление + цель (ровно один раз).
  useEffect(() => {
    if (view !== "finish") return;
    if (!finishedGoalRef.current) {
      finishedGoalRef.current = true;
      reachGoal("cook_mode_finish");
    }
    if (spokenKeyRef.current === "finish") return;
    spokenKeyRef.current = "finish";
    speak("Готово! Приятного аппетита!");
  }, [view, speak]);

  // Старт режима — цель один раз.
  useEffect(() => {
    reachGoal("cook_mode_start");
  }, []);

  // Останавливаем микрофон, когда голос больше не нужен (пауза/ушли с шага/финал).
  // СТАРТ здесь не делаем — только из жеста (иначе на iOS промпт «прилетит» сам).
  useEffect(() => {
    const desired = voiceMode && !voicePaused && view === "step";
    if (!desired && recognitionRef.current) stopRecognition();
  }, [voiceMode, voicePaused, view, stopRecognition]);

  // --- Wake Lock (экран не гаснет) + повторный захват при возврате вкладки ---
  useEffect(() => {
    let cancelled = false;
    const request = async () => {
      try {
        const nav = navigator as any;
        if (nav.wakeLock?.request) {
          const lock = await nav.wakeLock.request("screen");
          if (cancelled) {
            lock.release?.();
            return;
          }
          wakeLockRef.current = lock;
        }
      } catch {
        /* Wake Lock мог быть отклонён — не критично */
      }
    };
    request();
    const onVis = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      try {
        wakeLockRef.current?.release?.();
      } catch {
        /* ignore */
      }
      wakeLockRef.current = null;
    };
  }, []);

  // Чистим озвучку и микрофон при размонтировании.
  useEffect(
    () => () => {
      stopRecognition();
      stopSpeaking();
    },
    [stopRecognition, stopSpeaking],
  );

  const savePref = (p: "voice" | "buttons") => {
    setVoicePref(p);
    try {
      localStorage.setItem(VOICE_PREF_KEY, p);
    } catch {
      /* ignore */
    }
  };

  // Старт готовки с экрана выбора. primeCookVoice + первая озвучка + (для голоса)
  // старт микрофона — всё СИНХРОННО в жесте тапа.
  const beginCooking = (withVoice: boolean) => {
    primeCookVoice();
    spokenKeyRef.current = `step:${stepIndex}`;
    if (withVoice) {
      savePref("voice");
      setVoiceMode(true);
      setVoicePaused(false);
      setVoiceUnavailable(false);
      reachGoal("cook_mode_voice_enabled");
      startRecognition(); // запрос микрофона ИМЕННО ЗДЕСЬ (явный жест)
    } else {
      savePref("buttons");
      reachGoal("cook_mode_voice_declined");
    }
    setView("step");
    if (cleanSteps[stepIndex]) speak(cleanSteps[stepIndex]);
  };

  // «Продолжить голосом» после «стоп» — тоже жест, снова стартуем микрофон здесь.
  const resumeVoice = () => {
    setVoicePaused(false);
    startRecognition();
    if (cleanSteps[stepIndex]) speak(cleanSteps[stepIndex]);
  };

  const requestExit = () => {
    stopSpeaking();
    setConfirmExit(true);
  };
  const doExit = () => {
    stopRecognition();
    stopSpeaking();
    onClose();
  };

  if (total === 0) {
    return null; // нет шагов — вести нечего
  }

  const voiceFirst = voicePref === "voice";
  const voiceButton = (
    <button
      type="button"
      className={`cook-btn-giant ${voiceFirst ? "cook-btn-primary" : "cook-btn-secondary"}`}
      onClick={() => beginCooking(true)}
    >
      <Mic size={26} /> Начать с управлением голосом
    </button>
  );
  const buttonsButton = (
    <button
      type="button"
      className={`cook-btn-giant ${voiceFirst ? "cook-btn-secondary" : "cook-btn-primary"}`}
      onClick={() => beginCooking(false)}
    >
      Начать без голоса
    </button>
  );

  return (
    <div className="cook-mode" role="dialog" aria-modal="true" aria-label="Режим готовки">
      {/* --- Экран выбора (каждый вход) --- */}
      {view === "choice" && (
        <div className="cook-screen cook-intro">
          <div className="cook-intro-emoji" aria-hidden>🔊</div>
          <h2 className="cook-intro-title">{title}</h2>
          <p className="cook-intro-text">
            Я буду читать шаги вслух.
            {srSupported ? (
              <>
                {" "}Можно управлять голосом — просто скажите:{" "}
                <b>«дальше», «назад», «повтори», «стоп»</b>.
              </>
            ) : null}
          </p>

          {srSupported ? (
            <>
              {voiceFirst ? (
                <>
                  {voiceButton}
                  {buttonsButton}
                </>
              ) : (
                <>
                  {buttonsButton}
                  {voiceButton}
                </>
              )}
            </>
          ) : (
            <button type="button" className="cook-btn-giant cook-btn-primary" onClick={() => beginCooking(false)}>
              Начинаем 🔊
            </button>
          )}

          <button type="button" className="cook-intro-exit" onClick={onClose}>
            Отмена
          </button>
        </div>
      )}

      {/* --- Экран шага --- */}
      {view === "step" && (
        <div className="cook-screen">
          <div className="cook-topbar">
            <button type="button" className="cook-chip" onClick={() => setShowIngredients(true)}>
              <ListChecks size={22} />
              <span>Состав</span>
            </button>
            <div className="cook-step-counter">
              Шаг {stepIndex + 1} из {total}
            </div>
            <button type="button" className="cook-chip cook-chip-exit" onClick={requestExit} aria-label="Выйти из готовки">
              <X size={24} />
              <span>Выход</span>
            </button>
          </div>

          {/* Голосовой слот — не более одного элемента: индикатор «Слушаю»,
              кнопка «Продолжить голосом» (после «стоп») или спокойная строка о
              недоступности. */}
          {voiceUnavailable ? (
            <div className="cook-voice-note">Голос недоступен — управляйте кнопками</div>
          ) : voiceMode && voicePaused ? (
            <button type="button" className="cook-voice-resume" onClick={resumeVoice}>
              <Mic size={18} /> Продолжить голосом
            </button>
          ) : voiceMode && listening && !speaking ? (
            <div className="cook-listening" aria-live="polite">
              <Mic size={16} /> Слушаю
            </div>
          ) : (
            <div className="cook-voice-slot-empty" aria-hidden />
          )}

          <div className="cook-step-body">
            <p className="cook-step-text">{cleanSteps[stepIndex]}</p>
          </div>

          <button type="button" className="cook-repeat" onClick={repeat}>
            <RotateCw size={24} />
            <span>Повторить</span>
          </button>

          <div className="cook-nav">
            <button
              type="button"
              className="cook-btn-giant cook-btn-secondary"
              onClick={goPrev}
              disabled={stepIndex === 0}
            >
              <ChevronLeft size={30} />
              Назад
            </button>
            <button type="button" className="cook-btn-giant cook-btn-primary" onClick={goNext}>
              {stepIndex >= total - 1 ? "Готово" : "Дальше"}
              {stepIndex >= total - 1 ? <Check size={30} /> : <ChevronRight size={30} />}
            </button>
          </div>
        </div>
      )}

      {/* --- Финальный экран --- */}
      {view === "finish" && (
        <div className="cook-screen cook-finish">
          <div className="cook-finish-emoji" aria-hidden>🎉</div>
          <h2 className="cook-finish-title">Готово! Приятного аппетита</h2>
          {onCookedPhoto && (
            <button
              type="button"
              className="cook-btn-giant cook-btn-primary"
              onClick={() => {
                stopSpeaking();
                onCookedPhoto();
              }}
            >
              Приготовили? Покажите!
            </button>
          )}
          <button type="button" className="cook-btn-giant cook-btn-secondary cook-finish-back" onClick={doExit}>
            Вернуться к рецепту
          </button>
        </div>
      )}

      {/* --- Выдвижная панель «Состав» --- */}
      {showIngredients && (
        <div className="cook-drawer">
          <div className="cook-drawer-inner">
            <h2 className="cook-drawer-title">Состав</h2>
            {ingredients.length === 0 ? (
              <p className="cook-drawer-empty">Список ингредиентов недоступен.</p>
            ) : (
              <div className="cook-drawer-list">
                {ingredients.map((ing, i) => (
                  <div key={i} className="cook-drawer-row">
                    <span className="cook-drawer-name">{ing.name}</span>
                    {ing.amount ? <span className="cook-drawer-amount">{ing.amount}</span> : null}
                  </div>
                ))}
              </div>
            )}
            <button type="button" className="cook-btn-giant cook-btn-primary" onClick={() => setShowIngredients(false)}>
              Вернуться к шагу
            </button>
          </div>
        </div>
      )}

      {/* --- Подтверждение выхода --- */}
      {confirmExit && (
        <div className="cook-confirm">
          <div className="cook-confirm-box">
            <h2 className="cook-confirm-title">Выйти из готовки?</h2>
            <div className="cook-confirm-actions">
              <button type="button" className="cook-btn-giant cook-btn-primary" onClick={() => setConfirmExit(false)}>
                Остаться
              </button>
              <button type="button" className="cook-btn-giant cook-btn-secondary" onClick={doExit}>
                Выйти
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
