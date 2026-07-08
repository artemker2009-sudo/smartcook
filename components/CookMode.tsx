"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, RotateCw, ListChecks, Check } from "lucide-react";
import { reachGoal } from "@/lib/metrika";

// Режим «Готовим вместе» (задача Z). Проектирование под целевого пользователя —
// женщина 60+, готовит, очки сняты, руки в муке:
//   • Один экран = одно действие. Инвентарь экрана шага СТРОГО ограничен:
//     номер шага, текст шага, 2 гигантские кнопки Назад/Дальше, «Повторить»,
//     компактный «Состав», выход. Больше ничего не добавляем.
//   • Каждая кнопка подписана словом, не только иконкой.
//   • Случайный тап не выбрасывает: выход — только явный ✕ с подтверждением.
//   • Текст шага очень крупный, высокий контраст, щедрый интерлиньяж.
// Озвучка — Web Speech API (автоозвучка при переходе, rate ~0.9). Голосовые
// команды и Wake Lock — прогрессивное улучшение: если API нет (iOS Safari без
// распознавания) — просто кнопки, без плашек «недоступно».

export type CookIngredient = { name: string; amount?: string };

const INTRO_SEEN_KEY = "sc_cook_intro_seen";

// «Разблокировка» озвучки для iOS: самый первый speak() обязан идти из
// пользовательского жеста, иначе на iOS дальнейшая озвучка (в т.ч. из эффектов)
// не работает или ведёт себя странно. Вызывать СИНХРОННО в onClick кнопки
// «Готовим!» — тогда автоозвучка первого шага у вернувшегося пользователя
// (подсказка уже показана ранее) тоже звучит.
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

