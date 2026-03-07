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
          background: white; width: 100%; max-width: 500px;
          padding: 25px; border-top-left-radius: 24px; border-top-right-radius: 24px;
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
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>Фильтры для рецепта ⚙️</h3>
            <button onClick={handleClose} style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: '#f1f5f9', border: 'none', borderRadius: '50%', padding: '0', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
          </div>

          <p style={{fontSize: '13px', color: '#64748b', marginBottom: '20px', lineHeight: 1.4}}>
            Если вы авторизованы, эти настройки подтянутся из вашего профиля. Вы также можете настроить их прямо здесь на один раз.
          </p>

          <div style={{marginBottom: '20px'}}>
            <div style={{fontSize: '14px', fontWeight: 800, color: '#be123c', marginBottom: '10px'}}>Аллергии (Строго исключить)</div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px'}}>
              {allergies.map((item, idx) => (
                <span key={idx} style={{background: '#ffe4e6', color: '#be123c', padding: '6px 12px', borderRadius: '100px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px'}}>
                  {item} <X size={14} onClick={() => removeAllergy(idx)} style={{cursor: 'pointer'}}/>
                </span>
              ))}
            </div>
            <div style={{display: 'flex', gap: '8px'}}>
              <input type="text" placeholder="Например: орехи" value={newAllergy} onChange={e => setNewAllergy(e.target.value)} onKeyPress={e => e.key === 'Enter' && addAllergy()} style={{flex: 1, padding: '10px 15px', borderRadius: '12px', border: '1px solid #fecdd3', outline: 'none', fontSize: '14px', boxSizing: 'border-box'}} />
              <button onClick={addAllergy} style={{background: '#be123c', color: 'white', border: 'none', padding: '0 20px', borderRadius: '12px', fontWeight: 700}}><PlusCircle size={20}/></button>
            </div>
            <p style={{fontSize: '12px', color: '#94a3b8', marginTop: '6px', marginBottom: 0}}>После каждого продукта нажмите кнопку <span style={{fontWeight: 700}}>+</span></p>
          </div>

          <div style={{marginBottom: '20px'}}>
            <div style={{fontSize: '14px', fontWeight: 800, color: '#b45309', marginBottom: '10px'}}>Не люблю (По возможности без этого)</div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px'}}>
              {dislikes.map((item, idx) => (
                <span key={idx} style={{background: '#ffedd5', color: '#c2410c', padding: '6px 12px', borderRadius: '100px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px'}}>
                  {item} <X size={14} onClick={() => removeDislike(idx)} style={{cursor: 'pointer'}}/>
                </span>
              ))}
            </div>
            <div style={{display: 'flex', gap: '8px'}}>
              <input type="text" placeholder="Например: лук" value={newDislike} onChange={e => setNewDislike(e.target.value)} onKeyPress={e => e.key === 'Enter' && addDislike()} style={{flex: 1, padding: '10px 15px', borderRadius: '12px', border: '1px solid #fed7aa', outline: 'none', fontSize: '14px', boxSizing: 'border-box'}} />
              <button onClick={addDislike} style={{background: '#ea580c', color: 'white', border: 'none', padding: '0 20px', borderRadius: '12px', fontWeight: 700}}><PlusCircle size={20}/></button>
            </div>
            <p style={{fontSize: '12px', color: '#94a3b8', marginTop: '6px', marginBottom: 0}}>После каждого продукта нажмите кнопку <span style={{fontWeight: 700}}>+</span></p>
          </div>

          <button onClick={handleClose} style={{width: '100%', padding: '15px', borderRadius: '16px', background: '#111', color: 'white', border: 'none', fontWeight: 800, fontSize: '16px'}}>Готово</button>
        </div>
      </div>
    </>
  );
}
