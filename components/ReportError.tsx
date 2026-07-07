"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, Bug, CheckCircle2, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getDisplayMode } from "@/components/YandexMetrika";

const MESSAGE_MAX = 2000;
const CONTACT_MAX = 200;

// Версия/коммит приложения. На Vercel системная переменная пробрасывается в
// клиент как NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA; локально — "dev".
const APP_VERSION = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7);

type Status = "idle" | "sending" | "success";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  padding: "var(--space-3)",
  fontSize: "var(--font-size-body)",
  color: "var(--color-text)",
  outline: "none",
  boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
  fontFamily: "inherit",
};

export default function ReportError() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && status === "idle") {
      const t = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen, status]);

  const close = () => {
    setIsOpen(false);
    // Небольшая задержка, чтобы не мигало содержимое при закрытии.
    setTimeout(() => {
      setStatus("idle");
      setMessage("");
      setContact("");
      setError(null);
    }, 200);
  };

  const submit = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setError("Опишите, что случилось.");
      return;
    }
    setStatus("sending");
    setError(null);

    // Автоконтекст собираем кодом — пользователь его не вводит.
    const context = {
      message: trimmed,
      contact: contact.trim() || undefined,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      display_mode: getDisplayMode(),
      viewport:
        typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : undefined,
      app_version: APP_VERSION,
      timestamp: new Date().toISOString(),
    };

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch("/api/report-error", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(context),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error || "Не удалось отправить. Попробуйте позже.");
        setStatus("idle");
        return;
      }
      setStatus("success");
    } catch {
      setError("Нет связи с сервером. Попробуйте позже.");
      setStatus("idle");
    }
  };

  const linkStyle: React.CSSProperties = {
    color: "var(--color-text-secondary)",
    fontSize: "var(--font-size-caption)",
    fontWeight: "var(--font-weight-medium)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    fontFamily: "inherit",
  };

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} style={linkStyle}>
        <Bug size={14} /> Сообщить об ошибке
      </button>

      {isOpen ? (
        <div
          onClick={close}
          style={{ position: "fixed", inset: 0, zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", padding: "var(--space-3)" }}
        >
          <div
            className="animate-fade-in"
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--color-bg)", borderRadius: "var(--radius-md)", width: "100%", maxWidth: "440px", padding: "var(--space-5) var(--space-4)", position: "relative", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", textAlign: "left" }}
          >
            <button onClick={close} aria-label="Закрыть" style={{ position: "absolute", top: "var(--space-3)", right: "var(--space-3)", background: "var(--color-bg-subtle)", border: "none", borderRadius: "50%", padding: "var(--space-2)", cursor: "pointer", color: "var(--color-text-secondary)" }}>
              <X size={20} />
            </button>

            {status === "success" ? (
              <div style={{ textAlign: "center", padding: "var(--space-4) 0" }}>
                <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "var(--color-accent-subtle)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto var(--space-3) auto" }}>
                  <CheckCircle2 size={34} color="var(--color-accent)" />
                </div>
                <h2 style={{ fontSize: "var(--font-size-heading)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", margin: "0 0 var(--space-2) 0" }}>Спасибо, посмотрим!</h2>
                <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--font-size-caption)", margin: "0 0 var(--space-4) 0", lineHeight: 1.4 }}>
                  Мы получили ваше сообщение и разберёмся с проблемой.
                </p>
                <button
                  type="button"
                  onClick={close}
                  style={{ background: "var(--color-accent)", color: "white", border: "none", borderRadius: "var(--radius-sm)", padding: "var(--space-3) var(--space-5)", fontSize: "var(--font-size-body)", fontWeight: "var(--font-weight-semibold)", cursor: "pointer" }}
                >
                  Готово
                </button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: "var(--space-4)" }}>
                  <h2 style={{ fontSize: "var(--font-size-heading)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", margin: "0 0 var(--space-1) 0", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <Bug size={20} color="var(--color-accent)" /> Сообщить об ошибке
                  </h2>
                  <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--font-size-caption)", margin: 0, lineHeight: 1.4 }}>
                    Опишите, что пошло не так — мы прикрепим технические детали автоматически.
                  </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  <div>
                    <textarea
                      ref={textareaRef}
                      placeholder="Что случилось?"
                      value={message}
                      onChange={(e) => { setError(null); setMessage(e.target.value.slice(0, MESSAGE_MAX)); }}
                      maxLength={MESSAGE_MAX}
                      rows={5}
                      style={{ ...inputStyle, resize: "vertical", minHeight: "120px" }}
                    />
                    <div style={{ textAlign: "right", fontSize: "var(--font-size-caption)", color: "var(--color-text-muted)", marginTop: "4px" }}>
                      {message.length} / {MESSAGE_MAX}
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder="Как с вами связаться? (необязательно)"
                    value={contact}
                    onChange={(e) => setContact(e.target.value.slice(0, CONTACT_MAX))}
                    maxLength={CONTACT_MAX}
                    style={inputStyle}
                  />

                  {error ? (
                    <div style={{ background: "var(--color-danger-subtle)", color: "var(--color-danger)", borderRadius: "var(--radius-sm)", padding: "var(--space-2) var(--space-3)", fontSize: "var(--font-size-caption)" }}>
                      {error}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={submit}
                    disabled={status === "sending" || !message.trim()}
                    style={{ background: "var(--color-accent)", color: "white", border: "none", borderRadius: "var(--radius-sm)", padding: "var(--space-3)", fontSize: "var(--font-size-body)", fontWeight: "var(--font-weight-semibold)", cursor: status === "sending" || !message.trim() ? "not-allowed" : "pointer", opacity: status === "sending" || !message.trim() ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--space-2)" }}
                  >
                    <Send size={16} /> {status === "sending" ? "Отправляем..." : "Отправить"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
