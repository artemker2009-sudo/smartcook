import React, { useState } from 'react';
import { PlusCircle, Camera, Trash2, Heart, MessageCircle, ArrowRight, Sparkles } from 'lucide-react';

export default function Feed(props: any) {
  const {
    photosFeed, photosSort, fetchPhotosFeed, user, userLevels,
    handleDeletePost, setFullScreenImage, handlePhotoLike, openComments,
    loadSharedRecipe, isStandaloneUploadOpen, setIsStandaloneUploadOpen,
    userPhotoPreview, standaloneTitle, setStandaloneTitle, userComment,
    setUserComment, setUserPhotoFile, setUserPhotoPreview, submitFeedPost,
    isUploadingPhoto, handleUserPhotoChange, renderUserBadge
  } = props;

  // Локальный стейт для индикации открытия комментов
  const [openingCommentsId, setOpeningCommentsId] = useState<number | null>(null);

  const handleOpenCommentsClick = async (postId: number) => {
    setOpeningCommentsId(postId);
    await openComments(postId);
    setOpeningCommentsId(null);
  };

  return (
    <div style={{marginTop: '60px', paddingBottom: '80px'}}> 
      <div style={{textAlign: 'center', marginBottom: '25px'}}> 
        <h1 style={{fontSize: '28px', fontWeight: '900', margin: '0 0 10px 0'}}> Лента 📸 </h1> 
        <p style={{color: '#6b7280', margin: 0}}>Вдохновляйтесь кулинарными шедеврами</p> 
      </div> 

      <div style={{background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)', borderRadius: '20px', padding: '20px', marginBottom: '25px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', boxShadow: '0 4px 15px rgba(14, 165, 233, 0.2)'}}> 
        <div style={{background: 'white', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: '50%', marginBottom: '10px', color: '#0ea5e9'}}><PlusCircle size={28} /></div> 
        <h3 style={{margin: '0 0 5px 0', fontSize: '18px', fontWeight: 800, color: '#0369a1'}}>Приготовили по своему рецепту?</h3> 
        <p style={{margin: '0 0 15px 0', fontSize: '13px', color: '#0284c7', lineHeight: 1.4}}>Поделитесь кулинарным шедевром со всем сообществом, даже если не использовали ИИ!</p> 
        <button onClick={() => { setIsStandaloneUploadOpen(true); document.getElementById('standalone-photo-upload')?.click(); }} style={{background: '#0ea5e9', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '100px', fontWeight: 800, fontSize: '14px', cursor: 'pointer', boxShadow: '0 4px 10px rgba(14, 165, 233, 0.3)'}}>Выложить своё блюдо</button> 
        <input id="standalone-photo-upload" type="file" accept="image/*" style={{display: 'none'}} onChange={handleUserPhotoChange} /> 
      </div> 

      {/* Форма загрузки своего блюда */} 
      {isStandaloneUploadOpen && userPhotoPreview && ( 
        <div className="card animate-fade-in" style={{border: '2px solid #0ea5e9', marginBottom: '25px'}}> 
          <h3 style={{marginTop: 0, marginBottom: '15px'}}>Публикация своего блюда</h3> 
          <img src={userPhotoPreview} alt="Preview" style={{width: '100%', height: '200px', objectFit: 'cover', borderRadius: '12px', marginBottom: '15px'}} /> 
           
          <textarea 
            placeholder="Название блюда (Обязательно)" 
            value={standaloneTitle} 
            onChange={(e) => {
              setStandaloneTitle(e.target.value);
              e.target.style.height = '44px';
              e.target.style.height = (e.target.scrollHeight) + 'px';
            }} 
            rows={1}
            style={{width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #94a3b8', fontSize: '15px', fontWeight: 700, marginBottom: '10px', outline: 'none', resize: 'none', overflow: 'hidden', minHeight: '44px', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: '18px'}} 
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
            style={{width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #d1d5db', fontSize: '14px', marginBottom: '15px', outline: 'none', resize: 'none', overflow: 'hidden', minHeight: '44px', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: '18px'}} 
          /> 
           
          <div style={{display: 'flex', gap: '10px'}}> 
            <button onClick={() => {setUserPhotoFile(null); setUserPhotoPreview(null); setStandaloneTitle(""); setUserComment(""); setIsStandaloneUploadOpen(false);}} style={{flex: 1, padding: '12px', borderRadius: '8px', background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 700, cursor: 'pointer'}}>Отмена</button> 
            <button onClick={() => submitFeedPost(null)} disabled={isUploadingPhoto} style={{flex: 2, padding: '12px', borderRadius: '8px', background: '#0ea5e9', border: 'none', color: 'white', fontWeight: 700, cursor: isUploadingPhoto ? 'default' : 'pointer'}}> 
              {isUploadingPhoto ? "Загрузка..." : "Отправить в ленту"} 
            </button> 
          </div> 
        </div> 
      )} 

      <div style={{fontSize: '14px', fontWeight: 600, color: '#6b7280', marginBottom: '8px'}}>Сортировка:</div> 
      <div style={{display: 'flex', gap: '8px', marginBottom: '25px', overflowX: 'auto', paddingBottom: '5px'}}> 
         <button onClick={() => fetchPhotosFeed('new')} style={{ padding: '8px 16px', borderRadius: '100px', border: 'none', whiteSpace: 'nowrap', background: photosSort === 'new' ? '#111' : '#f3f4f6', color: photosSort === 'new' ? 'white' : '#4b5563', fontWeight: 700, fontSize: '14px', transition: 'all 0.2s', cursor: 'pointer' }}>✨ Свежее</button> 
         <button onClick={() => fetchPhotosFeed('top')} style={{ padding: '8px 16px', borderRadius: '100px', border: 'none', whiteSpace: 'nowrap', background: photosSort === 'top' ? '#111' : '#f3f4f6', color: photosSort === 'top' ? 'white' : '#4b5563', fontWeight: 700, fontSize: '14px', transition: 'all 0.2s', cursor: 'pointer' }}>🔥 Популярное</button> 
         <button onClick={() => fetchPhotosFeed('old')} style={{ padding: '8px 16px', borderRadius: '100px', border: 'none', whiteSpace: 'nowrap', background: photosSort === 'old' ? '#111' : '#f3f4f6', color: photosSort === 'old' ? 'white' : '#4b5563', fontWeight: 700, fontSize: '14px', transition: 'all 0.2s', cursor: 'pointer' }}>🕰 Раннее</button> 
      </div> 

      <div style={{display: 'flex', flexDirection: 'column', gap: '20px'}}> 
        {photosFeed?.map((post: any) => ( 
          <div key={post.id} id={`feed-post-${post.id}`} className="card" style={{padding: '0', overflow: 'hidden', border: '1px solid #e5e7eb'}}> 
            <div style={{padding: '15px', display: 'flex', alignItems: 'center', gap: '10px', background: 'white'}}> 
               {post.user_avatar ? ( 
                  <img src={post.user_avatar} alt="Avatar" style={{width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover'}} /> 
               ) : ( 
                  <div style={{width: '36px', height: '36px', borderRadius: '50%', background: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: '16px', flexShrink: 0}}> 
                    {post.user_name?.charAt(0).toUpperCase() || 'Ш'} 
                  </div> 
               )} 
               <div style={{flex: 1}}> 
                  <div style={{fontWeight: 800, fontSize: '14px', color: '#111', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap'}}>
                    {post.user_name || 'Анонимный шеф'}
                    {renderUserBadge(post.user_id, userLevels[post.user_id])}
                  </div> 
                  {post.recipe_id ? ( 
                    <div style={{fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px'}}> 
                      Приготовил(а): <span style={{color: '#059669', fontWeight: 600, cursor: 'pointer'}} onClick={() => loadSharedRecipe(post.recipe_id, 'photos')}>{post.recipes?.title || 'Рецепт'}</span> 
                    </div> 
                  ) : ( 
                    <div style={{fontSize: '12px', color: '#0ea5e9', fontWeight: 700}}>По своему рецепту: {post.custom_title}</div> 
                  )} 
               </div> 
               {user && user.id === post.user_id && ( 
                  <button onClick={() => handleDeletePost(post.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={18} /></button> 
               )} 
            </div> 
             
            <img src={post.photo_url} alt="Блюдо" onClick={() => setFullScreenImage(post.photo_url)} style={{width: '100%', maxHeight: '400px', objectFit: 'cover', display: 'block', background: '#f3f4f6', cursor: 'zoom-in'}} /> 
             
            <div style={{padding: '15px', background: 'white'}}> 
              {post.comment && ( <p style={{margin: '0 0 15px 0', fontSize: '14px', color: '#374151', lineHeight: 1.5, wordBreak: 'break-word'}}> <strong>Описание:</strong> {post.comment} </p> )} 
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}> 
                {/* Лайки и комменты слева */}
                <div style={{display: 'flex', gap: '10px'}}> 
                  <button onClick={(e) => handlePhotoLike(e, post)} style={{background: post.is_liked ? '#fee2e2' : '#f3f4f6', border: 'none', borderRadius: '100px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', color: post.is_liked ? '#ef4444' : '#4b5563', fontWeight: 700, fontSize: '14px', transition: 'all 0.2s', cursor: 'pointer'}}> 
                    <Heart size={18} fill={post.is_liked ? "#ef4444" : "none"} /> {post.likes_count || 0} 
                  </button> 
                  <button onClick={() => handleOpenCommentsClick(post.id)} disabled={openingCommentsId === post.id} style={{background: '#f3f4f6', border: 'none', borderRadius: '100px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', color: '#4b5563', fontWeight: 700, fontSize: '14px', cursor: openingCommentsId === post.id ? 'default' : 'pointer'}}> 
                    {openingCommentsId === post.id ? (
                      <><Sparkles className="animate-spin" size={18} /> Загрузка...</>
                    ) : (
                      <><MessageCircle size={18} /> {post.comments_count || 0}</>
                    )}
                  </button> 
                </div> 
                {/* Кнопка К рецепту справа */}
                <div>
                  {post.recipe_id && ( 
                    <button onClick={() => loadSharedRecipe(post.recipe_id, 'photos')} style={{background: 'transparent', border: 'none', color: '#0ea5e9', fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', padding: 0}}> 
                       К рецепту <ArrowRight size={16} /> 
                    </button> 
                  )} 
                </div>
              </div> 
            </div> 
          </div> 
        ))} 
        {photosFeed.length === 0 && <div style={{textAlign: 'center', padding: '40px', color: '#9ca3af'}}>Здесь пока нет фотографий. Поделитесь своим шедевром первым! 📸</div>} 
      </div> 
    </div> 
  );
}