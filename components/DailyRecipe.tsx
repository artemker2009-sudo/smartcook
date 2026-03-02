import React from 'react';
import { Clock, Flame, Info, ExternalLink, ShoppingCart, Heart, Share2, Sparkles, Send } from 'lucide-react';

export default function DailyRecipe(props: any) {
  const { 
    dailyError, dailyRecipe, dailyFavoriteId, toggleDailyFavorite, handleShareDaily, 
    formatTime, formatCalories, cleanText, question, setQuestion, handleAskChef, answer 
  } = props;

  return (
    <div style={{marginTop: '60px', paddingBottom: '40px'}}>
      
      {/* --- КРАСИВЫЙ ОРАНЖЕВЫЙ БЛОК ШАПКИ --- */}
      <div style={{background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', borderRadius: '0 0 32px 32px', padding: '40px 20px 60px 20px', margin: '-20px -20px 0 -20px', color: 'white', textAlign: 'center', boxShadow: '0 10px 20px rgba(234, 88, 12, 0.2)'}}>
         <div style={{fontSize: '11px', fontWeight: '800', color: '#ffedd5', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'}}>
           <Flame size={14} fill="#ffedd5" /> РЕЦЕПТ ДНЯ {dailyRecipe?.date && `• ${dailyRecipe.date}`}
         </div>
         
         {dailyRecipe ? (
           <>
             <h2 style={{fontSize: '32px', fontWeight: 900, margin: '0 0 15px 0', lineHeight: 1.1}}>{dailyRecipe.title}</h2>
             {dailyRecipe.description && (
               <p style={{opacity: 0.95, fontSize: '15px', margin: '0 auto 20px auto', maxWidth: '400px', lineHeight: 1.5}}>
                 {dailyRecipe.description}
               </p>
             )}
             
             {/* ТЕГИ (ВРЕМЯ И КАЛОРИИ) ПЕРЕЕХАЛИ СЮДА */}
             <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
               {dailyRecipe.time && (
                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(5px)', padding: '6px 14px', borderRadius: '100px', fontSize: '14px', fontWeight: '600', color: 'white' }}>
                   <Clock size={16} /> {formatTime(String(dailyRecipe.time))}
                 </div>
               )}
               {dailyRecipe.calories && (
                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(5px)', padding: '6px 14px', borderRadius: '100px', fontSize: '14px', fontWeight: '600', color: 'white' }}>
                   <Flame size={16} /> {formatCalories(String(dailyRecipe.calories))}
                 </div>
               )}
             </div>
           </>
         ) : (
           <h2 style={{fontSize: '24px', fontWeight: 900, margin: 0}}>Специально для вас...</h2>
         )}
      </div>

      {/* --- БЕЛАЯ КАРТОЧКА С ИНГРЕДИЕНТАМИ --- */}
      <div style={{marginTop: '-30px', padding: '0 5px'}}>
        {dailyError ? (
          <div className="card" style={{textAlign: 'center', color: '#ef4444', padding: '30px', background: 'white', borderRadius: '24px'}}>
            Не удалось загрузить рецепт дня. Попробуйте позже.
          </div>
        ) : !dailyRecipe ? (
          <div className="card" style={{textAlign: 'center', color: '#ea580c', padding: '50px 20px', background: 'white', borderRadius: '24px'}}>
            <Sparkles className="animate-spin" size={36} style={{margin: '0 auto 15px auto'}} />
            <div style={{fontWeight: 800, fontSize: '16px'}}>Готовим шедевр...</div>
          </div>
        ) : (
          <div className="card" style={{padding: '25px', background: 'white', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.08)'}}>

            <div style={{display: 'flex', gap: '10px', marginBottom: '25px'}}>
              <button onClick={toggleDailyFavorite} style={{flex: 1, padding: '12px', borderRadius: '12px', background: dailyFavoriteId ? '#fee2e2' : '#f8fafc', color: dailyFavoriteId ? '#ef4444' : '#475569', border: dailyFavoriteId ? '1px solid #fca5a5' : '1px solid #e2e8f0', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', transition: 'all 0.2s'}}>
                <Heart size={18} fill={dailyFavoriteId ? "#ef4444" : "none"} />
                {dailyFavoriteId ? "В избранном" : "Сохранить"}
              </button>
              <button onClick={handleShareDaily} style={{flex: 1, padding: '12px', borderRadius: '12px', background: '#e0f2fe', color: '#0ea5e9', border: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', transition: 'all 0.2s'}}>
                <Share2 size={18} /> Поделиться
              </button>
            </div>

            {/* Ozon Fresh */}
            {(() => { 
              const itemsToBuy = dailyRecipe.detailed_ingredients ? dailyRecipe.detailed_ingredients.map((ing: any) => ing.name) : (dailyRecipe.ingredients || []); 
              if (itemsToBuy.length === 0) return null; 
              return ( 
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '16px', padding: '20px', margin: '0 0 25px 0', color: '#92400e' }}> 
                  <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontWeight: 800}}> <ShoppingCart size={20} /> Нужно купить: </div> 
                  <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px'}}> 
                    {itemsToBuy.map((item: string, idx: number) => ( <a key={idx} href={`https://www.ozon.ru/search/?text=${encodeURIComponent(item)}&from_global=true`} target="_blank" rel="noopener noreferrer" style={{ background: '#ffffff', padding: '8px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #fcd34d', boxShadow: '0 2px 5px rgba(252, 211, 77, 0.2)', transition: 'transform 0.2s' }}> {item} <ExternalLink size={12} style={{opacity: 0.5}} /> </a> ))} 
                  </div> 
                  <div style={{fontSize: '12px', color: '#b45309', display: 'flex', alignItems: 'center', gap: '5px', opacity: 0.8}}> <Info size={14} /> Нажмите на ингредиент, чтобы найти в Ozon Fresh </div> 
                </div> 
              ); 
            })()}

            <h4 style={{fontSize: '20px', fontWeight: 800, margin: '0 0 15px 0', color: '#111'}}>🥬 Ингредиенты:</h4>
            <div style={{display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '30px'}}>
              {dailyRecipe.detailed_ingredients ? dailyRecipe.detailed_ingredients.map((ing: any, i: number) => (
                 <div key={i} style={{padding: '14px 16px', background: '#f8fafc', borderRadius: '12px', fontSize: '15px', color: '#374151', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                   <span style={{fontWeight: 600}}>{ing.name}</span>
                   <span style={{color: '#ea580c', fontWeight: 800, background: '#ffedd5', padding: '4px 8px', borderRadius: '6px', fontSize: '13px'}}>{ing.amount}</span>
                 </div>
              )) : dailyRecipe.ingredients?.map((ing: string, i: number) => (
                 <div key={i} style={{padding: '14px 16px', background: '#f8fafc', borderRadius: '12px', fontSize: '15px', color: '#374151', border: '1px solid #e2e8f0', fontWeight: 600}}>
                   {ing}
                 </div>
              ))}
            </div>

            <h4 style={{fontSize: '20px', fontWeight: 800, margin: '0 0 20px 0', color: '#111'}}>👨‍🍳 Приготовление:</h4>
            <div style={{display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '30px'}}>
              {dailyRecipe.steps?.map((step: string, i: number) => (
                <div key={i} style={{display: 'flex', gap: '15px'}}>
                  {/* Светлый стильный кружок вместо черного */}
                  <div style={{flexShrink: 0, width: '32px', height: '32px', background: '#ffedd5', color: '#ea580c', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '14px', border: '2px solid #fdba74'}}>
                    {i + 1}
                  </div>
                  <div style={{flex: 1, paddingTop: '4px', fontSize: '15px', lineHeight: '1.6', color: '#374151'}}>
                    {cleanText(step)}
                  </div>
                </div>
              ))}
            </div>

            {/* Блок: Вопрос Шефу */}
            <div style={{background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '20px', padding: '20px', marginTop: '30px'}}> 
              <div style={{fontWeight: 800, marginBottom: '15px', color: '#0369a1', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px'}}> 
                <Sparkles size={18} /> Спросить AI Шефа: 
              </div> 
              <div style={{display: 'flex', gap: '10px', alignItems: 'flex-end', width: '100%'}}> 
                <textarea 
                  placeholder="Чем заменить сливки?" 
                  value={question} 
                  onChange={(e) => {
                    setQuestion(e.target.value);
                    e.target.style.height = '44px';
                    e.target.style.height = (e.target.scrollHeight < 120 ? e.target.scrollHeight : 120) + 'px';
                  }} 
                  rows={1}
                  style={{ flex: 1, width: '100%', padding: '12px 16px', borderRadius: '22px', border: '1px solid #93c5fd', fontSize: '15px', outline: 'none', background: 'white', resize: 'none', overflowY: 'auto', height: '44px', minHeight: '44px', maxHeight: '120px', boxSizing: 'border-box', lineHeight: '18px', fontFamily: 'inherit' }}
                /> 
                <button onClick={handleAskChef} style={{flexShrink: 0, padding: 0, width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: '#0ea5e9', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 4px 10px rgba(14, 165, 233, 0.3)'}}> <Send size={18} style={{marginLeft: '-2px'}}/> </button> 
              </div> 
              {answer && <div style={{marginTop: '15px', lineHeight: 1.5, background: 'white', padding: '15px', borderRadius: '16px', border: '1px solid #e0f2fe', fontSize: '14px', color: '#0f172a'}}><strong>Ответ:</strong> {answer}</div>} 
            </div>

          </div>
        )}
      </div>
    </div>
  );
}