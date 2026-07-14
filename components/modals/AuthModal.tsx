"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, Sparkles, ShieldCheck, Eye, EyeOff, AlertCircle, KeyRound, Copy, Check, LifeBuoy } from "lucide-react";
import Button from "@/components/ui/Button";

export type AuthMode = "login" | "register" | "forgot";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  authName: string;
  setAuthName: (v: string) => void;
  authUsername: string;
  setAuthUsername: (v: string) => void;
  authPassword: string;
  setAuthPassword: (v: string) => void;
  authRecoveryCode: string;
  setAuthRecoveryCode: (v: string) => void;
  // Telegram нужен только для заявки админу: код восстановления присылают туда лично.
  authTelegram: string;
  setAuthTelegram: (v: string) => void;
  authLoading: boolean;
  authError?: string | null;
  setAuthError?: (v: string | null) => void;
  handleAuth: () => void;
  handleRecover: () => void;
  handleSupportRequest: () => void;
  supportSent: boolean;
  // Код восстановления показываем ровно один раз — после регистрации или
  // после успешной смены пароля. В базе лежит только хеш, повторить нельзя.
  recoveryCodeToShow: string | null;
  onRecoveryAcknowledged: () => void;
}

// Правила логина держим и в UI, и на submit (SearchApp handleAuth), и на
// сервере (app/api/auth/*): латиница/цифры/подчёркивание, 3–20 символов,
// регистр нормализуется в нижний.
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const NAME_MIN = 1;
export const NAME_MAX = 40;
export const TELEGRAM_MAX = 100;

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

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--font-size-caption)",
  fontWeight: "var(--font-weight-semibold)",
  color: "var(--color-text)",
  marginBottom: "var(--space-1)",
};

const hintStyle: React.CSSProperties = {
  margin: "var(--space-1) 0 0 0",
  fontSize: "var(--font-size-caption)",
  color: "var(--color-text-secondary)",
  lineHeight: 1.4,
};

