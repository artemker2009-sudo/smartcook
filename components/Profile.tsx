import React from "react";
import { User, Edit3, LogOut, Settings, ChevronRight, Heart, Clock, Flame, Trash2, MessageCircle, Camera } from "lucide-react";

export default function Profile(props: any) {
  // Вытаскиваем все необходимые данные и функции из пропсов, которые передаст page.tsx
  const {
    user, cooks, restaurantLevel, profileView, setProfileView, feed, userPhotos,
    handleLogout, setIsEditingProfile, setIsPreferencesModalOpen, setIsAuthModalOpen,
    loadFromHistory, handleDeletePost, formatCooks, formatTime, formatCalories, renderUserBadge
  } = props;

  return (
    <div style={{marginTop: '60px', paddingBottom: '80px'}}>
      {!user ? (
        <div style={{textAlign: 'center', padding: '40px 20px'}}>
          <div style={{background: '#f1f5f9', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto'}}>
            <User size={40} color="#94a3b8" />
          </div>
          <h2 style={{fontSize: '24px', fontWeight: 900, marginBottom: '10px'}}>Личный кабинет</h2>
          <p style={{color: '#64748b', marginBottom: '25px', lineHeight: 1.5}}>Войдите, чтобы сохранять любимые рецепты, историю генераций и управлять своим рестораном.</p>
          <button onClick={() => setIsAuthModalOpen(true)} className="btn-primary" style={{maxWidth: '250px', margin: '0 auto'}}>Войти / Регистрация</button>
        </div>
      ) : (
        <>
          {/* Profile Header с красивым градиентом */}
          <div className="card" style={{padding: '0', textAlign: 'center', marginBottom: '20px', overflow: 'hidden', border: 'none', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.1)'}}>
            <div style={{background: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)', height: '100px', width: '100%'}}></div>
            <div style={{position: 'relative', width: '90px', height: '90px', margin: '-45px auto 15px auto', background: 'white', borderRadius: '50%', padding: '4px'}}>
              {user.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt="Avatar" style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover'}} />
              ) : (
                <div style={{width: '100%', height: '100%', borderRadius: '50%', background: '#059669', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 800}}>
                  {user.user_metadata?.full_name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'Ш'}
                </div>
              )}
            </div>
            
            <div style={{padding: '0 20px 20px 20px'}}>
              <h2 style={{margin: '0 0 5px 0', fontSize: '20px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap'}}>
                {user.user_metadata?.full_name || 'Шеф'}
                {renderUserBadge(user.id, restaurantLevel)}
              </h2>
              <p style={{margin: '0 0 15px 0', fontSize: '13px', color: '#64748b'}}>Анонимный профиль</p>
              
              <div style={{display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '25px'}}>
                <button onClick={() => setIsEditingProfile(true)} style={{background: '#f1f5f9', border: 'none', padding: '8px 16px', borderRadius: '100px', fontSize: '13px', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'all 0.2s'}}>
                  <Edit3 size={14} /> Изменить
                </button>
                <button onClick={handleLogout} style={{background: '#fee2e2', border: 'none', padding: '8px 16px', borderRadius: '100px', fontSize: '13px', fontWeight: 700, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'all 0.2s'}}>
                  <LogOut size={14} /> Выйти
                </button>
              </div>

              <div style={{display: 'flex', background: '#f8fafc', padding: '15px', borderRadius: '16px', gap: '15px', border: '1px solid #e2e8f0'}}>
                <div style={{flex: 1, textAlign: 'center'}}>
                   <div style={{fontSize: '20px', fontWeight: 900, color: '#f59e0b', marginBottom: '4px'}}>{formatCooks(cooks)} 🍪</div>
                   <div style={{fontSize: '12px', color: '#64748b', fontWeight: 600}}>Баланс</div>
                </div>
                <div style={{width: '1px', background: '#e2e8f0'}}></div>
                <div style={{flex: 1, textAlign: 'center'}}>
                   <div style={{fontSize: '20px', fontWeight: 900, color: '#3b82f6', marginBottom: '4px'}}>{restaurantLevel} 🏪</div>
                   <div style={{fontSize: '12px', color: '#64748b', fontWeight: 600}}>Уровень</div>
                </div>
              </div>
            </div>
          </div>

          {/* Profile Navigation */}
          <div style={{display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '15px'}}>
             <button onClick={() => setProfileView('main')} style={{padding: '10px 16px', borderRadius: '12px', border: 'none', whiteSpace: 'nowrap', background: profileView === 'main' ? '#111' : 'white', color: profileView === 'main' ? 'white' : '#475569', fontWeight: 700, fontSize: '14px', boxShadow: profileView === 'main' ? '0 4px 10px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.05)', cursor: 'pointer', transition: 'all 0.2s'}}>Обзор</button>
             <button onClick={() => setProfileView('favorites')} style={{padding: '10px 16px', borderRadius: '12px', border: 'none', whiteSpace: 'nowrap', background: profileView === 'favorites' ? '#111' : 'white', color: profileView === 'favorites' ? 'white' : '#475569', fontWeight: 700, fontSize: '14px', boxShadow: profileView === 'favorites' ? '0 4px 10px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.05)', cursor: 'pointer', transition: 'all 0.2s'}}>❤️ Избранное ({feed?.filter((r: any) => r.is_favorite).length || 0})</button>
             <button onClick={() => setProfileView('history')} style={{padding: '10px 16px', borderRadius: '12px', border: 'none', whiteSpace: 'nowrap', background: profileView === 'history' ? '#111' : 'white', color: profileView === 'history' ? 'white' : '#475569', fontWeight: 700, fontSize: '14px', boxShadow: profileView === 'history' ? '0 4px 10px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.05)', cursor: 'pointer', transition: 'all 0.2s'}}>📜 История</button>
             <button onClick={() => setProfileView('photos')} style={{padding: '10px 16px', borderRadius: '12px', border: 'none', whiteSpace: 'nowrap', background: profileView === 'photos' ? '#111' : 'white', color: profileView === 'photos' ? 'white' : '#475569', fontWeight: 700, fontSize: '14px', boxShadow: profileView === 'photos' ? '0 4px 10px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.05)', cursor: 'pointer', transition: 'all 0.2s'}}>📸 Мои фото</button>
          </div>

          {/* Profile Content */}
          {profileView === 'main' && (
            <div className="card animate-fade-in" style={{padding: '20px'}}>
               <h3 style={{margin: '0 0 15px 0', fontSize: '18px', fontWeight: 800}}>Настройки питания</h3>
               <p style={{fontSize: '13px', color: '#64748b', marginBottom: '15px'}}>Укажите свои предпочтения, и AI будет учитывать их при генерации рецептов.</p>
               <button onClick={() => setIsPreferencesModalOpen(true)} style={{width: '100%', padding: '14px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#111', fontWeight: 700, fontSize: '15px', cursor: 'pointer', transition: 'all 0.2s'}}>
                 <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}><Settings size={18} color="#64748b" /> Фильтры и аллергии</div>
                 <ChevronRight size={18} color="#94a3b8" />
               </button>
            </div>
          )}

          {profileView === 'favorites' && (
            <div className="animate-fade-in">
              {feed?.filter((r: any) => r.is_favorite).length === 0 ? (
                <div style={{textAlign: 'center', padding: '40px', color: '#9ca3af', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0'}}>В избранном пока пусто 💔</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '15px' }}> 
                  {feed?.filter((r: any) => r.is_favorite).map((item: any) => ( 
                    <div key={item.id} className="card" style={{ padding: '15px', cursor: 'pointer', marginBottom: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} onClick={() => loadFromHistory(item, 'profile_favorites')}> 
                      <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px', lineHeight: 1.3, height: '38px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}> {item.title} </div> 
                      <div style={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6b7280'}}> 
                         <div style={{display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap'}}><Clock size={12}/> {formatTime(item.time)}</div> 
                         {item.calories && <div style={{display: 'flex', alignItems: 'center', gap: '3px', color: '#f97316', whiteSpace: 'nowrap'}}><Flame size={12}/> {formatCalories(item.calories)}</div>} 
                      </div> 
                    </div> 
                  ))} 
                </div>
              )}
            </div>
          )}

          {profileView === 'history' && (
            <div className="animate-fade-in">
              {feed?.length === 0 ? (
                <div style={{textAlign: 'center', padding: '40px', color: '#9ca3af', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0'}}>История генераций пуста 🍳</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '15px' }}> 
                  {feed?.map((item: any) => ( 
                    <div key={item.id} className="card" style={{ padding: '15px', cursor: 'pointer', marginBottom: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: item.is_favorite ? '1px solid #fca5a5' : '1px solid #e5e7eb' }} onClick={() => loadFromHistory(item, 'profile_history')}> 
                      <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px', lineHeight: 1.3, height: '38px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}> 
                        {item.title}
                        {item.is_favorite && <Heart size={12} fill="#ef4444" color="#ef4444" style={{display: 'inline-block', marginLeft: '4px', verticalAlign: 'middle'}}/>}
                      </div> 
                      <div style={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6b7280'}}> 
                         <div style={{display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap'}}><Clock size={12}/> {formatTime(item.time)}</div> 
                         {item.calories && <div style={{display: 'flex', alignItems: 'center', gap: '3px', color: '#f97316', whiteSpace: 'nowrap'}}><Flame size={12}/> {formatCalories(item.calories)}</div>} 
                      </div> 
                    </div> 
                  ))} 
                </div>
              )}
            </div>
          )}

          {profileView === 'photos' && (
            <div className="animate-fade-in">
              {userPhotos.length === 0 ? (
                 <div style={{textAlign: 'center', padding: '40px', color: '#9ca3af', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0'}}>У вас пока нет опубликованных фото 📸</div>
              ) : (
                 <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
                   {userPhotos.map((post: any) => (
                      <div key={post.id} className="card" style={{padding: '0', overflow: 'hidden', border: '1px solid #e5e7eb'}}>
                         <div style={{padding: '12px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9'}}>
                           <div style={{fontSize: '13px', fontWeight: 700, color: '#374151'}}>
                              {new Date(post.created_at).toLocaleDateString()}
                           </div>
                           <button onClick={() => handleDeletePost(post.id)} style={{background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 600}}>
                              <Trash2 size={14}/> Удалить
                           </button>
                         </div>
                         <img src={post.photo_url} alt="Мое блюдо" style={{width: '100%', height: '250px', objectFit: 'cover', display: 'block'}} />
                         <div style={{padding: '15px'}}>
                            {post.recipe_id ? (
                               <div style={{fontSize: '14px', fontWeight: 700, marginBottom: '8px', color: '#111'}}>Рецепт: {post.recipes?.title}</div>
                            ) : (
                               <div style={{fontSize: '14px', fontWeight: 700, marginBottom: '8px', color: '#0ea5e9'}}>Свой рецепт: {post.custom_title}</div>
                            )}
                            {post.comment && <p style={{fontSize: '13px', color: '#4b5563', margin: '0 0 10px 0', lineHeight: 1.4}}>{post.comment}</p>}
                            <div style={{display: 'flex', gap: '15px', fontSize: '13px', color: '#64748b', fontWeight: 600}}>
                               <span style={{display: 'flex', alignItems: 'center', gap: '4px'}}><Heart size={14} /> {post.likes_count || 0}</span>
                               <span style={{display: 'flex', alignItems: 'center', gap: '4px'}}><MessageCircle size={14} /> {post.comments_count || 0}</span>
                            </div>
                         </div>
                      </div>
                   ))}
                 </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}