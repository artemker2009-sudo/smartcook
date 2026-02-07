"use client";

import { Clock, Flame, CheckCircle, Sparkles, ChefHat } from "lucide-react";

interface DailyRecipeProps {
  data: any;
}

export default function DailyRecipe({ data }: DailyRecipeProps) {
  
  // Состояние загрузки (красивый скелетон)
  if (!data) {
    return (
      <div className="daily-full-card" style={{padding: '60px 20px', textAlign: 'center'}}>
         <Sparkles className="animate-spin" size={48} color="#f97316" style={{margin: '0 auto 20px auto'}} />
         <div style={{fontSize: '20px', fontWeight: 800, color: '#111'}}>Шеф выбирает блюдо дня...</div>
         <div style={{color: '#9ca3af', marginTop: '10px'}}>Анализируем свежие продукты</div>
      </div>
    );
  }

  const cleanText = (text: string) => text.replace(/^\d+[\.\)]\s*/, '');

  return (
    <div className="daily-full-card">
      
      {/* 1. HERO HEADER (Оранжевая подложка) */}
      <div className="daily-hero-bg">
        <div className="daily-badge-lg">
          <Flame size={18} fill="white" /> Рецепт дня
        </div>
        
        <h1 className="daily-title-lg">
          {data.title}
        </h1>
        
        <p className="daily-desc">
          {data.description}
        </p>

        <div className="daily-meta-row">
          <div className="daily-meta-pill">
            <Clock size={20} color="#4b5563" /> {data.time}
          </div>
          <div className="daily-meta-pill" style={{color: '#ea580c', background: '#fff7ed'}}>
            <Flame size={20} color="#ea580c" /> {data.calories}
          </div>
        </div>
      </div>

      {/* 2. CONTENT (Белый фон) */}
      <div className="daily-content">
        
        {/* Ингредиенты */}
        <div className="daily-section-title">
          <CheckCircle size={28} color="#059669" fill="#d1fae5" /> 
          Ингредиенты
        </div>
        
        <div className="daily-ing-grid">
          {data.ingredients?.map((ing: string, i: number) => (
            <div key={i} className="daily-ing-item">
              {ing}
            </div>
          ))}
        </div>

        {/* Инструкция */}
        <div className="daily-section-title">
          <ChefHat size={28} color="#111" /> 
          Как готовить
        </div>

        <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
          {data.steps?.map((step: string, i: number) => (
            <div key={i} className="daily-step">
               <div className="daily-step-num">
                 {i + 1}
               </div>
               <div className="daily-step-text">
                 {cleanText(step)}
               </div>
            </div>
          ))}
        </div>

        {/* Футер */}
        <div className="daily-footer">
           ✨ Понравилось? Возвращайся завтра за новым секретным рецептом!
        </div>

      </div>
    </div>
  );
}