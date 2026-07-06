"use client";

import React, { useState, useEffect } from "react";
import { X, Plus, SlidersHorizontal, Ban, ThumbsDown } from "lucide-react";

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  allergies: string[];
  dislikes: string[];
  newAllergy: string;
  setNewAllergy: (v: string) => void;
  newDislike: string;
  setNewDislike: (v: string) => void;
  addAllergy: () => void;
  addDislike: () => void;
  removeAllergy: (idx: number) => void;
  removeDislike: (idx: number) => void;
  isLoggedIn?: boolean;
  onLogin?: () => void;
}

export default function PreferencesModal({
  isOpen,
  onClose,
  allergies,
  dislikes,
  newAllergy,
  setNewAllergy,
  newDislike,
  setNewDislike,
  addAllergy,
  addDislike,
  removeAllergy,
  removeDislike,
  isLoggedIn,
  onLogin,
}: PreferencesModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!mounted) return null;

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 350);
  };

  return (
    <>
      <style>{`
        @keyframes prefs-overlay-in { from { opacity: 0; } to { opacity: 1; } }
        .prefs-overlay {
          position: fixed; inset: 0; z-index: 10000;
          display: flex; align-items: flex-end; justify-content: center;
          background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
          transition: opacity 0.35s ease;
        }
        .prefs-sheet {
          background: var(--color-surface); width: 100%; max-width: 500px;
          padding: var(--space-4); border-top-left-radius: var(--radius-md); border-top-right-radius: var(--radius-md);
          position: relative; box-shadow: 0 -10px 40px rgba(0,0,0,0.2);
          transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
          will-change: transform;
        }
      `}</style>

      <div
        className="prefs-overlay"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      >
        <div
          className="prefs-sheet"
          style={{ transform: visible ? 'translateY(0)' : 'translateY(100%)' }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)'}}>
            <h3 style={{ margin: 0, fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><SlidersHorizontal size={20} /> Фильтры для рецепта</h3>
            <button onClick={handleClose} style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'var(--color-bg-subtle)', border: 'none', borderRadius: '50%', padding: '0', cursor: 'pointer', color: 'var(--color-text-secondary)' }}><X size={20} /></button>
          </div>

          <p style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.4}}>
            Если вы авторизованы, эти настройки подтянутся из вашего профиля. Вы также можете настроить их прямо здесь на один раз.
          </p>

          <div style={{marginBottom: 'var(--space-4)'}}>
            <div style={{fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)'}}>
              <Ban size={17} color="var(--color-danger)" /> Аллергии <span style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-muted)', fontWeight: 'var(--font-weight-regular)'}}>— строго исключить</span>
            </div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-2)'}}>
              {allergies.map((item, idx) => (
                <span key={idx} style={{background: 'var(--color-surface)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-medium)', display: 'flex', alignItems: 'center', gap: '5px'}}>
                  {item} <X size={14} onClick={() => removeAllergy(idx)} style={{cursor: 'pointer'}}/>
                </span>
              ))}
            </div>
            <div style={{display: 'flex', gap: 'var(--space-2)'}}>
              <input type="text" placeholder="Например: орехи" value={newAllergy} onChange={e => setNewAllergy(e.target.value)} onKeyPress={e => e.key === 'Enter' && addAllergy()} style={{flex: 1, padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', outline: 'none', fontSize: 'var(--font-size-caption)', boxSizing: 'border-box'}} />
              <button onClick={addAllergy} aria-label="Добавить аллерген" style={{background: 'var(--color-bg-subtle)', color: 'var(--color-accent)', border: '1px solid var(--color-border)', padding: '0 var(--space-4)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center'}}><Plus size={20}/></button>
            </div>
          </div>

          <div style={{marginBottom: 'var(--space-4)'}}>
            <div style={{fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)'}}>
              <ThumbsDown size={17} color="var(--color-warning)" /> Не люблю <span style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-muted)', fontWeight: 'var(--font-weight-regular)'}}>— по возможности без этого</span>
            </div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-2)'}}>
              {dislikes.map((item, idx) => (
                <span key={idx} style={{background: 'var(--color-warning-subtle)', color: 'var(--color-warning)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-medium)', display: 'flex', alignItems: 'center', gap: '5px'}}>
                  {item} <X size={14} onClick={() => removeDislike(idx)} style={{cursor: 'pointer'}}/>
                </span>
              ))}
            </div>
            <div style={{display: 'flex', gap: 'var(--space-2)'}}>
              <input type="text" placeholder="Например: лук" value={newDislike} onChange={e => setNewDislike(e.target.value)} onKeyPress={e => e.key === 'Enter' && addDislike()} style={{flex: 1, padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', outline: 'none', fontSize: 'var(--font-size-caption)', boxSizing: 'border-box'}} />
              <button onClick={addDislike} aria-label="Добавить продукт" style={{background: 'var(--color-bg-subtle)', color: 'var(--color-accent)', border: '1px solid var(--color-border)', padding: '0 var(--space-4)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center'}}><Plus size={20}/></button>
            </div>
          </div>

          {!isLoggedIn && (
            <div style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', textAlign: 'center', marginBottom: 'var(--space-3)', lineHeight: 1.5 }}>
              Вкусы сохранены на этом устройстве.{' '}
              <button type="button" onClick={onLogin} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-accent-hover)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer', fontSize: 'var(--font-size-caption)', textDecoration: 'underline' }}>
                Войдите, чтобы сохранить навсегда
              </button>
            </div>
          )}

          <button onClick={handleClose} className="btn-primary">Готово</button>
        </div>
      </div>
    </>
  );
}
