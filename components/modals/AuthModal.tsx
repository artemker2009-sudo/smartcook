"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, Sparkles, ShieldCheck, Eye, EyeOff, AlertCircle } from "lucide-react";
import Button from "@/components/ui/Button";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  authMode: "login" | "register";
  setAuthMode: (mode: "login" | "register") => void;
  authUsername: string;
  setAuthUsername: (v: string) => void;
  authPassword: string;
  setAuthPassword: (v: string) => void;
  authLoading: boolean;
  authError?: string | null;
  setAuthError?: (v: string | null) => void;
  handleAuth: () => void;
}

// Правила логина держим и в UI, и на submit (page.tsx handleAuth):
// латиница/цифры/подчёркивание, 3–20 символов, регистр нормализуется в нижний.
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;

export function normalizeUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, USERNAME_MAX);
}

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
};

export default function AuthModal({
  isOpen,
  onClose,
  authMode,
  setAuthMode,
  authUsername,
  setAuthUsername,
  authPassword,
  setAuthPassword,
  authLoading,
  authError = null,
  setAuthError = () => {},
  handleAuth,
}: AuthModalProps) {
  const [showPassword, setShowPassword] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  // Фокус на первом поле при открытии.
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => usernameRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const usernameValid = authUsername.length >= USERNAME_MIN && authUsername.length <= USERNAME_MAX;
  const passwordValid = authPassword.length >= PASSWORD_MIN;
  const canSubmit = !authLoading && usernameValid && passwordValid;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canSubmit) {
      e.preventDefault();
      handleAuth();
    }
  };

  const switchMode = () => {
    setAuthError(null);
    setAuthMode(authMode === "register" ? "login" : "register");
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", padding: "var(--space-3)" }}
      onClick={onClose}
    >
      <div
        className="animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--color-bg)", borderRadius: "var(--radius-md)", width: "100%", maxWidth: "400px", padding: "var(--space-5) var(--space-4)", position: "relative", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}
      >
        <button onClick={onClose} aria-label="Закрыть" style={{ position: "absolute", top: "var(--space-3)", right: "var(--space-3)", background: "var(--color-bg-subtle)", border: "none", borderRadius: "50%", padding: "var(--space-2)", cursor: "pointer", color: "var(--color-text-secondary)" }}>
          <X size={20} />
        </button>

        <div style={{ textAlign: "center", marginBottom: "var(--space-4)" }}>
          <h2 style={{ fontSize: "var(--font-size-heading)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", margin: "0 0 var(--space-1) 0" }}>
            {authMode === "register" ? "Создать аккаунт" : "Вход"}
          </h2>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--font-size-caption)", margin: 0, lineHeight: 1.4 }}>
            Нам не нужны ваши личные данные! Никаких почт и телефонов — просто придумайте уникальный логин.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div>
            <input
              ref={usernameRef}
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Логин (латиница, 3–20 символов)"
              value={authUsername}
              onChange={(e) => {
                setAuthError(null);
                setAuthUsername(normalizeUsername(e.target.value));
              }}
              onKeyDown={onKeyDown}
              style={inputStyle}
              maxLength={USERNAME_MAX}
            />
          </div>

          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Пароль (минимум 8 символов)"
              value={authPassword}
              onChange={(e) => {
                setAuthError(null);
                setAuthPassword(e.target.value);
              }}
              onKeyDown={onKeyDown}
              style={{ ...inputStyle, paddingRight: "44px" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              style={{ position: "absolute", top: "50%", right: "8px", transform: "translateY(-50%)", background: "transparent", border: "none", padding: "var(--space-2)", cursor: "pointer", color: "var(--color-text-secondary)", display: "flex" }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {authError ? (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", background: "var(--color-danger-subtle)", color: "var(--color-danger)", borderRadius: "var(--radius-sm)", padding: "var(--space-2) var(--space-3)", fontSize: "var(--font-size-caption)", lineHeight: 1.4 }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "1px" }} />
              <span>{authError}</span>
            </div>
          ) : null}

          <Button variant="primary" onClick={handleAuth} disabled={!canSubmit}>
            {authLoading ? <Sparkles className="animate-spin" size={18} /> : null}
            {authLoading ? "Загрузка..." : authMode === "register" ? "Зарегистрироваться" : "Войти"}
          </Button>
        </div>

        <div style={{ marginTop: "var(--space-4)", textAlign: "center" }}>
          <span
            onClick={switchMode}
            style={{ color: "var(--color-accent)", fontSize: "var(--font-size-caption)", fontWeight: "var(--font-weight-semibold)", cursor: "pointer", textDecoration: "underline" }}
          >
            {authMode === "register" ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Создать"}
          </span>
        </div>

        <div style={{ marginTop: "var(--space-4)", padding: "var(--space-3)", background: "var(--color-surface)", borderRadius: "var(--radius-sm)", boxShadow: "0 2px 6px rgba(0,0,0,0.04)", border: "1px solid var(--color-border)" }}>
          <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5, textAlign: "left", display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
            <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: "2px", color: "var(--color-accent)" }} />
            <span><strong>100% Анонимность.</strong> Вы сами придумываете логин и пароль. Это нужно только для того, чтобы ваши рецепты, фото и прогресс сохранялись в вашем личном кабинете.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
