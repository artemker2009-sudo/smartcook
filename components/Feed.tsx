import React, { useState } from 'react';
import { PlusCircle, Camera, Trash2, Heart, MessageCircle, ArrowRight, Sparkles } from 'lucide-react';

export default function Feed(props: any) {
  const {
    photosFeed, photosSort, fetchPhotosFeed, user, userLevels,
    handleDeletePost, setFullScreenImage, handlePhotoLike, openComments,
    loadSharedRecipe, isStandaloneUploadOpen, setIsStandaloneUploadOpen,
    userPhotoPreview, standaloneTitle, setStandaloneTitle, userComment,
    setUserComment, setUserPhotoFile, setUserPhotoPreview, submitFeedPost,
    isUploadingPhoto, handleUserPhotoChange, getUserBadges
  } = props;

  const [openingCommentsId, setOpeningCommentsId] = useState<number | null>(null);

  const handleOpenCommentsClick = async (postId: number) => {
    setOpeningCommentsId(postId);
    await openComments(postId);
    setOpeningCommentsId(null);
  };

  return (
    <div style={{marginTop: 'var(--space-5)', paddingBottom: 'var(--space-5)'}}>
      <div style={{textAlign: 'center', marginBottom: 'var(--space-4)'}}>
        <h1 style={{fontSize: 'var(--font-size-title)', fontWeight: 'var(--font-weight-semibold)', margin: '0 0 var(--space-2) 0', color: 'var(--color-text)'}}> Лента 📸 </h1>
        <p style={{color: 'var(--color-text-secondary)', margin: 0}}>Вдохновляйтесь кулинарными шедеврами</p>
      </div>

      <div style={{background: 'var(--color-accent-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', boxShadow: '0 4px 15px rgba(5, 150, 105, 0.15)'}}>
        <div style={{background: 'white', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: '50%', marginBottom: 'var(--space-2)', color: 'var(--color-accent)'}}><PlusCircle size={28} /></div>
        <h3 style={{margin: '0 0 var(--space-1) 0', fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-accent-hover)'}}>Приготовили по своему рецепту?</h3>
        <p style={{margin: '0 0 var(--space-3) 0', fontSize: 'var(--font-size-caption)', color: 'var(--color-accent-hover)', lineHeight: 1.4}}>Поделитесь кулинарным шедевром со всем сообществом, даже если не использовали ИИ!</p>
        <button onClick={() => { setIsStandaloneUploadOpen(true); document.getElementById('standalone-photo-upload')?.click(); }} style={{background: 'var(--color-accent)', color: 'white', border: 'none', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-sm)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', cursor: 'pointer', boxShadow: '0 4px 10px rgba(5, 150, 105, 0.3)'}}>Выложить своё блюдо</button>
        <input id="standalone-photo-upload" type="file" accept="image/*" style={{display: 'none'}} onChange={handleUserPhotoChange} />
      </div>

      {isStandaloneUploadOpen && userPhotoPreview && (
        <div className="card animate-fade-in" style={{border: '2px solid var(--color-accent)', marginBottom: 'var(--space-4)'}}>
          <h3 style={{marginTop: 0, marginBottom: 'var(--space-3)', color: 'var(--color-text)'}}>Публикация своего блюда</h3>
          <img src={userPhotoPreview} alt="Preview" style={{width: '100%', height: '200px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)'}} />

          <textarea
            placeholder="Название блюда (Обязательно)"
            value={standaloneTitle}
            onChange={(e) => {
              setStandaloneTitle(e.target.value);
              e.target.style.height = '44px';
              e.target.style.height = (e.target.scrollHeight) + 'px';
            }}
            rows={1}
            className="chat-input"
            style={{fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-2)', resize: 'none', overflow: 'hidden', minHeight: '44px', lineHeight: '18px', fontFamily: 'inherit'}}
          />

          <textarea
            placeholder="Описание / Рецепт от вас"
            value={userComment}
            onChange={(e) => {
              setUserComment(e.target.value);
              e.target.style.height = '44px';
              e.target.style.height = (e.target.scrollHeight) + 'px';
            }}
            rows={1}
            className="chat-input"
            style={{marginBottom: 'var(--space-3)', resize: 'none', overflow: 'hidden', minHeight: '44px', lineHeight: '18px', fontFamily: 'inherit'}}
          />

          <div style={{display: 'flex', gap: 'var(--space-2)'}}>
            <button onClick={() => {setUserPhotoFile(null); setUserPhotoPreview(null); setStandaloneTitle(""); setUserComment(""); setIsStandaloneUploadOpen(false);}} style={{flex: 1, padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-subtle)', border: 'none', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer'}}>Отмена</button>
            <button onClick={() => submitFeedPost(null)} disabled={isUploadingPhoto} style={{flex: 2, padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-accent)', border: 'none', color: 'white', fontWeight: 'var(--font-weight-semibold)', cursor: isUploadingPhoto ? 'default' : 'pointer'}}>
              {isUploadingPhoto ? "Загрузка..." : "Отправить в ленту"}
            </button>
          </div>
        </div>
      )}

      <div style={{fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)'}}>Сортировка:</div>
      <div style={{display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', overflowX: 'auto', paddingBottom: 'var(--space-1)'}}>
         <button onClick={() => fetchPhotosFeed('new')} style={{ padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', border: 'none', whiteSpace: 'nowrap', background: photosSort === 'new' ? 'var(--color-text)' : 'var(--color-bg-subtle)', color: photosSort === 'new' ? 'white' : 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', transition: 'all 0.2s', cursor: 'pointer' }}>✨ Свежее</button>
         <button onClick={() => fetchPhotosFeed('top')} style={{ padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', border: 'none', whiteSpace: 'nowrap', background: photosSort === 'top' ? 'var(--color-text)' : 'var(--color-bg-subtle)', color: photosSort === 'top' ? 'white' : 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', transition: 'all 0.2s', cursor: 'pointer' }}>🔥 Популярное</button>
         <button onClick={() => fetchPhotosFeed('old')} style={{ padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', border: 'none', whiteSpace: 'nowrap', background: photosSort === 'old' ? 'var(--color-text)' : 'var(--color-bg-subtle)', color: photosSort === 'old' ? 'white' : 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', transition: 'all 0.2s', cursor: 'pointer' }}>🕰 Раннее</button>
      </div>

      <div style={{display: 'flex', flexDirection: 'column', gap: 'var(--space-4)'}}>
        {photosFeed?.map((post: any) => {
          const { isDev, devBadge, restBadge } = getUserBadges(post.user_id, userLevels[post.user_id]);

          return (
            <div key={post.id} id={`feed-post-${post.id}`} className="card" style={{padding: '0', overflow: 'hidden', border: '1px solid var(--color-border)'}}>
              <div style={{padding: 'var(--space-3)', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', background: 'var(--color-surface)'}}>
                 {post.user_avatar ? (
                    <img src={post.user_avatar} alt="Avatar" style={{width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover'}} />
                 ) : (
                    <div style={{width: '36px', height: '36px', borderRadius: '50%', background: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)', flexShrink: 0}}>
                      {post.user_name?.charAt(0).toUpperCase() || 'Ш'}
                    </div>
                 )}
                 <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', alignItems: 'flex-start'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: 'var(--space-1)', flexWrap: 'wrap'}}>
                      <span style={{fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)', color: 'var(--color-text)'}}>
                        {post.user_name || 'Анонимный шеф'}
                      </span>
                      {isDev ? devBadge : restBadge}
                    </div>
                    {isDev && <div>{restBadge}</div>}

                    {post.recipe_id ? (
                      <div style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginTop: '2px'}}>
                        Приготовил(а): <span style={{color: 'var(--color-accent)', fontWeight: 'var(--font-weight-medium)', cursor: 'pointer'}} onClick={() => loadSharedRecipe(post.recipe_id, 'photos')}>{post.recipes?.title || 'Рецепт'}</span>
                      </div>
                    ) : (
                      <div style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-accent)', fontWeight: 'var(--font-weight-semibold)', marginTop: '2px'}}>По своему рецепту: {post.custom_title}</div>
                    )}
                 </div>
                 {user && user.id === post.user_id && (
                    <button onClick={() => handleDeletePost(post.id)} style={{ background: 'transparent', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: 0 }}><Trash2 size={18} /></button>
                 )}
              </div>

              <img src={post.photo_url} alt="Блюдо" onClick={() => setFullScreenImage(post.photo_url)} style={{width: '100%', maxHeight: '400px', objectFit: 'cover', display: 'block', background: 'var(--color-bg-subtle)', cursor: 'zoom-in'}} />

              <div style={{padding: 'var(--space-3)', background: 'var(--color-surface)'}}>
                {post.comment && ( <p style={{margin: '0 0 var(--space-3) 0', fontSize: 'var(--font-size-body)', color: 'var(--color-text-secondary)', lineHeight: 1.5, wordBreak: 'break-word'}}> <strong>Описание:</strong> {post.comment} </p> )}
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <div style={{display: 'flex', gap: 'var(--space-2)'}}>
                    <button onClick={(e) => handlePhotoLike(e, post)} style={{background: post.is_liked ? 'var(--color-danger-subtle)' : 'var(--color-bg-subtle)', border: 'none', borderRadius: 'var(--radius-full)', padding: 'var(--space-2) var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)', color: post.is_liked ? '#dc2626' : 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', transition: 'all 0.2s', cursor: 'pointer'}}>
                      <Heart size={18} fill={post.is_liked ? "#dc2626" : "none"} /> {post.likes_count || 0}
                    </button>
                    <button onClick={() => handleOpenCommentsClick(post.id)} disabled={openingCommentsId === post.id} style={{background: 'var(--color-bg-subtle)', border: 'none', borderRadius: 'var(--radius-full)', padding: 'var(--space-2) var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', cursor: openingCommentsId === post.id ? 'default' : 'pointer'}}>
                      {openingCommentsId === post.id ? (
                        <><Sparkles className="animate-spin" size={18} /> Загрузка...</>
                      ) : (
                        <><MessageCircle size={18} /> {post.comments_count || 0}</>
                      )}
                    </button>
                  </div>
                  <div>
                    {post.recipe_id && (
                      <button onClick={() => loadSharedRecipe(post.recipe_id, 'photos')} style={{background: 'transparent', border: 'none', color: 'var(--color-accent)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)', cursor: 'pointer', padding: 0}}>
                         К рецепту <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {photosFeed.length === 0 && <div style={{textAlign: 'center', padding: 'var(--space-4)', color: 'var(--color-text-muted)'}}>Здесь пока нет фотографий. Поделитесь своим шедевром первым! 📸</div>}
      </div>
    </div>
  );
}