type View = "intro" | "step" | "finish";

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
  // ВАЖНО (баг зацикливания): steps приходят новым массивом на каждый рендер;
  // без useMemo cleanSteps менял идентичность каждый рендер, и эффекты
  // автоозвучки/распознавания перезапускались бесконечно → голос повторял
  // один шаг много раз. Стабилизируем по ссылке на steps.
  const cleanSteps = useMemo(
    () => (steps || []).map((s) => (s || "").trim()).filter(Boolean),
    [steps],
  );
  const total = cleanSteps.length;

  const [view, setView] = useState<View>("intro");
  const [stepIndex, setStepIndex] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  const wakeLockRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const voiceUsedRef = useRef(false);
  const finishedGoalRef = useRef(false);
  // Ключ последнего озвученного экрана — гарантия «ровно один раз на шаг».
  const spokenKeyRef = useRef<string>("");

  // --- Озвучка (speechSynthesis) ---
  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ru-RU";
      u.rate = 0.9; // чуть медленнее дефолта — диктуем, а не тараторим
      const ruVoice = window.speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith("ru"));
      if (ruVoice) u.voice = ruVoice;
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

  // Последние версии команд в ref — чтобы эффект распознавания не пересоздавался
  // на каждом рендере (иначе постоянный рестарт recognition — часть петли).
  const commandsRef = useRef({ goNext, goPrev, repeat, stopSpeaking });
  commandsRef.current = { goNext, goPrev, repeat, stopSpeaking };

  // Автоозвучка ровно ОДИН раз при входе на шаг. Ключ view+index в ref не даёт
  // повторно озвучить тот же экран при перерисовках (это и было зацикливанием).
  // Любой speak() внутри сначала делает cancel() текущей очереди. Авторетраев нет.
  useEffect(() => {
    if (view !== "step") return;
    const key = `step:${stepIndex}`;
    if (spokenKeyRef.current === key) return;
    spokenKeyRef.current = key;
    if (cleanSteps[stepIndex]) speak(cleanSteps[stepIndex]);
  }, [view, stepIndex, cleanSteps, speak]);

  // Финальный экран: озвучиваем поздравление + цель (тоже ровно один раз).
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
        /* Wake Lock мог быть отклонён — не критично, продолжаем */
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

  // --- Голосовые команды (SpeechRecognition) — прогрессивное улучшение ---
  // На iOS Safari конструктор распознавания ЕСТЬ, но он: (1) запускает
  // системный запрос микрофона прямо посреди готовки — модалка перекрывала
  // экран, из-за чего «ни одна кнопка не работала»; (2) конфликтует с
  // озвучкой — микрофон слышит собственный TTS и трактует его как команду
  // (эхо-петля). Поэтому на iOS слой НАМЕРЕННО отсутствует (без ошибок и
  // визуальных следов — как и ожидал директор). На остальных платформах
  // держим, но защищаемся: игнорируем распознанное, пока говорит озвучка, и
  // НЕ перезапускаем распознавание после ошибки (без штормов рестарта).
  // Эффект зависит только от view (команды читаются из commandsRef) — иначе он
  // пересоздавал recognition на каждом рендере (тоже часть петли).
  useEffect(() => {
    if (view !== "step") return;
    if (typeof window === "undefined") return;

    const ua = navigator.userAgent || "";
    const isIOS =
      /ip(hone|ad|od)/i.test(ua) ||
      (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);
    if (isIOS) return;

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    let stopped = false;
    let broken = false;
    const rec = new SR();
    rec.lang = "ru-RU";
    rec.continuous = true;
    rec.interimResults = false;
    recognitionRef.current = rec;

    const markVoiceUsed = () => {
      if (!voiceUsedRef.current) {
        voiceUsedRef.current = true;
        reachGoal("cook_mode_voice_used");
      }
    };

    rec.onresult = (event: any) => {
      // Пока звучит озвучка — микрофон слышит ЕЁ, а не пользователя. Игнорируем,
      // чтобы TTS не воспринимался как команда (это и давало эхо-цикл).
      if (window.speechSynthesis?.speaking) return;
      const last = event.results[event.results.length - 1];
      const phrase = (last?.[0]?.transcript || "").toLowerCase();
      const cmd = commandsRef.current;
      // «готов» убрано из «дальше»: TTS слов «готово/готовить» ложно листал шаги.
      if (/дальш|вперёд|вперед|следующ/.test(phrase)) {
        markVoiceUsed();
        cmd.goNext();
      } else if (/назад|предыдущ|вернись/.test(phrase)) {
        markVoiceUsed();
        cmd.goPrev();
      } else if (/повтор|ещё раз|еще раз|прочитай/.test(phrase)) {
        markVoiceUsed();
        cmd.repeat();
      } else if (/стоп|хватит|замолч|тихо/.test(phrase)) {
        markVoiceUsed();
        cmd.stopSpeaking();
      }
    };
    rec.onerror = () => {
      broken = true; // после ошибки НЕ перезапускаем (без шторма рестартов)
    };
    rec.onend = () => {
      if (!stopped && !broken) {
        try {
          rec.start();
        } catch {
          /* ignore повторный старт */
        }
      }
    };
    try {
      rec.start();
    } catch {
      /* ignore */
    }

    return () => {
      stopped = true;
      try {
        rec.onend = null;
        rec.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    };
  }, [view]);

  // Чистим озвучку при размонтировании.
  useEffect(() => stopSpeaking, [stopSpeaking]);

  const dismissIntro = () => {
    try {
      localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    // Первая озвучка — СИНХРОННО в обработчике тапа (жест): iOS требует, чтобы
    // самый первый speak() шёл из пользовательского жеста, иначе очередь ведёт
    // себя странно. Помечаем ключ, чтобы эффект не озвучил шаг повторно.
    spokenKeyRef.current = `step:${stepIndex}`;
    setView("step");
    if (cleanSteps[stepIndex]) speak(cleanSteps[stepIndex]);
  };

  // Первый вход — показываем подсказку один раз (localStorage).
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(INTRO_SEEN_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (seen) setView("step");
  }, []);

  const requestExit = () => {
    stopSpeaking();
    setConfirmExit(true);
  };
  const doExit = () => {
    stopSpeaking();
    onClose();
  };

  if (total === 0) {
    // Нет шагов — нечего вести. Мягко закрываемся.
    return null;
  }

  return (
    <div className="cook-mode" role="dialog" aria-modal="true" aria-label="Режим готовки">
      {/* --- Подсказка первого входа --- */}
      {view === "intro" && (
        <div className="cook-screen cook-intro">
          <div className="cook-intro-emoji" aria-hidden>🍳</div>
          <h2 className="cook-intro-title">{title}</h2>
          <p className="cook-intro-text">
            Я буду читать рецепт вслух. Жмите «Дальше», когда будете готовы к
            следующему шагу.
          </p>
          <button type="button" className="cook-btn-giant cook-btn-primary" onClick={dismissIntro}>
            Понятно, начинаем
          </button>
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