export default function AuthModal({
  isOpen,
  onClose,
  authMode,
  setAuthMode,
  authName,
  setAuthName,
  authUsername,
  setAuthUsername,
  authPassword,
  setAuthPassword,
  authRecoveryCode,
  setAuthRecoveryCode,
  authTelegram,
  setAuthTelegram,
  authLoading,
  authError = null,
  setAuthError = () => {},
  handleAuth,
  handleRecover,
  handleSupportRequest,
  supportSent,
  recoveryCodeToShow,
  onRecoveryAcknowledged,
}: AuthModalProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Фокус на первом поле при открытии/смене режима.
  useEffect(() => {
    if (isOpen && !recoveryCodeToShow) {
      const t = setTimeout(() => firstFieldRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen, authMode, recoveryCodeToShow]);

  if (!isOpen) return null;

  const nameValid = authName.trim().length >= NAME_MIN;
  const usernameValid = authUsername.length >= USERNAME_MIN && authUsername.length <= USERNAME_MAX;
  const passwordValid = authPassword.length >= PASSWORD_MIN;
  const codeValid = authRecoveryCode.trim().length > 0;
  // Заявка админу требует и логин, и Telegram — иначе некуда прислать код.
  const supportReady = usernameValid && authTelegram.trim().length >= 2;

  const canSubmit =
    !authLoading &&
    (authMode === "register"
      ? nameValid && usernameValid && passwordValid
      : authMode === "login"
        ? usernameValid && passwordValid
        : usernameValid && codeValid && passwordValid);

  const submit = () => {
    if (!canSubmit) return;
    if (authMode === "forgot") handleRecover();
    else handleAuth();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  const goToMode = (mode: AuthMode) => {
    setAuthError(null);
    setAuthMode(mode);
  };

  const copyCode = async () => {
    if (!recoveryCodeToShow) return;
    try {
      await navigator.clipboard.writeText(recoveryCodeToShow);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер обмена недоступен (нет https / отказ) — код всё равно виден на экране.
    }
  };

  const title =
    authMode === "register" ? "Создать аккаунт" : authMode === "login" ? "Вход" : "Восстановление пароля";

  const subtitle =
    authMode === "forgot"
      ? "Введите логин и код восстановления, который вы сохранили при регистрации. Мы зададим новый пароль."
      : "Нам не нужны ваши личные данные! Никаких почт и телефонов — просто имя, логин и пароль.";

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", padding: "var(--space-3)" }}
      onClick={recoveryCodeToShow ? undefined : onClose}
    >
      <div
        className="animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--color-bg)", borderRadius: "var(--radius-md)", width: "100%", maxWidth: "400px", maxHeight: "90vh", overflowY: "auto", padding: "var(--space-5) var(--space-4)", position: "relative", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}
      >
        {recoveryCodeToShow ? (
          /* ── Экран «сохраните код восстановления» ─────────────────────────
             Показывается один раз после регистрации/смены пароля. Закрыть
             можно только осознанной кнопкой — крестика и клика по фону нет,
             чтобы код не потерялся случайным тапом. */
          <div>
            <div style={{ textAlign: "center", marginBottom: "var(--space-4)" }}>
              <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: "50%", background: "var(--color-surface)", border: "1px solid var(--color-border)", marginBottom: "var(--space-3)" }}>
                <KeyRound size={26} style={{ color: "var(--color-accent)" }} />
              </div>
              <h2 style={{ fontSize: "var(--font-size-heading)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", margin: "0 0 var(--space-1) 0" }}>
                Сохраните код восстановления
              </h2>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--font-size-caption)", margin: 0, lineHeight: 1.5 }}>
                Мы не спрашиваем почту, поэтому восстановить пароль можно <strong>только этим кодом</strong>. Запишите его или сделайте скриншот — показываем его один раз.
              </p>
            </div>

            <div style={{ background: "var(--color-surface)", border: "1px dashed var(--color-accent)", borderRadius: "var(--radius-sm)", padding: "var(--space-4)", textAlign: "center", marginBottom: "var(--space-3)" }}>
              <div style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "2px", color: "var(--color-text)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", wordBreak: "break-all" }}>
                {recoveryCodeToShow}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <Button variant="secondary" onClick={copyCode}>
                {copied ? <Check size={18} /> : <Copy size={18} />}
                {copied ? "Скопировано" : "Скопировать код"}
              </Button>
              <Button variant="primary" onClick={onRecoveryAcknowledged}>
                Я сохранил код — продолжить
              </Button>
            </div>

            <p style={{ ...hintStyle, marginTop: "var(--space-3)", textAlign: "center" }}>
              Потеряете и пароль, и код — сможете написать нам, и мы сбросим пароль вручную.
            </p>
          </div>
        ) : (
          /* ── Обычные экраны: регистрация / вход / восстановление ───────── */
          <>
            <button onClick={onClose} aria-label="Закрыть" style={{ position: "absolute", top: "var(--space-3)", right: "var(--space-3)", background: "var(--color-bg-subtle)", border: "none", borderRadius: "50%", padding: "var(--space-2)", cursor: "pointer", color: "var(--color-text-secondary)" }}>
              <X size={20} />
            </button>

            <div style={{ textAlign: "center", marginBottom: "var(--space-4)" }}>
              <h2 style={{ fontSize: "var(--font-size-heading)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", margin: "0 0 var(--space-1) 0" }}>
                {title}
              </h2>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--font-size-caption)", margin: 0, lineHeight: 1.4 }}>
                {subtitle}
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {authMode === "register" ? (
                <div>
                  <label style={labelStyle} htmlFor="auth-name">Имя</label>
                  <input
                    id="auth-name"
                    ref={firstFieldRef}
                    type="text"
                    placeholder="Например: Артём"
                    value={authName}
                    onChange={(e) => {
                      setAuthError(null);
                      setAuthName(e.target.value.slice(0, NAME_MAX));
                    }}
                    onKeyDown={onKeyDown}
                    style={inputStyle}
                    maxLength={NAME_MAX}
                  />
                  <p style={hintStyle}>Так вас будут видеть другие: под фото, в ленте и на банкетах. Можно менять в профиле.</p>
                </div>
              ) : null}

              <div>
                <label style={labelStyle} htmlFor="auth-username">Логин</label>
                <input
                  id="auth-username"
                  ref={authMode === "register" ? undefined : firstFieldRef}
                  type="text"
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="например: artem_chef"
                  value={authUsername}
                  onChange={(e) => {
                    setAuthError(null);
                    setAuthUsername(normalizeUsername(e.target.value));
                  }}
                  onKeyDown={onKeyDown}
                  style={inputStyle}
                  maxLength={USERNAME_MAX}
                />
                {/* При ВХОДЕ правила длины ни к чему — человек логин уже придумал.
                    Здесь важно другое: поле само приводит ввод к нижнему регистру, и
                    без объяснения это выглядит как поломка («жму CapsLock, а буква
                    всё равно маленькая — значит, войти не смогу»). Реальный баг-репорт
                    от пользователя был ровно про это. */}
                {authMode === "login" ? (
                  <p style={hintStyle}>
                    <strong>Регистр не важен.</strong> Логины всегда маленькими буквами — если наберёте с заглавной, мы приведём к маленьким сами. Вход это не сломает.
                  </p>
                ) : (
                  <p style={hintStyle}>
                    Это ваш логин для входа — он <strong>не виден другим</strong>. Только английские буквы <strong>маленькими</strong>, цифры и «_», от {USERNAME_MIN} до {USERNAME_MAX} символов. Русские буквы, пробелы и заглавные не подойдут — мы их уберём автоматически.
                  </p>
                )}
              </div>

              {authMode === "forgot" ? (
                <div>
                  <label style={labelStyle} htmlFor="auth-code">Код восстановления</label>
                  <input
                    id="auth-code"
                    type="text"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="CHEF-XXXX-XXXX"
                    value={authRecoveryCode}
                    onChange={(e) => {
                      setAuthError(null);
                      setAuthRecoveryCode(e.target.value.toUpperCase().slice(0, 20));
                    }}
                    onKeyDown={onKeyDown}
                    style={{ ...inputStyle, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: "1px" }}
                  />
                  <p style={hintStyle}>Тот самый код, который мы показали при регистрации.</p>
                </div>
              ) : null}

              <div>
                <label style={labelStyle} htmlFor="auth-password">
                  {authMode === "forgot" ? "Новый пароль" : "Пароль"}
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    placeholder={`Минимум ${PASSWORD_MIN} символов`}
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
              </div>

              {authError ? (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", background: "var(--color-danger-subtle)", color: "var(--color-danger)", borderRadius: "var(--radius-sm)", padding: "var(--space-2) var(--space-3)", fontSize: "var(--font-size-caption)", lineHeight: 1.4 }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "1px" }} />
                  <span>{authError}</span>
                </div>
              ) : null}

              <Button variant="primary" onClick={submit} disabled={!canSubmit}>
                {authLoading ? <Sparkles className="animate-spin" size={18} /> : null}
                {authLoading
                  ? "Загрузка..."
                  : authMode === "register"
                    ? "Зарегистрироваться"
                    : authMode === "login"
                      ? "Войти"
                      : "Сменить пароль"}
              </Button>
            </div>

            {authMode === "forgot" ? (
              <div style={{ marginTop: "var(--space-4)", padding: "var(--space-3)", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)" }}>
                <p style={{ ...hintStyle, marginTop: 0, display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
                  <LifeBuoy size={16} style={{ flexShrink: 0, marginTop: "2px", color: "var(--color-accent)" }} />
                  <span>
                    <strong>Не помните код?</strong> Оставьте заявку — мы пришлём вам новый код восстановления в Telegram, и вы сами зададите новый пароль. Пароль мы не видим и не придумываем за вас.
                  </span>
                </p>
                {supportSent ? (
                  <p style={{ ...hintStyle, color: "var(--color-accent)", fontWeight: "var(--font-weight-semibold)" }}>
                    Заявка отправлена. Мы пришлём вам новый код восстановления в Telegram — вернитесь сюда и введите его, чтобы задать новый пароль.
                  </p>
                ) : (
                  <>
                    <input
                      type="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="Ваш Telegram, например @artem"
                      value={authTelegram}
                      onChange={(e) => {
                        setAuthError(null);
                        setAuthTelegram(e.target.value.slice(0, TELEGRAM_MAX));
                      }}
                      style={{ ...inputStyle, marginTop: "var(--space-2)" }}
                      maxLength={TELEGRAM_MAX}
                    />
                    <p style={hintStyle}>Заполните логин выше и ваш Telegram — код пришлём туда лично.</p>
                    <button
                      type="button"
                      onClick={handleSupportRequest}
                      disabled={!supportReady || authLoading}
                      style={{ marginTop: "var(--space-2)", background: "transparent", border: "none", padding: 0, color: supportReady ? "var(--color-accent)" : "var(--color-text-secondary)", fontSize: "var(--font-size-caption)", fontWeight: "var(--font-weight-semibold)", cursor: supportReady ? "pointer" : "not-allowed", textDecoration: "underline" }}
                    >
                      Отправить заявку
                    </button>
                  </>
                )}
              </div>
            ) : null}

            <div style={{ marginTop: "var(--space-4)", textAlign: "center", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {authMode === "register" ? (
                <span onClick={() => goToMode("login")} style={{ color: "var(--color-accent)", fontSize: "var(--font-size-caption)", fontWeight: "var(--font-weight-semibold)", cursor: "pointer", textDecoration: "underline" }}>
                  Уже есть аккаунт? Войти
                </span>
              ) : null}

              {authMode === "login" ? (
                <>
                  <span onClick={() => goToMode("register")} style={{ color: "var(--color-accent)", fontSize: "var(--font-size-caption)", fontWeight: "var(--font-weight-semibold)", cursor: "pointer", textDecoration: "underline" }}>
                    Нет аккаунта? Создать
                  </span>
                  <span onClick={() => goToMode("forgot")} style={{ color: "var(--color-text-secondary)", fontSize: "var(--font-size-caption)", cursor: "pointer", textDecoration: "underline" }}>
                    Забыли пароль?
                  </span>
                </>
              ) : null}

              {authMode === "forgot" ? (
                <span onClick={() => goToMode("login")} style={{ color: "var(--color-accent)", fontSize: "var(--font-size-caption)", fontWeight: "var(--font-weight-semibold)", cursor: "pointer", textDecoration: "underline" }}>
                  Вспомнили пароль? Войти
                </span>
              ) : null}
            </div>

            {authMode !== "forgot" ? (
              <div style={{ marginTop: "var(--space-4)", padding: "var(--space-3)", background: "var(--color-surface)", borderRadius: "var(--radius-sm)", boxShadow: "0 2px 6px rgba(0,0,0,0.04)", border: "1px solid var(--color-border)" }}>
                <p style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5, textAlign: "left", display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
                  <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: "2px", color: "var(--color-accent)" }} />
                  <span><strong>100% Анонимность.</strong> Вы сами придумываете логин и пароль. Это нужно только для того, чтобы ваши рецепты, фото и прогресс сохранялись в вашем личном кабинете.</span>
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
