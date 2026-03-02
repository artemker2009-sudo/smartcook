import React from 'react';
import { Lock, Trophy } from 'lucide-react';

export default function Game(props: any) {
  const {
    user, setIsAuthModalOpen, restaurantLevel, gameTab, setGameTab,
    floatingClicks, cooks, formatCooks, passiveIncome, handleCookClick,
    energy, clickPower, buyUpgrade, leaderboard, getUserBadges, switchView
  } = props;

  return (
    <div style={{marginTop: '60px', paddingBottom: '80px'}}>
      {!user && (
        <div style={{background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '16px', padding: '15px', marginBottom: '20px', textAlign: 'center'}}>
           <p style={{fontSize: '13px', color: '#b45309', margin: 0, lineHeight: 1.5}}>
             ⚠️ Ваш прогресс сохраняется только в телефоне. <br/>
             <span onClick={() => setIsAuthModalOpen(true)} style={{color: '#10b981', textDecoration: 'underline', cursor: 'pointer', fontWeight: 800}}>Войдите в аккаунт</span>, чтобы сохранить его навсегда и <strong>соревноваться в мировом рейтинге!</strong>
           </p>
        </div>
      )}

      <div style={{textAlign: 'center', marginBottom: '20px'}}>
        <h1 style={{fontSize: '28px', fontWeight: '900', margin: '0 0 5px 0'}}>Мой ресторан 🏪</h1>
        <div style={{background: '#fef3c7', color: '#d97706', display: 'inline-block', padding: '4px 12px', borderRadius: '100px', fontSize: '12px', fontWeight: 800}}>
          Уровень {restaurantLevel}: {restaurantLevel === 1 ? 'Уличный ларек 🌭' : restaurantLevel === 2 ? 'Закусочная 🍔' : restaurantLevel === 3 ? 'Уютное кафе ☕️' : restaurantLevel === 4 ? 'Ресторан 🍽' : restaurantLevel === 5 ? 'Мишленовский ресторан ⭐️' : 'Сеть ресторанов 👑'}
        </div>
      </div>

      <div style={{display: 'flex', background: '#f1f5f9', padding: '6px', borderRadius: '20px', marginBottom: '25px', overflowX: 'auto', WebkitOverflowScrolling: 'touch'}}>
        <button onClick={() => setGameTab('kitchen')} style={{ flex: 1, minWidth: '80px', padding: '10px 5px', borderRadius: '16px', border: 'none', background: gameTab === 'kitchen' ? 'white' : 'transparent', fontWeight: 800, fontSize: '13px', boxShadow: gameTab === 'kitchen' ? '0 4px 15px rgba(0,0,0,0.05)' : 'none', color: gameTab === 'kitchen' ? '#f59e0b' : '#64748b', cursor: 'pointer', transition: 'all 0.2s' }}>Кухня</button>
        <button onClick={() => setGameTab('tasks')} style={{ flex: 1, minWidth: '80px', padding: '10px 5px', borderRadius: '16px', border: 'none', background: gameTab === 'tasks' ? 'white' : 'transparent', fontWeight: 800, fontSize: '13px', boxShadow: gameTab === 'tasks' ? '0 4px 15px rgba(0,0,0,0.05)' : 'none', color: gameTab === 'tasks' ? '#3b82f6' : '#64748b', cursor: 'pointer', transition: 'all 0.2s' }}>Задания</button>
        <button onClick={() => setGameTab('shop')} style={{ flex: 1, minWidth: '80px', padding: '10px 5px', borderRadius: '16px', border: 'none', background: gameTab === 'shop' ? 'white' : 'transparent', fontWeight: 800, fontSize: '13px', boxShadow: gameTab === 'shop' ? '0 4px 15px rgba(0,0,0,0.05)' : 'none', color: gameTab === 'shop' ? '#10b981' : '#64748b', cursor: 'pointer', transition: 'all 0.2s' }}>Прокачка</button>
        <button onClick={() => setGameTab('leaderboard')} style={{ flex: 1, minWidth: '80px', padding: '10px 5px', borderRadius: '16px', border: 'none', background: gameTab === 'leaderboard' ? 'white' : 'transparent', fontWeight: 800, fontSize: '13px', boxShadow: gameTab === 'leaderboard' ? '0 4px 15px rgba(0,0,0,0.05)' : 'none', color: gameTab === 'leaderboard' ? '#8b5cf6' : '#64748b', cursor: 'pointer', transition: 'all 0.2s' }}>Рейтинг</button>
      </div>

      {gameTab === 'kitchen' && (
        <div className="card animate-fade-in" style={{textAlign: 'center', padding: '30px 20px', position: 'relative', overflow: 'hidden'}}>
           {floatingClicks.map((click: any) => (
              <div key={click.id} className="float-coin" style={{left: click.x, top: click.y}}>
                +{click.val}
              </div>
           ))}
           <div style={{fontSize: '16px', color: '#64748b', fontWeight: 700, marginBottom: '5px'}}>Баланс</div>
           
           <div style={{fontSize: '32px', fontWeight: 900, color: '#111', lineHeight: 1, marginBottom: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}>
             {formatCooks(cooks)} <span style={{fontSize: '28px'}}>🍪</span>
           </div>

           <div style={{fontSize: '14px', color: '#10b981', fontWeight: 700, marginBottom: '30px'}}>
             {passiveIncome > 0 ? `+${passiveIncome} в сек.` : 'Нет пассивного дохода'}
           </div>
           
           <div 
             onPointerDown={handleCookClick}
             style={{
               width: '200px', height: '200px', margin: '0 auto', background: 'radial-gradient(circle, #fef3c7 0%, #fde68a 100%)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '80px', cursor: 'pointer', boxShadow: '0 20px 40px -10px rgba(245, 158, 11, 0.4), inset 0 -10px 20px rgba(217, 119, 6, 0.2)', userSelect: 'none', transition: 'transform 0.05s', WebkitTapHighlightColor: 'transparent'
             }}
           >
             🍳
           </div>
           
           <div style={{marginTop: '40px'}}>
             <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '13px', color: '#64748b', fontWeight: 700, marginBottom: '8px'}}>
                <div style={{textAlign: 'left'}}>
                  Энергия 
                  {energy < 500 && (
                    <div style={{fontSize: '11px', fontWeight: 500, color: '#9ca3af', marginTop: '2px'}}>
                      (полная через {Math.floor((500 - energy) / 60)}м {(500 - energy) % 60}с)
                    </div>
                  )}
                </div>
                <span>{energy} / 500 ⚡️</span>
             </div>
             <div style={{width: '100%', height: '12px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden'}}>
                <div style={{width: `${(energy / 500) * 100}%`, height: '100%', background: '#10b981', transition: 'width 0.2s'}} />
             </div>
           </div>
        </div>
      )}

      {gameTab === 'tasks' && (
        <div className="card animate-fade-in" style={{padding: '20px'}}>
          <h3 style={{marginTop: 0, marginBottom: '20px'}}>Задания для шефа</h3>
          
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '15px', borderRadius: '16px', marginBottom: '10px'}}>
            <div>
              <div style={{fontWeight: 800, fontSize: '15px', color: '#111', marginBottom: '4px'}}>Сгенерировать рецепт</div>
              <div style={{fontSize: '12px', color: '#64748b', fontWeight: 600}}>Награда: 100 куков (Раз в день)</div>
            </div>
            <button onClick={() => switchView('service')} style={{background: '#3b82f6', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '100px', fontWeight: 700, fontSize: '12px', cursor: 'pointer'}}>В поиск</button>
          </div>

          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '15px', borderRadius: '16px', marginBottom: '10px'}}>
            <div>
              <div style={{fontWeight: 800, fontSize: '15px', color: '#111', marginBottom: '4px'}}>Оценить коллег (лайки)</div>
              <div style={{fontSize: '12px', color: '#64748b', fontWeight: 600}}>Награда: (Скоро)</div>
            </div>
            <button onClick={() => switchView('feed')} style={{background: '#3b82f6', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '100px', fontWeight: 700, fontSize: '12px', cursor: 'pointer'}}>В ленту</button>
          </div>

          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '15px', borderRadius: '16px'}}>
            <div>
              <div style={{fontWeight: 800, fontSize: '15px', color: '#111', marginBottom: '4px'}}>Выложить фото блюда</div>
              <div style={{fontSize: '12px', color: '#64748b', fontWeight: 600}}>Награда: 1000 куков</div>
            </div>
            <button onClick={() => switchView('feed')} style={{background: '#3b82f6', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '100px', fontWeight: 700, fontSize: '12px', cursor: 'pointer'}}>В ленту</button>
          </div>
        </div>
      )}

      {gameTab === 'shop' && (
        <div className="card animate-fade-in" style={{padding: '20px'}}>
          <h3 style={{marginTop: 0, marginBottom: '20px'}}>Магазин улучшений</h3>
          
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fffbeb', padding: '15px', borderRadius: '16px', marginBottom: '10px', border: '1px solid #fef3c7'}}>
            <div>
              <div style={{fontWeight: 800, fontSize: '15px', color: '#b45309', marginBottom: '4px'}}>Новая лопатка</div>
              <div style={{fontSize: '12px', color: '#d97706', fontWeight: 600}}>+1 кук за клик</div>
            </div>
            <button 
              onClick={() => buyUpgrade('spatula')}
              disabled={cooks < (clickPower * 500)}
              style={{background: cooks >= (clickPower * 500) ? '#f59e0b' : '#fde68a', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '100px', fontWeight: 700, fontSize: '12px', cursor: cooks >= (clickPower * 500) ? 'pointer' : 'not-allowed', transition: 'all 0.2s'}}
            >
              {clickPower * 500} 🍪
            </button>
          </div>
          
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0fdf4', padding: '15px', borderRadius: '16px', marginBottom: '10px', border: '1px solid #dcfce7'}}>
            <div>
              <div style={{fontWeight: 800, fontSize: '15px', color: '#15803d', marginBottom: '4px'}}>Нанять су-шефа</div>
              <div style={{fontSize: '12px', color: '#16a34a', fontWeight: 600}}>+1 кук каждую секунду</div>
            </div>
            <button 
              onClick={() => buyUpgrade('souschef')}
              disabled={cooks < ((passiveIncome + 1) * 2000)}
              style={{background: cooks >= ((passiveIncome + 1) * 2000) ? '#22c55e' : '#bbf7d0', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '100px', fontWeight: 700, fontSize: '12px', cursor: cooks >= ((passiveIncome + 1) * 2000) ? 'pointer' : 'not-allowed', transition: 'all 0.2s'}}
            >
              {(passiveIncome + 1) * 2000} 🍪
            </button>
          </div>

          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '15px', borderRadius: '16px', border: '1px solid #e2e8f0'}}>
            <div>
              <div style={{fontWeight: 800, fontSize: '15px', color: '#1e293b', marginBottom: '4px'}}>Ремонт ресторана</div>
              <div style={{fontSize: '12px', color: '#64748b', fontWeight: 600}}>Перейти на Уровень {restaurantLevel + 1}</div>
            </div>
            {(() => {
              const restCost = restaurantLevel === 5 ? 100000 : restaurantLevel * 10000;
              return (
                <button 
                  onClick={() => buyUpgrade('restaurant')}
                  disabled={cooks < restCost || restaurantLevel >= 6}
                  style={{background: (cooks >= restCost && restaurantLevel < 6) ? '#3b82f6' : '#cbd5e1', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '100px', fontWeight: 700, fontSize: '12px', cursor: (cooks >= restCost && restaurantLevel < 6) ? 'pointer' : 'not-allowed', transition: 'all 0.2s'}}
                >
                  {restaurantLevel >= 6 ? "МАКС" : `${restCost} 🍪`}
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {gameTab === 'leaderboard' && (
        <div className="card animate-fade-in" style={{padding: '20px'}}>
          <h3 style={{marginTop: 0, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px'}}>
            <Trophy size={20} color="#f59e0b" /> Топ шеф-поваров
          </h3>
          
          {!user ? (
             <div style={{textAlign: 'center', color: '#9ca3af', padding: '20px'}}>
               <Lock size={32} style={{margin: '0 auto 10px auto', opacity: 0.5}} />
               Войдите в аккаунт, чтобы видеть мировой рейтинг и участвовать в нем.
             </div>
          ) : leaderboard.length === 0 ? (
             <div style={{textAlign: 'center', color: '#9ca3af', padding: '20px'}}>Загрузка рейтинга...</div>
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
              {leaderboard.map((lbUser: any, idx: number) => {
                const { isDev, devBadge, restBadge } = getUserBadges(lbUser.user_id, lbUser.restaurant_level);
                return (
                  <div key={idx} style={{display: 'flex', alignItems: 'center', gap: '12px', background: idx === 0 ? '#fffbeb' : idx === 1 ? '#f8fafc' : idx === 2 ? '#fff1f2' : 'white', padding: '12px', borderRadius: '16px', border: idx < 3 ? `1px solid ${idx === 0 ? '#fde68a' : idx === 1 ? '#e2e8f0' : '#fecdd3'}` : '1px solid #f1f5f9'}}>
                     <div style={{width: '24px', fontWeight: 900, color: idx === 0 ? '#d97706' : idx === 1 ? '#64748b' : idx === 2 ? '#be123c' : '#9ca3af', fontSize: '16px', textAlign: 'center', flexShrink: 0}}>
                       {idx + 1}
                     </div>
                     
                     {lbUser.user_avatar ? ( 
                        <img src={lbUser.user_avatar} alt="Avatar" style={{width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0}} /> 
                     ) : ( 
                        <div style={{width: '36px', height: '36px', borderRadius: '50%', background: '#e2e8f0', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 800, flexShrink: 0}}> 
                          {lbUser.user_name?.charAt(0).toUpperCase() || 'Ш'} 
                        </div> 
                     )}
                     
                     <div style={{flex: 1, minWidth: 0}}>
                       <div style={{fontWeight: 800, fontSize: '15px', color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                         {/* ВЫВОДИМ ИМЯ ПРОФИЛЯ (Как в ленте) */}
                         {lbUser.user_name || 'Анонимный шеф'}
                       </div>
                       {/* Выстраиваем в столбик: сначала разраб, потом ресторан */}
                       <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', marginTop: '4px'}}>
                         {isDev && devBadge}
                         {restBadge}
                       </div>
                     </div>
                     
                     <div style={{fontWeight: 900, color: '#f59e0b', fontSize: '14px', whiteSpace: 'nowrap', flexShrink: 0}}>
                       {lbUser.cooks} 🍪
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