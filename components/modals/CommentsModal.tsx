"use client";

import React from "react";
import { X, Send, Sparkles, Heart, Trash2, CornerDownRight } from "lucide-react";
import type { DBComment } from "@/lib/types";

interface CommentsModalProps {
  commentsModalPostId: number | null;
  onClose: () => void;
  isLoadingComments: boolean;
  postComments: DBComment[];
  newCommentText: string;
  setNewCommentText: (v: string) => void;
  replyingTo: { id: number; name: string } | null;
  setReplyingTo: (v: { id: number; name: string } | null) => void;
  submitComment: () => void;
  handleDeleteComment: (id: number) => void;
  handleCommentLike: (comment: DBComment) => void;
  user: any;
  userLevels: Record<string, number>;
  getUserBadges: (uid: string | undefined | null, level?: number) => any;
}

export default function CommentsModal({
  commentsModalPostId,
  onClose,
  isLoadingComments,
  postComments,
  newCommentText,
  setNewCommentText,
  replyingTo,
  setReplyingTo,
  submitComment,
  handleDeleteComment,
  handleCommentLike,
  user,
  userLevels,
  getUserBadges,
}: CommentsModalProps) {
  if (!commentsModalPostId) return null;

  const renderCommentUI = (c: DBComment, isReply: boolean = false) => {
    const { isDev, restBadge } = getUserBadges(c.user_id, userLevels[c.user_id]);
    return (
      <div key={c.id} style={{ background: isReply ? '#f8fafc' : 'white', padding: '12px 15px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: isReply ? '10px' : '0', marginLeft: isReply ? '25px' : '0', position: 'relative' }}>
        {isReply && <div style={{position: 'absolute', left: '-15px', top: '20px', width: '15px', height: '2px', background: '#cbd5e1'}} />}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          {c.user_avatar ? (
            <img src={c.user_avatar} alt="Avatar" style={{width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover'}} />
          ) : (
            <div style={{width: '28px', height: '28px', borderRadius: '50%', background: '#e2e8f0', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, flexShrink: 0}}>
              {c.user_name?.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#111' }}>{c.user_name}</span>
                  {restBadge}
                </div>
                {isDev && <span style={{fontSize: '10px', background: '#111', color: '#38bdf8', padding: '2px 8px', borderRadius: '100px', fontWeight: 800}}>👨‍💻 Разработчик</span>}
              </div>
              {user && user.id === c.user_id && (
                <button onClick={() => handleDeleteComment(c.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}><Trash2 size={14} /></button>
              )}
            </div>
            <div style={{ fontSize: '14px', color: '#374151', lineHeight: 1.4, marginBottom: '8px', wordBreak: 'break-word' }}>{c.text}</div>

            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', justifyContent: 'flex-end', marginTop: '5px' }}>
              {!isReply && (
                <div onClick={() => setReplyingTo({id: c.id, name: c.user_name})} style={{ fontSize: '12px', color: '#0ea5e9', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 600 }}>
                  <CornerDownRight size={14} /> Ответить
                </div>
              )}
              <div onClick={() => handleCommentLike(c)} style={{ fontSize: '12px', color: c.is_liked ? '#ef4444' : '#64748b', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 600 }}>
                <Heart size={14} fill={c.is_liked ? "#ef4444" : "none"} /> {c.likes_count || 0}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div className="animate-fade-in" style={{ background: '#f8fafc', width: '100%', maxWidth: '500px', height: '85dvh', paddingBottom: 'env(safe-area-inset-bottom, 15px)', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', display: 'flex', flexDirection: 'column', boxShadow: '0 -10px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '15px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', borderTopLeftRadius: '24px', borderTopRightRadius: '24px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Комментарии</h3>
          <button onClick={onClose} style={{ minWidth: '32px', minHeight: '32px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: '#f1f5f9', border: 'none', borderRadius: '50%', padding: '0', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {isLoadingComments ? (
            <div style={{ textAlign: 'center', color: '#0ea5e9', marginTop: '40px', fontWeight: 600 }}><Sparkles className="animate-spin" style={{display: 'inline', marginRight: '8px'}} size={18} /> Загрузка комментариев...</div>
          ) : postComments.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '40px' }}>Пока нет комментариев. Будьте первым!</div>
          ) : (
            postComments.filter(c => !c.parent_id).map((c) => (
              <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {renderCommentUI(c)}
                {postComments.filter(reply => reply.parent_id === c.id).map(reply => renderCommentUI(reply, true))}
              </div>
            ))
          )}
        </div>

        <div style={{ padding: '15px', background: 'white', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {replyingTo && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f1f5f9', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', color: '#475569', fontWeight: 600 }}>
              <span>Ответ пользователю: {replyingTo.name}</span>
              <button onClick={() => setReplyingTo(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={14} /></button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', width: '100%' }}>
            <textarea
              placeholder="Написать комментарий..."
              value={newCommentText}
              onChange={(e) => {
                setNewCommentText(e.target.value);
                e.target.style.height = '44px';
                e.target.style.height = (e.target.scrollHeight < 120 ? e.target.scrollHeight : 120) + 'px';
              }}
              onFocus={(e) => setTimeout(() => e.target.scrollIntoView({behavior: 'smooth', block: 'center'}), 300)}
              rows={1}
              style={{ flex: 1, width: '100%', padding: '12px 16px', borderRadius: '24px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none', background: '#f8fafc', resize: 'none', overflowY: 'auto', height: '44px', minHeight: '44px', maxHeight: '120px', boxSizing: 'border-box', lineHeight: '18px', fontFamily: 'inherit' }}
              onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
            />
            <button onClick={submitComment} disabled={!newCommentText.trim()} style={{ background: newCommentText.trim() ? '#0ea5e9' : '#e0f2fe', color: 'white', border: 'none', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: newCommentText.trim() ? 'pointer' : 'default', transition: 'all 0.2s', flexShrink: 0 }}>
              <Send size={18} style={{marginLeft: '-2px'}}/>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
