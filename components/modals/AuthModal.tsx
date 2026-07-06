"use client";

import React from "react";
import { X, Sparkles, ShieldCheck } from "lucide-react";
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
  handleAuth: () => void;
}

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
  handleAuth,
}: AuthModalProps) {
  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: 'var(--space-3)' }}>
      <div className="animate-fade-in" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', width: '100%', maxWidth: '400px', padding: 'var(--space-5) var(--space-4)', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
        <button onClick={onClose} style={{position: 'absolute', top: 'var(--space-3)', right: 'var(--space-3)', background: 'var(--color-bg-subtle)', border: 'none', borderRadius: '50%', padding: 'var(--space-2)', cursor: 'pointer', color: 'var(--color-text-secondary)'}}><X size={20} /></button>
        <div style={{textAlign: 'center', marginBottom: 'var(--space-4)'}}>
          <h2 style={{fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text)', margin: '0 0 var(--space-1) 0'}}>
            {authMode === 'register' ? 'Создать аккаунт' : 'Вход'}
          </h2>
          <p style={{color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-caption)', margin: 0, lineHeight: 1.4}}>
            Нам не нужны ваши личные данные! Никаких почт и телефонов — просто придумайте уникальный логин.
          </p>
        </div>

        <div style={{display: 'flex', flexDirection: 'column', gap: 'var(--space-2)'}}>
          <div>
            <input
              type="text"
              placeholder="Username (как в Telegram, от 4 симв.)"
              value={authUsername}
              onChange={(e) => setAuthUsername(e.target.value)}
              className="chat-input"
              style={{marginBottom: 'var(--space-2)'}}
            />
            <input
              type="password"
              placeholder="Пароль (минимум 6 символов)"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              className="chat-input"
              style={{marginBottom: 'var(--space-3)'}}
            />
            <Button
              variant="primary"
              onClick={handleAuth}
              disabled={authLoading || authUsername.length < 4 || authPassword.length < 6}
            >
              {authLoading ? <Sparkles className="animate-spin" size={18} /> : null}
              {authLoading ? "Загрузка..." : authMode === 'register' ? "Зарегистрироваться" : "Войти"}
            </Button>
          </div>
        </div>

        <div style={{marginTop: 'var(--space-4)', textAlign: 'center'}}>
          <span
            onClick={() => setAuthMode(authMode === 'register' ? 'login' : 'register')}
            style={{color: 'var(--color-accent)', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer', textDecoration: 'underline'}}
          >
            {authMode === 'register' ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Создать'}
          </span>
        </div>

        <div style={{marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)'}}>
          <p style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5, textAlign: 'center', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)'}}>
            <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: '2px' }} /> <span><strong>100% Анонимность.</strong> Вы сами придумываете логин и пароль. Это нужно только для того, чтобы ваши рецепты, фото и прогресс в ресторане сохранялись в вашем личном кабинете.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
