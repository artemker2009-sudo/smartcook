"use client";

import React, { ChangeEvent } from "react";
import { Camera } from "lucide-react";
import Button from "@/components/ui/Button";

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
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: 'var(--space-3)' }}>
      <div className="animate-fade-in" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', width: '100%', maxWidth: '400px', padding: 'var(--space-5) var(--space-4)', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', textAlign: 'center' }}>
        <h2 style={{fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text)', margin: '0 0 var(--space-4) 0'}}>Редактировать профиль</h2>

        <div style={{position: 'relative', width: '100px', height: '100px', margin: '0 auto var(--space-4) auto', cursor: 'pointer'}} onClick={() => document.getElementById('avatar-upload')?.click()}>
          {editAvatarPreview ? (
            <img src={editAvatarPreview} alt="Avatar" style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--color-accent)'}} />
          ) : (
            <div style={{background: 'var(--color-accent)', width: '100%', height: '100%', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '30px', fontWeight: 'var(--font-weight-semibold)'}}>
              {user.user_metadata?.full_name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'U'}
            </div>
          )}
          <div style={{position: 'absolute', bottom: 0, right: 0, background: 'var(--color-text)', color: 'white', padding: 'var(--space-1)', borderRadius: '50%', border: '2px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><Camera size={14} /></div>
          <input id="avatar-upload" type="file" accept="image/*" style={{display: 'none'}} onChange={handleAvatarChange} />
        </div>

        <div style={{textAlign: 'left', marginBottom: 'var(--space-3)'}}>
          <label style={{fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-secondary)', marginLeft: 'var(--space-1)'}}>Имя профиля (Отображается всем)</label>
          <input type="text" value={editProfileName} onChange={(e) => setEditProfileName(e.target.value)} className="chat-input" style={{marginTop: 'var(--space-1)'}} />
        </div>

        <div style={{textAlign: 'left', marginBottom: 'var(--space-4)'}}>
          <label style={{fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-secondary)', marginLeft: 'var(--space-1)'}}>Username (от 4 символов, без @)</label>
          <input type="text" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} className="chat-input" style={{marginTop: 'var(--space-1)'}} />
        </div>

        <div style={{display: 'flex', gap: 'var(--space-2)'}}>
          <Button variant="secondary" onClick={onCancel} style={{flex: 1}}>Отмена</Button>
          <Button variant="primary" onClick={handleProfileSave} disabled={isSavingProfile} style={{flex: 1}}>
            {isSavingProfile ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>
      </div>
    </div>
  );
}
