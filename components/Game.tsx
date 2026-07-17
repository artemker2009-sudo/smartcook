import React from 'react';
import { Lock, Trophy, AlertTriangle, Store, Cookie, Lightbulb, CookingPot, Zap, TrendingUp } from 'lucide-react';

export default function Game(props: any) {
  const {
    user, setIsAuthModalOpen, restaurantLevel, gameTab, setGameTab,
    floatingClicks, cooks, formatCooks, handleCookClick,
    energy, clickPower, passiveIncome, buyUpgrade, leaderboard, getUserBadges, switchView,
    maxEnergy, actualClickPower, actualPassiveIncome, getRestaurantCost
  } = props;

  return (
    <div style={{marginTop: 'var(--space-5)', paddingBottom: 'var(--space-5)'}}>
      {!user && (
        <div style={{background: 'var(--color-warning-subtle)', border: '1px solid var(--color-warning)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)', marginBottom: 'var(--space-3)', textAlign: 'center'}}>
           <p style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-warning)', margin: 0, lineHeight: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)', flexWrap: 'wrap'}}>
             <AlertTriangle size={14} /> Ваш прогресс сохраняется только в телефоне.
             <span onClick={() => setIsAuthModalOpen(true)} style={{color: 'var(--color-accent)', textDecoration: 'underline', cursor: 'pointer', fontWeight: 'var(--font-weight-semibold)'}}>Войдите в аккаунт</span>, чтобы сохранить его навсегда и <strong>соревноваться в мировом рейтинге!</strong>
           </p>
        </div>
      )}

      <div style={{textAlign: 'center', marginBottom: 'var(--space-3)'}}>
        <h1 style={{fontSize: 'var(--font-size-title)', fontWeight: 'var(--font-weight-semibold)', margin: '0 0 var(--space-1) 0', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)'}}><Store size={24} /> Мой ресторан</h1>
        <div style={{background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)', display: 'inline-block', padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-semibold)'}}>
          Уровень {restaurantLevel}: {restaurantLevel === 1 ? 'Уличный ларек' : restaurantLevel === 2 ? 'Закусочная' : restaurantLevel === 3 ? 'Уютное кафе' : restaurantLevel === 4 ? 'Ресторан' : restaurantLevel === 5 ? 'Мишленовский ресторан' : 'Сеть ресторанов'}
        </div>
      </div>

      <div style={{display: 'flex', background: 'var(--color-bg-subtle)', padding: 'var(--space-1)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-4)', overflowX: 'auto', WebkitOverflowScrolling: 'touch'}}>
        <button onClick={() => setGameTab('kitchen')} style={{ flex: 1, minWidth: '80px', padding: 'var(--space-2) var(--space-1)', borderRadius: 'var(--radius-sm)', border: 'none', background: gameTab === 'kitchen' ? 'var(--color-surface)' : 'transparent', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', boxShadow: gameTab === 'kitchen' ? '0 4px 15px rgba(0,0,0,0.05)' : 'none', color: gameTab === 'kitchen' ? 'var(--color-accent)' : 'var(--color-text-secondary)', cursor: 'pointer', transition: 'all 0.2s' }}>Кухня</button>
        <button onClick={() => setGameTab('tasks')} style={{ flex: 1, minWidth: '80px', padding: 'var(--space-2) var(--space-1)', borderRadius: 'var(--radius-sm)', border: 'none', background: gameTab === 'tasks' ? 'var(--color-surface)' : 'transparent', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', boxShadow: gameTab === 'tasks' ? '0 4px 15px rgba(0,0,0,0.05)' : 'none', color: gameTab === 'tasks' ? 'var(--color-accent)' : 'var(--color-text-secondary)', cursor: 'pointer', transition: 'all 0.2s' }}>Задания</button>
        <button onClick={() => setGameTab('shop')} style={{ flex: 1, minWidth: '80px', padding: 'var(--space-2) var(--space-1)', borderRadius: 'var(--radius-sm)', border: 'none', background: gameTab === 'shop' ? 'var(--color-surface)' : 'transparent', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', boxShadow: gameTab === 'shop' ? '0 4px 15px rgba(0,0,0,0.05)' : 'none', color: gameTab === 'shop' ? 'var(--color-accent)' : 'var(--color-text-secondary)', cursor: 'pointer', transition: 'all 0.2s' }}>Прокачка</button>
        <button onClick={() => setGameTab('leaderboard')} style={{ flex: 1, minWidth: '80px', padding: 'var(--space-2) var(--space-1)', borderRadius: 'var(--radius-sm)', border: 'none', background: gameTab === 'leaderboard' ? 'var(--color-surface)' : 'transparent', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', boxShadow: gameTab === 'leaderboard' ? '0 4px 15px rgba(0,0,0,0.05)' : 'none', color: gameTab === 'leaderboard' ? 'var(--color-accent)' : 'var(--color-text-secondary)', cursor: 'pointer', transition: 'all 0.2s' }}>Рейтинг</button>
      </div>

      {gameTab === 'kitchen' && (
        <div className="card animate-fade-in" style={{textAlign: 'center', padding: 'var(--space-5) var(--space-3)', position: 'relative', overflow: 'hidden'}}>
           {floatingClicks.map((click: any) => (
              <div key={click.id} className="float-coin" style={{left: click.x, top: click.y}}>
                +{click.val}
              </div>
           ))}
           <div style={{fontSize: 'var(--font-size-body)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-1)'}}>Баланс</div>

           <div style={{fontSize: 'var(--font-size-title)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text)', lineHeight: 1, marginBottom: 'var(--space-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)'}}>
             {formatCooks(cooks)} <Cookie size={22} />
           </div>

           <div style={{display: 'flex', justifyContent: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)'}}>
             <div style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-accent)', fontWeight: 'var(--font-weight-semibold)', background: 'var(--color-accent-subtle)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)'}}>
               Клик: +{actualClickPower}
             </div>
             <div style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-accent)', fontWeight: 'var(--font-weight-semibold)', background: 'var(--color-accent-subtle)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)'}}>
               Пассив: {actualPassiveIncome > 0 ? `+${actualPassiveIncome}/с` : '0/с'}
             </div>
           </div>

           <div style={{background: 'var(--color-bg)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--color-border)', marginBottom: 'var(--space-5)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-caption)', lineHeight: '1.4', maxWidth: '280px', margin: '0 auto var(--space-5) auto', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', textAlign: 'left'}}>
             <Lightbulb size={16} style={{ flexShrink: 0, marginTop: '2px' }} /> <span><strong>Секрет шефа:</strong> Кликайте по сковороде, зарабатывайте куки и прокачивайте ресторан, чтобы выбиться в топ мирового рейтинга!</span>
           </div>

           <div
             onPointerDown={handleCookClick}
             style={{
               width: '200px', height: '200px', margin: '0 auto', background: 'var(--color-accent-subtle)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 20px 40px -10px rgba(5, 150, 105, 0.3), inset 0 -10px 20px rgba(4, 120, 87, 0.15)', userSelect: 'none', transition: 'transform 0.05s', WebkitTapHighlightColor: 'transparent'
             }}
           >
             <CookingPot size={90} color="var(--color-accent)" strokeWidth={1.5} />
           </div>

           <div style={{marginTop: 'var(--space-5)'}}>
             <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-2)'}}>
                <div style={{textAlign: 'left'}}>
                  Энергия
                  {energy < maxEnergy && (
                    <div style={{fontSize: '11px', fontWeight: 'var(--font-weight-regular)', color: 'var(--color-text-muted)', marginTop: '2px'}}>
                      (полная через {Math.floor((maxEnergy - energy) / 60)}м {(maxEnergy - energy) % 60}с)
                    </div>
                  )}
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{energy} / {maxEnergy} <Zap size={14} /></span>
             </div>
             <div style={{width: '100%', height: '12px', background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-sm)', overflow: 'hidden'}}>
                <div style={{width: `${(energy / maxEnergy) * 100}%`, height: '100%', background: 'var(--color-accent)', transition: 'width 0.2s'}} />
             </div>
           </div>
        </div>
      )}

      {gameTab === 'tasks' && (
        <div className="card animate-fade-in" style={{padding: 'var(--space-4)'}}>
          <h3 style={{marginTop: 0, marginBottom: 'var(--space-4)', color: 'var(--color-text)'}}>Задания для шефа</h3>

          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-2)'}}>
            <div>
              <div style={{fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)', color: 'var(--color-text)', marginBottom: 'var(--space-1)'}}>Сгенерировать рецепт</div>
              <div style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)'}}>Награда: 500 куков (Раз в день)</div>
            </div>
            <button onClick={() => switchView('service')} style={{background: 'var(--color-accent)', color: 'white', border: 'none', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', cursor: 'pointer'}}>В поиск</button>
          </div>

          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-2)'}}>
            <div>
              <div style={{fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)', color: 'var(--color-text)', marginBottom: 'var(--space-1)'}}>Оценить коллег (лайки)</div>
              <div style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)'}}>Награда: (Скоро)</div>
            </div>
            <a href="/feed" style={{background: 'var(--color-accent)', color: 'white', border: 'none', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', cursor: 'pointer', textDecoration: 'none'}}>В ленту</a>
          </div>

          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)'}}>
            <div>
              <div style={{fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)', color: 'var(--color-text)', marginBottom: 'var(--space-1)'}}>Выложить фото блюда</div>
              <div style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)'}}>Награда: 1000 куков</div>
            </div>
            <a href="/feed" style={{background: 'var(--color-accent)', color: 'white', border: 'none', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', cursor: 'pointer', textDecoration: 'none'}}>В ленту</a>
          </div>
        </div>
      )}

      {gameTab === 'shop' && (
        <div className="card animate-fade-in" style={{padding: 'var(--space-4)'}}>
          <h3 style={{marginTop: 0, marginBottom: 'var(--space-4)', color: 'var(--color-text)'}}>Магазин улучшений</h3>

          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-2)', border: '1px solid var(--color-border)'}}>
            <div>
              <div style={{fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)', color: 'var(--color-text)', marginBottom: 'var(--space-1)'}}>Новая лопатка</div>
              <div style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)'}}>+1 к базовой силе клика</div>
            </div>
            <button
              onClick={() => buyUpgrade('spatula')}
              disabled={cooks < (clickPower * 500)}
              style={{background: cooks >= (clickPower * 500) ? 'var(--color-accent)' : 'var(--color-border)', color: 'white', border: 'none', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', cursor: cooks >= (clickPower * 500) ? 'pointer' : 'not-allowed', transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center', gap: '4px'}}
            >
              {clickPower * 500} <Cookie size={14} />
            </button>
          </div>

          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-2)', border: '1px solid var(--color-border)'}}>
            <div>
              <div style={{fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)', color: 'var(--color-text)', marginBottom: 'var(--space-1)'}}>Нанять су-шефа</div>
              <div style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)'}}>+1 к базовому пассиву/сек</div>
            </div>
            <button
              onClick={() => buyUpgrade('souschef')}
              disabled={cooks < ((passiveIncome + 1) * 2000)}
              style={{background: cooks >= ((passiveIncome + 1) * 2000) ? 'var(--color-accent)' : 'var(--color-border)', color: 'white', border: 'none', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', cursor: cooks >= ((passiveIncome + 1) * 2000) ? 'pointer' : 'not-allowed', transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center', gap: '4px'}}
            >
              {(passiveIncome + 1) * 2000} <Cookie size={14} />
            </button>
          </div>

          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)'}}>
            <div>
              <div style={{fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)', color: 'var(--color-text)', marginBottom: 'var(--space-1)'}}>Ремонт ресторана</div>
              <div style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)'}}>Перейти на Уровень {restaurantLevel + 1}</div>
              {restaurantLevel < 6 && (
                <div style={{fontSize: '11px', color: 'var(--color-accent)', fontWeight: 'var(--font-weight-semibold)', marginTop: 'var(--space-1)', display: 'flex', alignItems: 'center', gap: '4px'}}>
                  <TrendingUp size={12} /> Доход x{restaurantLevel + 1} | Энергия { (restaurantLevel + 1) * 500 }
                </div>
              )}
            </div>
            {(() => {
              const restCost = getRestaurantCost(restaurantLevel);
              return (
                <button
                  onClick={() => buyUpgrade('restaurant')}
                  disabled={cooks < restCost || restaurantLevel >= 6}
                  style={{background: (cooks >= restCost && restaurantLevel < 6) ? 'var(--color-accent)' : 'var(--color-border)', color: 'white', border: 'none', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', cursor: (cooks >= restCost && restaurantLevel < 6) ? 'pointer' : 'not-allowed', transition: 'all 0.2s', flexShrink: 0, marginLeft: 'var(--space-2)', display: 'inline-flex', alignItems: 'center', gap: '4px'}}
                >
                  {restaurantLevel >= 6 ? "МАКС" : <>{restCost} <Cookie size={14} /></>}
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {gameTab === 'leaderboard' && (
        <div className="card animate-fade-in" style={{padding: 'var(--space-4)'}}>
          <h3 style={{marginTop: 0, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-text)'}}>
            <Trophy size={20} color="var(--color-accent)" /> Топ шеф-поваров
          </h3>

          {!user ? (
             <div style={{textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-4)'}}>
               <Lock size={32} style={{margin: '0 auto var(--space-2) auto', opacity: 0.5}} />
               Войдите в аккаунт, чтобы видеть мировой рейтинг и участвовать в нем.
             </div>
          ) : leaderboard.length === 0 ? (
             <div style={{textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-4)'}}>Загрузка рейтинга...</div>
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: 'var(--space-2)'}}>
              {leaderboard.map((lbUser: any, idx: number) => {
                const { isDev, devBadge, restBadge } = getUserBadges(null, lbUser.restaurant_level, lbUser.is_dev);
                const rankBg = idx === 0 ? 'var(--color-warning-subtle)' : idx === 1 ? 'var(--color-bg)' : idx === 2 ? 'var(--color-danger-subtle)' : 'var(--color-surface)';
                const rankBorder = idx === 0 ? 'var(--color-warning)' : idx === 1 ? 'var(--color-border)' : idx === 2 ? 'var(--color-danger)' : 'var(--color-border)';
                const rankColor = idx === 0 ? 'var(--color-warning)' : idx === 1 ? 'var(--color-text-secondary)' : idx === 2 ? 'var(--color-danger)' : 'var(--color-text-muted)';
                return (
                  <div key={idx} style={{display: 'flex', alignItems: 'center', gap: 'var(--space-3)', background: rankBg, padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', border: idx < 3 ? `1px solid ${rankBorder}` : '1px solid var(--color-border)'}}>
                     <div style={{width: '24px', fontWeight: 'var(--font-weight-semibold)', color: rankColor, fontSize: 'var(--font-size-body)', textAlign: 'center', flexShrink: 0}}>
                       {idx + 1}
                     </div>

                     {lbUser.user_avatar ? (
                        <img src={lbUser.user_avatar} alt="Avatar" style={{width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0}} />
                     ) : (
                        <div style={{width: '36px', height: '36px', borderRadius: '50%', background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-semibold)', flexShrink: 0}}>
                          {lbUser.user_name?.charAt(0).toUpperCase() || 'Ш'}
                        </div>
                     )}

                     <div style={{flex: 1, minWidth: 0}}>
                       <div style={{fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)', color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                         {lbUser.user_name || 'Анонимный шеф'}
                       </div>
                       <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', marginTop: 'var(--space-1)'}}>
                         {isDev && devBadge}
                         {restBadge}
                       </div>
                     </div>

                     <div style={{fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-accent)', fontSize: 'var(--font-size-caption)', whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px'}}>
                       {lbUser.cooks} <Cookie size={14} />
                     </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
