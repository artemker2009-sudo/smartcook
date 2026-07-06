"use client";

import React from "react";
import { X, Send, Sparkles, Heart, Trash2, CornerDownRight, Code2 } from "lucide-react";
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
      <div key={c.id} style={{ background: isReply ? 'var(--color-bg)' : 'var(--color-surface)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', marginBottom: isReply ? 'var(--space-2)' : '0', marginLeft: isReply ? '25px' : '0', position: 'relative' }}>
        {isReply && <div style={{position: 'absolute', left: '-15px', top: '20px', width: '15px', height: '2px', background: 'var(--color-border)'}} />}
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
          {c.user_avatar ? (
            <img src={c.user_avatar} alt="Avatar" style={{width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover'}} />
          ) : (
            <div style={{width: '28px', height: '28px', borderRadius: '50%', background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-semibold)', flexShrink: 0}}>
              {c.user_name?.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-1)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text)' }}>{c.user_name}</span>
                  {restBadge}
                </div>
                {isDev && <span style={{fontSize: '10px', background: 'var(--color-text)', color: 'white', padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)', fontWeight: 'var(--font-weight-semibold)', display: 'inline-flex', alignItems: 'center', gap: '4px'}}><Code2 size={10} /> Разработчик</span>}
              </div>
              {user && user.id === c.user_id && (
                <button onClick={() => handleDeleteComment(c.id)} style={{ background: 'transparent', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '2px' }}><Trash2 size={14} /></button>
              )}
            </div>
            <div style={{ fontSize: 'var(--font-size-body)', color: 'var(--color-text-secondary)', lineHeight: 1.4, marginBottom: 'var(--space-2)', wordBreak: 'break-word' }}>{c.text}</div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', justifyContent: 'flex-end', marginTop: 'var(--space-1)' }}>
              {!isReply && (
                <div onClick={() => setReplyingTo({id: c.id, name: c.user_name})} style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 'var(--font-weight-medium)' }}>
                  <CornerDownRight size={14} /> Ответить
                </div>
              )}
              <div onClick={() => handleCommentLike(c)} style={{ fontSize: 'var(--font-size-caption)', color: c.is_liked ? '#dc2626' : 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 'var(--font-weight-medium)' }}>
                <Heart size={14} fill={c.is_liked ? "#dc2626" : "none"} /> {c.likes_count || 0}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div className="animate-fade-in" style={{ background: 'var(--color-bg)', width: '100%', maxWidth: '500px', height: '85dvh', paddingBottom: 'env(safe-area-inset-bottom, 15px)', borderTopLeftRadius: 'var(--radius-md)', borderTopRightRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', boxShadow: '0 -10px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-surface)', borderTopLeftRadius: 'var(--radius-md)', borderTopRightRadius: 'var(--radius-md)' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text)' }}>Комментарии</h3>
          <button onClick={onClose} style={{ minWidth: '32px', minHeight: '32px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'var(--color-bg-subtle)', border: 'none', borderRadius: '50%', padding: '0', cursor: 'pointer', color: 'var(--color-text-secondary)' }}><X size={20} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {isLoadingComments ? (
            <div style={{ textAlign: 'center', color: 'var(--color-accent)', marginTop: 'var(--space-5)', fontWeight: 'var(--font-weight-medium)' }}><Sparkles className="animate-spin" style={{display: 'inline', marginRight: 'var(--space-2)'}} size={18} /> Загрузка комментариев...</div>
          ) : postComments.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginTop: 'var(--space-5)' }}>Пока нет комментариев. Будьте первым!</div>
          ) : (
            postComments.filter(c => !c.parent_id).map((c) => (
              <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {renderCommentUI(c)}
                {postComments.filter(reply => reply.parent_id === c.id).map(reply => renderCommentUI(reply, true))}
              </div>
            ))
          )}
        </div>

        <div style={{ padding: 'var(--space-3)', background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {replyingTo && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-bg-subtle)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)' }}>
              <span>Ответ пользователю: {replyingTo.name}</span>
              <button onClick={() => setReplyingTo(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={14} /></button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end', width: '100%' }}>
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
              className="chat-input"
              style={{ flex: 1, width: '100%', resize: 'none', overflowY: 'auto', height: '44px', minHeight: '44px', maxHeight: '120px', lineHeight: '18px', fontFamily: 'inherit' }}
              onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
            />
            <button onClick={submitComment} disabled={!newCommentText.trim()} style={{ background: newCommentText.trim() ? 'var(--color-accent)' : 'var(--color-border)', color: 'white', border: 'none', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: newCommentText.trim() ? 'pointer' : 'default', transition: 'all 0.2s', flexShrink: 0 }}>
              <Send size={18} style={{marginLeft: '-2px'}}/>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
