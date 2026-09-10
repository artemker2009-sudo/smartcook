"use client";

import { useEffect, useRef, useState } from "react";
import { X, Send, Check } from "lucide-react";
import { reachGoal } from "@/lib/metrika";
import { useInstallEnv } from "@/lib/installEnv";
import { DONATE_URL } from "@/lib/constants";

// Шторка «Что добавить, а что убрать». Общая для карточки на Главной и для
// пункта в личном кабинете — оба места монтируют этот компонент и управляют
// только флагом open.

const TEXT_MAX = 500;

type Kind = "add" | "remove" | "bug";

const CHIPS: { id: Kind; label: string }[] = [
  { id: "add", label: "Добавить" },
  { id: "remove", label: "Убрать" },
  { id: "bug", label: "Не работает" },
];

// Подсказка в поле меняется вместе с чипом: пустое поле «расскажите» человек
// заполняет заметно охотнее, когда видит, чего именно от него ждут.
const PLACEHOLDER: Record<Kind, string> = {
  add: "Например: сохранять рецепты в свои подборки…",
  remove: "Например: лишний шаг при поиске по фото…",
  bug: "Например: не открывается список покупок на телефоне…",
};

interface SuggestSheetProps {
  open: boolean;
  onClose: () => void;
}

export default function SuggestSheet({ open, onClose }: SuggestSheetProps) {
  const [kind, setKind] = useState<Kind>("add");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Донат прячем ровно по тому же правилу, что и сама кнопка «Поддержать»
  // (App Store 3.1.1): нативный iOS и ещё не определённая среда.
  const env = useInstallEnv();
  const showDonate = env !== "native-ios" && env !== "unknown";

  useEffect(() => {
    if (!open) return;

    // Сбрасываем состояние на каждом открытии: шторка не должна показывать
    // прошлый текст или прошлый экран «Спасибо».
    setKind("add");
    setText("");
    setError(null);
    setSent(false);
    setSending(false);
    reachGoal("suggest_open");

    // Гостевую cookie выдаёт сервер и только в момент реального действия
    // (lib/guestSession.ts). Открытие шторки — и есть это действие: дёргаем
    // роут заранее, чтобы к моменту отправки личность уже была, а сам POST мог
    // оставаться строгим и отвечать 401 на запрос без сессии.
    void fetch("/api/suggestions/session", { method: "GET", credentials: "same-origin" }).catch(
      () => {},
    );

    // Фокус в поле — но только на широком экране: на телефоне автофокус
    // выбрасывает клавиатуру поверх шторки раньше, чем человек прочитал чипы.
    if (typeof window !== "undefined" && window.innerWidth >= 640) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [open]);

  // Esc закрывает — шторка перекрывает страницу целиком.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        // session_id/user_id намеренно НЕ шлём: владельца сервер берёт из
        // сессии, а присланное поле игнорирует.
        body: JSON.stringify({ kind, text: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error || "Не получилось отправить. Попробуйте позже.");
        return;
      }
      reachGoal("suggest_sent", { kind });
      setSent(true);
    } catch {
      setError("Нет связи. Проверьте интернет и попробуйте ещё раз.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="sl-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Предложить идею"
    >
      <div className="sl-sheet suggest-sheet" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="suggest-close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          <X size={20} />
        </button>

        {sent ? (
          // Экран благодарности. Отдельным состоянием, а не тостом: обещание
          // «прочитаю сегодня» должно быть видно, пока человек сам не закроет.
          <div className="suggest-done">
            <div className="suggest-done-icon" aria-hidden>
              <Check size={26} />
            </div>
            <h2 className="suggest-title">Спасибо! Прочитаю сегодня.</h2>
            {showDonate && (
              <p className="suggest-done-donate">
                Если SmartCook помогает — можно{" "}
                <a
                  href={DONATE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => reachGoal("donate_click")}
                >
                  поддержать ☕
                </a>
              </p>
            )}
            <button type="button" className="sl-sheet-cancel" onClick={onClose}>
              Закрыть
            </button>
          </div>
        ) : (
          <>
            <h2 className="suggest-title">Что добавить, а что убрать?</h2>
            <p className="suggest-sub">Расскажите — я читаю каждое сообщение.</p>

            <div className="suggest-chips" role="group" aria-label="О чём предложение">
              {CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={`suggest-chip${kind === chip.id ? " suggest-chip-on" : ""}`}
                  aria-pressed={kind === chip.id}
                  onClick={() => setKind(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <textarea
              ref={textareaRef}
              className="suggest-textarea"
              value={text}
              // maxLength режет ввод в самом поле — до сервера длинный текст
              // просто не доедет, а счётчик ниже никогда не покажет перебор.
              maxLength={TEXT_MAX}
              rows={5}
              placeholder={PLACEHOLDER[kind]}
              onChange={(e) => setText(e.target.value)}
              aria-label="Текст предложения"
            />

            <div className="suggest-meta">
              <span
                className={`suggest-counter${text.length >= TEXT_MAX ? " suggest-counter-full" : ""}`}
              >
                {text.length} / {TEXT_MAX}
              </span>
            </div>

            {error && (
              <p className="suggest-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              className="btn-primary suggest-send"
              onClick={handleSend}
              disabled={!canSend}
            >
              <Send size={16} />
              {sending ? "Отправляю…" : "Отправить"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
