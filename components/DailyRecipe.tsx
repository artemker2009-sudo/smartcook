import React from 'react';
import { Clock, Flame, Info, ExternalLink, ShoppingCart, Heart, Share2, Sparkles, Send, Salad, ChefHat } from 'lucide-react';

export default function DailyRecipe(props: any) {
  const {
    dailyError, dailyRecipe, dailyFavoriteId, toggleDailyFavorite, handleShareDaily,
    formatTime, formatCalories, cleanText, question, setQuestion, handleAskChef, answer, asking
  } = props;

  return (
    <div style={{marginTop: 'var(--space-5)', paddingBottom: 'var(--space-4)'}}>

      {/* --- ШАПКА РЕЦЕПТА ДНЯ --- */}
      <div style={{background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%)', borderRadius: 'var(--radius-md)', padding: 'var(--space-5) var(--space-3) var(--space-5) var(--space-3)', color: 'white', textAlign: 'center', boxShadow: '0 10px 20px rgba(5, 150, 105, 0.2)', position: 'relative', zIndex: 1}}>
         <div style={{fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-accent-subtle)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)'}}>
           <Flame size={14} fill="var(--color-accent-subtle)" /> РЕЦЕПТ ДНЯ {dailyRecipe?.date && `• ${dailyRecipe.date}`}
         </div>

         {dailyRecipe ? (
           <>
             <h2 style={{fontSize: 'var(--font-size-title)', fontWeight: 'var(--font-weight-semibold)', margin: '0 0 var(--space-3) 0', lineHeight: 1.1}}>{dailyRecipe.title}</h2>
             {dailyRecipe.description && (
               <p style={{opacity: 0.95, fontSize: 'var(--font-size-body)', margin: '0 auto var(--space-4) auto', maxWidth: '400px', lineHeight: 1.5}}>
                 {dailyRecipe.description}
               </p>
             )}

             {/* ТЕГИ (ВРЕМЯ И КАЛОРИИ) */}
             <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center' }}>
               {dailyRecipe.time && (
                 <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', background: 'var(--color-surface)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-accent-hover)', boxShadow: '0 4px 15px rgba(0,0,0,0.15)' }}>
                   <Clock size={16} /> {formatTime(String(dailyRecipe.time))}
                 </div>
               )}
               {dailyRecipe.calories && (
                 <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', background: 'var(--color-surface)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-accent-hover)', boxShadow: '0 4px 15px rgba(0,0,0,0.15)' }}>
                   <Flame size={16} /> {formatCalories(String(dailyRecipe.calories))}
                 </div>
               )}
             </div>
           </>
         ) : (
           <h2 style={{fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-semibold)', margin: 0}}>Специально для вас...</h2>
         )}
      </div>

      {/* --- БЕЛАЯ КАРТОЧКА --- */}
      <div style={{marginTop: 'calc(-1 * var(--space-4))', padding: '0 var(--space-2)', position: 'relative', zIndex: 10}}>
        {dailyError ? (
          <div className="card" style={{textAlign: 'center', color: 'var(--color-danger)', padding: 'var(--space-4)'}}>
            Не удалось загрузить рецепт дня. Попробуйте позже.
          </div>
        ) : !dailyRecipe ? (
          <div className="card" style={{textAlign: 'center', color: 'var(--color-text-secondary)', padding: 'var(--space-5) var(--space-3)'}}>
            <Sparkles className="animate-spin" size={36} color="var(--color-accent)" style={{margin: '0 auto var(--space-3) auto'}} />
            <div style={{fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)'}}>Готовим шедевр...</div>
          </div>
        ) : (
          <div className="card">

            <div style={{display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)'}}>
              <button onClick={toggleDailyFavorite} style={{flex: 1, padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', background: dailyFavoriteId ? 'var(--color-danger-subtle)' : 'var(--color-bg)', color: dailyFavoriteId ? '#dc2626' : 'var(--color-text-secondary)', border: dailyFavoriteId ? '1px solid #fca5a5' : '1px solid var(--color-border)', fontWeight: 'var(--font-weight-semibold)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', cursor: 'pointer', transition: 'all 0.2s'}}>
                <Heart size={18} fill={dailyFavoriteId ? "#dc2626" : "none"} />
                {dailyFavoriteId ? "В избранном" : "Сохранить"}
              </button>
              <button onClick={handleShareDaily} style={{flex: 1, padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', fontWeight: 'var(--font-weight-semibold)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', cursor: 'pointer', transition: 'all 0.2s'}}>
                <Share2 size={18} /> Поделиться
              </button>
            </div>

            {/* Ozon Fresh */}
            {(() => {
              const itemsToBuy = dailyRecipe.detailed_ingredients ? dailyRecipe.detailed_ingredients.map((ing: any) => ing.name) : (dailyRecipe.ingredients || []);
              if (itemsToBuy.length === 0) return null;
              return (
                <div style={{ background: 'var(--color-warning-subtle)', border: '1px solid var(--color-warning)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)', margin: '0 0 var(--space-4) 0', color: 'var(--color-warning)' }}>
                  <div style={{display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', fontWeight: 'var(--font-weight-semibold)'}}> <ShoppingCart size={20} /> Нужно купить: </div>
                  <div style={{display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-2)'}}>
                    {itemsToBuy.map((item: string, idx: number) => ( <a key={idx} href={`https://www.ozon.ru/search/?text=${encodeURIComponent(item)}&from_global=true`} target="_blank" rel="noopener noreferrer" style={{ background: 'var(--color-surface)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-medium)', textDecoration: 'none', color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)', border: '1px solid var(--color-warning)', transition: 'transform 0.2s' }}> {item} <ExternalLink size={12} style={{opacity: 0.5}} /> </a> ))}
                  </div>
                  <div style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)', opacity: 0.8}}> <Info size={14} /> Нажмите на ингредиент, чтобы заказать доставку Ozon Fresh </div>
                </div>
              );
            })()}

            <h4 style={{fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-semibold)', margin: '0 0 var(--space-3) 0', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)'}}><Salad size={20} /> Ингредиенты:</h4>
            <div style={{display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-5)'}}>
              {dailyRecipe.detailed_ingredients ? dailyRecipe.detailed_ingredients.map((ing: any, i: number) => (
                 <div key={i} style={{padding: 'var(--space-3)', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-body)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                   <span style={{fontWeight: 'var(--font-weight-medium)'}}>{ing.name}</span>
                   <span style={{color: 'var(--color-accent-hover)', fontWeight: 'var(--font-weight-semibold)', background: 'var(--color-accent-subtle)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-caption)'}}>{ing.amount}</span>
                 </div>
              )) : dailyRecipe.ingredients?.map((ing: string, i: number) => (
                 <div key={i} style={{padding: 'var(--space-3)', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-body)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', fontWeight: 'var(--font-weight-medium)'}}>
                   {ing}
                 </div>
              ))}
            </div>

            <h4 style={{fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-semibold)', margin: '0 0 var(--space-4) 0', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)'}}><ChefHat size={20} /> Приготовление:</h4>
            <div style={{display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-5)'}}>
              {dailyRecipe.steps?.map((step: string, i: number) => (
                <div key={i} style={{display: 'flex', gap: 'var(--space-3)'}}>
                  <div style={{flexShrink: 0, width: '32px', height: '32px', background: 'var(--color-accent)', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)'}}>
                    {i + 1}
                  </div>
                  <div style={{flex: 1, paddingTop: 'var(--space-1)', fontSize: 'var(--font-size-body)', lineHeight: '1.6', color: 'var(--color-text-secondary)'}}>
                    {cleanText(step)}
                  </div>
                </div>
              ))}
            </div>

            {/* Блок: Вопрос Шефу */}
            <div className="chat-box">
              <div style={{fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-4)', color: 'var(--color-text)', fontSize: 'var(--font-size-heading)', textAlign: 'center'}}>
                Задайте вопрос AI шеф-повару!
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'flex-start', width: '100%'}}>
                <div style={{fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)', color: 'var(--color-text-secondary)', paddingLeft: 'var(--space-1)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)'}}>
                  <Sparkles size={16} /> Спросить AI Шефа:
                </div>
                <div style={{display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end', width: '100%'}}>
                  <textarea
                    value={question}
                    onChange={(e) => {
                      setQuestion(e.target.value);
                      e.target.style.height = '44px';
                      e.target.style.height = (e.target.scrollHeight < 120 ? e.target.scrollHeight : 120) + 'px';
                    }}
                    rows={1}
                    disabled={asking}
                    className="chat-input"
                    style={{flex: 1, width: '100%', background: asking ? 'var(--color-bg)' : 'var(--color-surface)', resize: 'none', overflowY: 'auto', height: '44px', minHeight: '44px', maxHeight: '120px', lineHeight: '18px', fontFamily: 'inherit'}}
                  />
                  <button onClick={handleAskChef} disabled={asking || !question.trim()} style={{flexShrink: 0, padding: 0, width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: (asking || !question.trim()) ? 'var(--color-border)' : 'var(--color-accent)', color: 'white', border: 'none', cursor: (asking || !question.trim()) ? 'default' : 'pointer'}}>
                    <Send size={18} style={{marginLeft: '-2px'}} />
                  </button>
                </div>
              </div>
              {asking && (
                <div style={{marginTop: 'var(--space-3)', color: 'var(--color-accent)', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-medium)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', justifyContent: 'center'}}>
                  <Sparkles className="animate-spin" size={16} /> Шеф-повар думает над ответом...
                </div>
              )}
              {answer && !asking && (
                <div style={{marginTop: 'var(--space-4)', lineHeight: 1.5, background: 'var(--color-surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-caption)', color: 'var(--color-text)'}}>
                  <strong>Ответ:</strong> {answer}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
