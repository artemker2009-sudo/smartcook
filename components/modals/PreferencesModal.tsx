"use client";

import React, { useState, useEffect } from "react";
import { X, PlusCircle } from "lucide-react";

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
            <h3 style={{ margin: 0, fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text)' }}>Фильтры для рецепта ⚙️</h3>
            <button onClick={handleClose} style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'var(--color-bg-subtle)', border: 'none', borderRadius: '50%', padding: '0', cursor: 'pointer', color: 'var(--color-text-secondary)' }}><X size={20} /></button>
          </div>

          <p style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.4}}>
            Если вы авторизованы, эти настройки подтянутся из вашего профиля. Вы также можете настроить их прямо здесь на один раз.
          </p>

          <div style={{marginBottom: 'var(--space-4)'}}>
            <div style={{fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-danger)', marginBottom: 'var(--space-2)'}}>Аллергии (Строго исключить)</div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-2)'}}>
              {allergies.map((item, idx) => (
                <span key={idx} style={{background: 'var(--color-danger-subtle)', color: 'var(--color-danger)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-medium)', display: 'flex', alignItems: 'center', gap: '5px'}}>
                  {item} <X size={14} onClick={() => removeAllergy(idx)} style={{cursor: 'pointer'}}/>
                </span>
              ))}
            </div>
            <div style={{display: 'flex', gap: 'var(--space-2)'}}>
              <input type="text" placeholder="Например: орехи" value={newAllergy} onChange={e => setNewAllergy(e.target.value)} onKeyPress={e => e.key === 'Enter' && addAllergy()} style={{flex: 1, padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', outline: 'none', fontSize: 'var(--font-size-caption)', boxSizing: 'border-box'}} />
              <button onClick={addAllergy} style={{background: 'var(--color-danger)', color: 'white', border: 'none', padding: '0 var(--space-4)', borderRadius: 'var(--radius-sm)', fontWeight: 'var(--font-weight-semibold)'}}><PlusCircle size={20}/></button>
            </div>
            <p style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)', marginBottom: 0}}>После каждого продукта нажмите кнопку <span style={{fontWeight: 'var(--font-weight-semibold)'}}>+</span></p>
          </div>

          <div style={{marginBottom: 'var(--space-4)'}}>
            <div style={{fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-warning)', marginBottom: 'var(--space-2)'}}>Не люблю (По возможности без этого)</div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-2)'}}>
              {dislikes.map((item, idx) => (
                <span key={idx} style={{background: 'var(--color-warning-subtle)', color: 'var(--color-warning)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-medium)', display: 'flex', alignItems: 'center', gap: '5px'}}>
                  {item} <X size={14} onClick={() => removeDislike(idx)} style={{cursor: 'pointer'}}/>
                </span>
              ))}
            </div>
            <div style={{display: 'flex', gap: 'var(--space-2)'}}>
              <input type="text" placeholder="Например: лук" value={newDislike} onChange={e => setNewDislike(e.target.value)} onKeyPress={e => e.key === 'Enter' && addDislike()} style={{flex: 1, padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', outline: 'none', fontSize: 'var(--font-size-caption)', boxSizing: 'border-box'}} />
              <button onClick={addDislike} style={{background: 'var(--color-warning)', color: 'white', border: 'none', padding: '0 var(--space-4)', borderRadius: 'var(--radius-sm)', fontWeight: 'var(--font-weight-semibold)'}}><PlusCircle size={20}/></button>
            </div>
            <p style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)', marginBottom: 0}}>После каждого продукта нажмите кнопку <span style={{fontWeight: 'var(--font-weight-semibold)'}}>+</span></p>
          </div>

          <button onClick={handleClose} className="btn-primary">Готово</button>
        </div>
      </div>
    </>
  );
}
