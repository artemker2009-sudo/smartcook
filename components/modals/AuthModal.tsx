"use client";

import React from "react";
import { X, Sparkles } from "lucide-react";

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
    <div style={{ position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: '20px' }}>
      <div className="animate-fade-in" style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '400px', padding: '30px 25px', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
        <button onClick={onClose} style={{position: 'absolute', top: '15px', right: '15px', background: '#f3f4f6', border: 'none', borderRadius: '50%', padding: '6px', cursor: 'pointer', color: '#6b7280'}}><X size={20} /></button>
        <div style={{textAlign: 'center', marginBottom: '25px'}}>
          <h2 style={{fontSize: '24px', fontWeight: 900, color: '#111', margin: '0 0 5px 0'}}>
            {authMode === 'register' ? 'Создать аккаунт' : 'Вход'}
          </h2>
          <p style={{color: '#6b7280', fontSize: '13px', margin: 0, lineHeight: 1.4}}>
            Нам не нужны ваши личные данные! Никаких почт и телефонов — просто придумайте уникальный логин.
          </p>
        </div>

        <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
          <div>
            <input
              type="text"
              placeholder="Username (как в Telegram, от 4 симв.)"
              value={authUsername}
              onChange={(e) => setAuthUsername(e.target.value)}
              style={{width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #d1d5db', fontSize: '15px', marginBottom: '10px', outline: 'none', boxSizing: 'border-box'}}
            />
            <input
              type="password"
              placeholder="Пароль (минимум 6 символов)"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              style={{width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #d1d5db', fontSize: '15px', marginBottom: '15px', outline: 'none', boxSizing: 'border-box'}}
            />
            <button
              onClick={handleAuth}
              disabled={authLoading || authUsername.length < 4 || authPassword.length < 6}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '14px', borderRadius: '12px', background: (authUsername.length >= 4 && authPassword.length >= 6) ? '#059669' : '#d1fae5', color: (authUsername.length >= 4 && authPassword.length >= 6) ? 'white' : '#047857', border: 'none', fontSize: '15px', fontWeight: 700, cursor: (authUsername.length >= 4 && authPassword.length >= 6) ? 'pointer' : 'default', transition: 'all 0.2s' }}
            >
              {authLoading ? <Sparkles className="animate-spin" size={18} /> : null}
              {authLoading ? "Загрузка..." : authMode === 'register' ? "Зарегистрироваться" : "Войти"}
            </button>
          </div>
        </div>

        <div style={{marginTop: '20px', textAlign: 'center'}}>
          <span
            onClick={() => setAuthMode(authMode === 'register' ? 'login' : 'register')}
            style={{color: '#0ea5e9', fontSize: '14px', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline'}}
          >
            {authMode === 'register' ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Создать'}
          </span>
        </div>

        <div style={{marginTop: '25px', padding: '15px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0'}}>
          <p style={{fontSize: '11px', color: '#64748b', margin: 0, lineHeight: 1.5, textAlign: 'center'}}>
            🛡 <strong>100% Анонимность.</strong> Вы сами придумываете логин и пароль. Это нужно только для того, чтобы ваши рецепты, фото и прогресс в ресторане сохранялись в вашем личном кабинете.
          </p>
        </div>
      </div>
    </div>
  );
}
