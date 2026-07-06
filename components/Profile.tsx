import React from "react";
import { User, Edit3, LogOut, Settings, ChevronRight, Heart, Clock, Flame, Trash2, MessageCircle, Camera } from "lucide-react";
import Button from "@/components/ui/Button";

export default function Profile(props: any) {
  const {
    user, cooks, restaurantLevel, profileView, setProfileView, feed, userPhotos,
    handleLogout, setIsEditingProfile, setIsPreferencesModalOpen, setIsAuthModalOpen,
    loadFromHistory, handleDeletePost, formatCooks, formatTime, formatCalories, getUserBadges
  } = props;

  const { isDev, devBadge, restBadge } = getUserBadges(user?.id, restaurantLevel);

  return (
    <div style={{marginTop: 'var(--space-5)', paddingBottom: 'var(--space-5)'}}>
      {!user ? (
        <div style={{textAlign: 'center', padding: 'var(--space-5) var(--space-3)'}}>
          <div style={{background: 'var(--color-bg-subtle)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-4) auto'}}>
            <User size={40} color="var(--color-text-muted)" />
          </div>
          <h2 style={{fontSize: 'var(--font-size-title)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-2)', color: 'var(--color-text)'}}>Личный кабинет</h2>
          <p style={{color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.5}}>Войдите, чтобы сохранять любимые рецепты, историю генераций и управлять своим рестораном.</p>
          <Button variant="primary" onClick={() => setIsAuthModalOpen(true)} style={{maxWidth: '250px', margin: '0 auto'}}>Войти / Регистрация</Button>
        </div>
      ) : (
        <>
          <div className="card" style={{padding: '0', textAlign: 'center', marginBottom: 'var(--space-3)', overflow: 'hidden', border: 'none', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.1)'}}>
            <div style={{background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%)', height: '100px', width: '100%'}}></div>
            <div style={{position: 'relative', width: '90px', height: '90px', margin: '-45px auto var(--space-3) auto', background: 'var(--color-surface)', borderRadius: '50%', padding: '4px'}}>
              {user.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt="Avatar" style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover'}} />
              ) : (
                <div style={{width: '100%', height: '100%', borderRadius: '50%', background: 'var(--color-accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 'var(--font-weight-semibold)'}}>
                  {user.user_metadata?.full_name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'Ш'}
                </div>
              )}
            </div>

            <div style={{padding: '0 var(--space-4) var(--space-4) var(--space-4)'}}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)', marginBottom: 'var(--space-1)' }}>
                <h2 style={{margin: '0', fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-semibold)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', color: 'var(--color-text)'}}>
                  {user.user_metadata?.full_name || 'Шеф'}
                  {isDev ? devBadge : restBadge}
                </h2>
                {isDev && <div>{restBadge}</div>}
              </div>

              <p style={{margin: '0 0 var(--space-3) 0', fontSize: 'var(--font-size-caption)', color: 'var(--color-accent)', fontWeight: 'var(--font-weight-semibold)'}}>
                @{user.user_metadata?.username || user.email?.split('@')[0]}
              </p>

              <div style={{display: 'flex', gap: 'var(--space-2)', justifyContent: 'center', marginBottom: 'var(--space-4)'}}>
                <button onClick={() => setIsEditingProfile(true)} style={{background: 'var(--color-bg-subtle)', border: 'none', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)', cursor: 'pointer', transition: 'all 0.2s'}}>
                  <Edit3 size={14} /> Изменить
                </button>
                <button onClick={handleLogout} style={{background: 'var(--color-danger-subtle)', border: 'none', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)', cursor: 'pointer', transition: 'all 0.2s'}}>
                  <LogOut size={14} /> Выйти
                </button>
              </div>

              <div style={{display: 'flex', background: 'var(--color-bg)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', gap: 'var(--space-3)', border: '1px solid var(--color-border)'}}>
                <div style={{flex: 1, textAlign: 'center'}}>
                   <div style={{fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-accent)', marginBottom: 'var(--space-1)'}}>{formatCooks(cooks)} 🍪</div>
                   <div style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)'}}>Баланс</div>
                </div>
                <div style={{width: '1px', background: 'var(--color-border)'}}></div>
                <div style={{flex: 1, textAlign: 'center'}}>
                   <div style={{fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text)', marginBottom: 'var(--space-1)'}}>{restaurantLevel} 🏪</div>
                   <div style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)'}}>Уровень</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{padding: 'var(--space-4)', marginBottom: 'var(--space-3)'}}>
             <h3 style={{margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text)'}}>Настройки питания</h3>
             <p style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)'}}>AI будет учитывать их при создании рецептов.</p>
             <button onClick={() => setIsPreferencesModalOpen(true)} style={{width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--color-text)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)', cursor: 'pointer', transition: 'all 0.2s'}}>
               <div style={{display: 'flex', alignItems: 'center', gap: 'var(--space-2)'}}><Settings size={18} color="var(--color-text-secondary)" /> Фильтры и аллергии</div>
               <ChevronRight size={18} color="var(--color-text-muted)" />
             </button>
          </div>

          <div style={{display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', paddingBottom: 'var(--space-2)', marginBottom: 'var(--space-3)'}}>
             <button onClick={() => setProfileView('main')} style={{padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', border: 'none', whiteSpace: 'nowrap', background: profileView === 'main' ? 'var(--color-text)' : 'var(--color-surface)', color: profileView === 'main' ? 'white' : 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', boxShadow: profileView === 'main' ? '0 4px 10px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.05)', cursor: 'pointer', transition: 'all 0.2s'}}>📜 История</button>
             <button onClick={() => setProfileView('favorites')} style={{padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', border: 'none', whiteSpace: 'nowrap', background: profileView === 'favorites' ? 'var(--color-text)' : 'var(--color-surface)', color: profileView === 'favorites' ? 'white' : 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', boxShadow: profileView === 'favorites' ? '0 4px 10px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.05)', cursor: 'pointer', transition: 'all 0.2s'}}>❤️ Избранное ({feed?.filter((r: any) => r.is_favorite).length || 0})</button>
             <button onClick={() => setProfileView('photos')} style={{padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', border: 'none', whiteSpace: 'nowrap', background: profileView === 'photos' ? 'var(--color-text)' : 'var(--color-surface)', color: profileView === 'photos' ? 'white' : 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', boxShadow: profileView === 'photos' ? '0 4px 10px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.05)', cursor: 'pointer', transition: 'all 0.2s'}}>📸 Мои фото</button>
          </div>

          {profileView === 'main' && (
            <div className="animate-fade-in">
              {feed?.length === 0 ? (
                <div style={{textAlign: 'center', padding: 'var(--space-4)'}}>
                  <div style={{fontSize: 'var(--font-size-title)', marginBottom: 'var(--space-2)'}}>🍳</div>
                  <div style={{color: 'var(--color-text)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-1)'}}>История пуста</div>
                  <div style={{color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-caption)'}}>Найдите свой первый рецепт по фото или названию.</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-3)' }}>
                  {feed?.map((item: any) => (
                    <div key={item.id} style={{ background: 'var(--color-surface)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', border: '1px solid var(--color-border)' }} onClick={() => loadFromHistory(item, 'profile_history')}>
                      <div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)', color: 'var(--color-text)', lineHeight: 1.3 }}>
                        {item.title}
                        {item.is_favorite && <Heart size={14} fill="#dc2626" color="#dc2626" style={{display: 'inline-block', marginLeft: 'var(--space-1)', verticalAlign: 'middle', marginTop: '-2px'}}/>}
                      </div>
                      <div style={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)'}}>
                         <div style={{display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-bg)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)'}}><Clock size={14}/> {formatTime(item.time)}</div>
                         {item.calories && <div style={{display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-bg)', color: 'var(--color-text-secondary)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)'}}><Flame size={14}/> {formatCalories(item.calories)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {profileView === 'favorites' && (
            <div className="animate-fade-in">
              {feed?.filter((r: any) => r.is_favorite).length === 0 ? (
                <div style={{textAlign: 'center', padding: 'var(--space-4)'}}>
                  <div style={{fontSize: 'var(--font-size-title)', marginBottom: 'var(--space-2)'}}>💔</div>
                  <div style={{color: 'var(--color-text)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-1)'}}>В избранном пока пусто</div>
                  <div style={{color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-caption)'}}>Добавляйте рецепты лайком, чтобы вернуться к ним позже.</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-3)' }}>
                  {feed?.filter((r: any) => r.is_favorite).map((item: any) => (
                    <div key={item.id} style={{ background: 'var(--color-surface)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', border: '1px solid var(--color-danger-subtle)' }} onClick={() => loadFromHistory(item, 'profile_favorites')}>
                      <div style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)', color: 'var(--color-text)', lineHeight: 1.3 }}>
                        {item.title} <Heart size={14} fill="#dc2626" color="#dc2626" style={{display: 'inline-block', marginLeft: 'var(--space-1)', verticalAlign: 'middle', marginTop: '-2px'}}/>
                      </div>
                      <div style={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)'}}>
                         <div style={{display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-bg)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)'}}><Clock size={14}/> {formatTime(item.time)}</div>
                         {item.calories && <div style={{display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-bg)', color: 'var(--color-text-secondary)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)'}}><Flame size={14}/> {formatCalories(item.calories)}</div>}
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
                 <div style={{textAlign: 'center', padding: 'var(--space-4)'}}>
                   <div style={{fontSize: 'var(--font-size-title)', marginBottom: 'var(--space-2)'}}>📸</div>
                   <div style={{color: 'var(--color-text)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-1)'}}>Пока нет опубликованных фото</div>
                   <div style={{color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-caption)'}}>Приготовьте рецепт и поделитесь фото результата в ленте.</div>
                 </div>
              ) : (
                 <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)'}}>
                   {userPhotos.map((post: any) => (
                      <div key={post.id} style={{background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column'}}>
                         <img src={post.photo_url} alt="Мое блюдо" style={{width: '100%', height: '160px', objectFit: 'cover', display: 'block'}} />
                         <div style={{padding: 'var(--space-2)', flex: 1, display: 'flex', flexDirection: 'column'}}>
                            {post.recipe_id ? (
                               <div style={{fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-1)', color: 'var(--color-text)', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'}}>{post.recipes?.title}</div>
                            ) : (
                               <div style={{fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-1)', color: 'var(--color-accent)', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'}}>{post.custom_title}</div>
                            )}

                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 'var(--space-2)'}}>
                               <div style={{display: 'flex', gap: 'var(--space-2)', fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)'}}>
                                  <span style={{display: 'flex', alignItems: 'center', gap: '3px'}}><Heart size={12} fill={post.likes_count > 0 ? "#dc2626" : "none"} color={post.likes_count > 0 ? "#dc2626" : "var(--color-text-secondary)"}/> {post.likes_count || 0}</span>
                                  <span style={{display: 'flex', alignItems: 'center', gap: '3px'}}><MessageCircle size={12} /> {post.comments_count || 0}</span>
                               </div>
                               <button onClick={() => handleDeletePost(post.id)} style={{background: 'var(--color-danger-subtle)', border: 'none', color: 'var(--color-danger)', borderRadius: 'var(--radius-sm)', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                  <Trash2 size={14}/>
                               </button>
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
