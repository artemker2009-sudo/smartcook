"use client";

import React, { ChangeEvent } from "react";
import { Camera } from "lucide-react";

interface EditProfileModalProps {
  isOpen: boolean;
  user: any;
  editAvatarPreview: string | null;
  editProfileName: string;
  setEditProfileName: (v: string) => void;
  editUsername: string;
  setEditUsername: (v: string) => void;
  handleAvatarChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleProfileSave: () => void;
  isSavingProfile: boolean;
  onCancel: () => void;
}

export default function EditProfileModal({
  isOpen,
  user,
  editAvatarPreview,
  editProfileName,
  setEditProfileName,
  editUsername,
  setEditUsername,
  handleAvatarChange,
  handleProfileSave,
  isSavingProfile,
  onCancel,
}: EditProfileModalProps) {
  if (!isOpen || !user) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: '20px' }}>
      <div className="animate-fade-in" style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '400px', padding: '30px 25px', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', textAlign: 'center' }}>
        <h2 style={{fontSize: '20px', fontWeight: 900, color: '#111', margin: '0 0 20px 0'}}>Редактировать профиль</h2>

        <div style={{position: 'relative', width: '100px', height: '100px', margin: '0 auto 20px auto', cursor: 'pointer'}} onClick={() => document.getElementById('avatar-upload')?.click()}>
          {editAvatarPreview ? (
            <img src={editAvatarPreview} alt="Avatar" style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '3px solid #059669'}} />
          ) : (
            <div style={{background: '#059669', width: '100%', height: '100%', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '30px', fontWeight: 800}}>
              {user.user_metadata?.full_name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'U'}
            </div>
          )}
          <div style={{position: 'absolute', bottom: 0, right: 0, background: '#111', color: 'white', padding: '6px', borderRadius: '50%', border: '2px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><Camera size={14} /></div>
          <input id="avatar-upload" type="file" accept="image/*" style={{display: 'none'}} onChange={handleAvatarChange} />
        </div>

        <div style={{textAlign: 'left', marginBottom: '15px'}}>
          <label style={{fontSize: '12px', fontWeight: 700, color: '#64748b', marginLeft: '5px'}}>Имя профиля (Отображается всем)</label>
          <input type="text" value={editProfileName} onChange={(e) => setEditProfileName(e.target.value)} style={{width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #d1d5db', fontSize: '15px', marginTop: '5px', outline: 'none', boxSizing: 'border-box'}} />
        </div>

        <div style={{textAlign: 'left', marginBottom: '20px'}}>
          <label style={{fontSize: '12px', fontWeight: 700, color: '#64748b', marginLeft: '5px'}}>Username (от 4 символов, без @)</label>
          <input type="text" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} style={{width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #d1d5db', fontSize: '15px', marginTop: '5px', outline: 'none', boxSizing: 'border-box'}} />
        </div>

        <div style={{display: 'flex', gap: '10px'}}>
          <button onClick={onCancel} style={{flex: 1, padding: '12px', borderRadius: '12px', background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 700, cursor: 'pointer'}}>Отмена</button>
          <button onClick={handleProfileSave} disabled={isSavingProfile} style={{flex: 1, padding: '12px', borderRadius: '12px', background: '#059669', border: 'none', color: 'white', fontWeight: 700, cursor: isSavingProfile ? 'default' : 'pointer'}}>
            {isSavingProfile ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
