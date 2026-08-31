"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { reachGoal } from "@/lib/metrika";
import { parseVoiceTranscript } from "@/lib/voiceParse";

// Минимальные типы Web Speech API — в стандартном lib.dom их нет для webkit-
// префикса, а править расходы/логику нельзя. Описываем ровно то, что используем,
// чтобы обойтись без any (его запрещает eslint проекта).
interface SpeechAlternative {
  readonly transcript: string;
}
interface SpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechAlternative;
}
interface SpeechResultList {
  readonly length: number;
  readonly [index: number]: SpeechResult;
}
interface SpeechEvent {
  readonly resultIndex: number;
  readonly results: SpeechResultList;
}
interface SpeechErrorEvent {
  readonly error: string;
}
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export type VoiceStatus = "idle" | "listening" | "denied" | "error";

export type VoiceInput = {
  supported: boolean;
  status: VoiceStatus;
  chips: string[];
  /** Текущая нераспознанная до конца фраза — только для показа «слышу…». */
  interim: string;
  start: () => void;
  stop: () => void;
  removeChip: (index: number) => void;
  reset: () => void;
};

/**
 * Голосовой ввод продуктов через браузерный Web Speech API. Никакого сервера/
 * OpenAI — распознавание целиком на устройстве браузером. Если API нет —
 * supported=false, и вызывающий просто не рисует кнопку (мягкая деградация).
 *
 * Распознанные продукты копятся ЧИПАМИ (chips), а не летят сразу в список —
 * пользователь может убрать ошибочный до подтверждения. Убранный чип не
 * возвращается, даже если распознавание снова его услышит (removedRef).
 *
 * Позиция создаётся ТОЛЬКО из финального результата распознавания, целой фразой.
 * Промежуточные (interim) результаты нестабильны: «мала» превращается в «молоко»
 * через полсекунды. Раньше чипы строились из final+interim и только дописывались,
 * поэтому недораспознанный кусок залипал отдельной позицией — отсюда и было
 * дробление одной фразы на несколько продуктов. Теперь interim показывается
 * отдельной строкой «слышу…», а чипы каждый раз пересобираются из финальных
 * сегментов (finalsRef), то есть самоисправляются.
 */
export function useVoiceInput(): VoiceInput {
  // Ленивый инициализатор: читает window один раз при первом рендере на клиенте.
  // На сервере (SSR) getRecognitionCtor() возвращает null без обращения к window,
  // поэтому гидрационного рассинхрона нет — эффект тут не нужен.
  const [supported] = useState(() => getRecognitionCtor() !== null);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [chips, setChips] = useState<string[]>([]);
  const [interim, setInterim] = useState("");

  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  // Финальные и промежуточные куски храним ПО ИНДЕКСУ результата: одно и то же
  // событие может прийти повторно, присваивание по индексу идемпотентно.
  const finalsRef = useRef<string[]>([]);
  const interimRef = useRef<string[]>([]);
  const removedRef = useRef<Set<string>>(new Set()); // убранные пользователем чипы

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      // уже остановлено — не важно
    }
  }, []);

  const reset = useCallback(() => {
    try {
      recRef.current?.abort();
    } catch {
      // ignore
    }
    recRef.current = null;
    finalsRef.current = [];
    interimRef.current = [];
    removedRef.current = new Set();
    setChips([]);
    setInterim("");
    setStatus("idle");
  }, []);

  const start = useCallback(() => {
    // Повторный тап во время записи — стоп.
    if (status === "listening") {
      stop();
      return;
    }

    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = "ru-RU";
    rec.continuous = true;
    rec.interimResults = true;

    finalsRef.current = [];
    interimRef.current = [];
    removedRef.current = new Set();

    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalsRef.current[i] = transcript;
          interimRef.current[i] = "";
        } else {
          interimRef.current[i] = transcript;
        }
      }

      // Чипы пересобираем целиком из финальных сегментов: каждый сегмент — это
      // одна фраза между паузами, значит одна позиция (или несколько, если
      // человек сказал «молоко и хлеб»).
      const next: string[] = [];
      const seen = new Set<string>();
      for (const segment of finalsRef.current) {
        if (!segment) continue;
        for (const name of parseVoiceTranscript(segment)) {
          const low = name.toLowerCase();
          if (seen.has(low)) continue;
          if (removedRef.current.has(low)) continue; // не возвращаем убранное
          seen.add(low);
          next.push(name);
        }
      }
      setChips(next);
      setInterim(interimRef.current.filter(Boolean).join(" ").replace(/\s+/g, " ").trim());
    };

    rec.onerror = (event) => {
      // Отказ в доступе к микрофону — спокойная подсказка, не «ошибка».
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setStatus("denied");
      } else if (event.error === "no-speech" || event.error === "aborted") {
        // тишина / штатная остановка — не считаем ошибкой
      } else {
        setStatus("error");
      }
    };

    rec.onend = () => {
      // Распознавание закончилось (стоп или тишина). Чипы остаются для проверки,
      // недоговорённый interim показывать уже незачем.
      interimRef.current = [];
      setInterim("");
      setStatus((prev) => (prev === "denied" || prev === "error" ? prev : "idle"));
    };

    recRef.current = rec;
    try {
      rec.start();
      setStatus("listening");
      setChips([]);
      setInterim("");
      reachGoal("shopping_voice_start");
    } catch {
      setStatus("error");
    }
  }, [status, stop]);

  const removeChip = useCallback((index: number) => {
    setChips((prev) => {
      const target = prev[index];
      if (target) removedRef.current.add(target.toLowerCase());
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // Останавливаем распознавание при размонтировании.
  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        // ignore
      }
    };
  }, []);

  return { supported, status, chips, interim, start, stop, removeChip, reset };
}
