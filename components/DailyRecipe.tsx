import React from 'react';
import { Clock, Flame, Info, ExternalLink, ShoppingCart } from 'lucide-react';

interface DetailedIngredient {
  name: string;
  amount: string;
}

interface DailyRecipeProps {
  data: any; // Ставим any, чтобы принять любые данные и не упасть
}

// Безопасная очистка текста
const safeString = (val: any) => {
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  return "";
};

const cleanText = (text: any) => safeString(text).replace(/^\d+[\.\)]\s*/, '');

export default function DailyRecipe({ data }: DailyRecipeProps) {
  // 1. Если данных нет - заглушка
  if (!data) return (
    <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
      <div className="animate-pulse">⏳ Шеф загружает рецепт...</div>
    </div>
  );

  // 2. Извлекаем данные безопасно
  const title = safeString(data.title) || "Без названия";
  const description = safeString(data.description);
  const time = safeString(data.time);
  const calories = safeString(data.calories);
  const date = safeString(data.date);
  
  // Проверяем массивы
  const steps = Array.isArray(data.steps) ? data.steps : [];
  const missing = Array.isArray(data.missing_ingredients) ? data.missing_ingredients : [];
  const detailed = Array.isArray(data.detailed_ingredients) ? data.detailed_ingredients : [];
  const simpleIngs = Array.isArray(data.ingredients) ? data.ingredients : [];

  const formatCalories = (cal: string) => {
    return cal.replace(/ккал/gi, '').trim() + " ккал";
  };

  return (
    <div className="card">
      <div style={{ marginBottom: '20px' }}>
        <div style={{ 
          fontSize: '12px', fontWeight: 'bold', color: '#f97316', 
          textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '5px' 
        }}>
          📅 Рецепт дня {date && `• ${date}`}
        </div>
        <h2 style={{ fontSize: '28px', fontWeight: '900', lineHeight: '1.2', margin: '0 0 10px 0' }}>
          {title}
        </h2>
        {description && (
          <p style={{ fontSize: '15px', color: '#4b5563', lineHeight: '1.5' }}>
            {description}
          </p>
        )}
      </div>

      <div className="recipe-tags" style={{ marginBottom: '25px' }}>
        <div className="tag-badge">
          <Clock size={16} /> {time.includes('мин') ? time : `${time} мин.`}
        </div>
        {calories && (
          <div className="tag-badge orange">
            <Flame size={16} /> {formatCalories(calories)}
          </div>
        )}
      </div>

      {/* ПОКУПКИ */}
      {missing.length > 0 && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fcd34d',
          borderRadius: '12px', padding: '15px', marginBottom: '25px', color: '#92400e'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontWeight: 800 }}>
            <ShoppingCart size={20} /> Купить ингредиенты:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
            {missing.map((item: any, idx: number) => (
              <a
                key={idx}
                href={`https://www.ozon.ru/search/?text=${encodeURIComponent(safeString(item))}&from_global=true`}
                target="_blank" rel="noopener noreferrer"
                style={{
                  background: '#fef3c7', padding: '6px 12px', borderRadius: '8px',
                  fontSize: '14px', fontWeight: 600, textDecoration: 'none', color: '#92400e',
                  display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #fcd34d'
                }}
              >
                {safeString(item)} <ExternalLink size={12} style={{ opacity: 0.6 }} />
              </a>
            ))}
          </div>
          <div style={{ fontSize: '12px', color: '#b45309', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Info size={14} /> Заказать быструю доставку Ozon Fresh
          </div>
        </div>
      )}

      {/* ИНГРЕДИЕНТЫ */}
      <div className="ing-box">
        <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Ингредиенты</h3>
        {detailed.length > 0 ? (
          detailed.map((ing: any, i: number) => (
            <div key={i} className="ing-row">
              <span>{safeString(ing.name)}</span> 
              <span className="ing-val">{safeString(ing.amount)}</span>
            </div>
          ))
        ) : (
          simpleIngs.map((ing: any, i: number) => (
            <div key={i} className="ing-row"><span>{safeString(ing)}</span></div>
          ))
        )}
      </div>

      <h3 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '20px' }}>👨‍🍳 Как готовить</h3>
      <div>
        {steps.length > 0 ? (
          steps.map((step: any, i: number) => (
            <div key={i} className="step-row">
              <div className="step-num">{i + 1}</div>
              <div className="step-text">{cleanText(step)}</div>
            </div>
          ))
        ) : (
          <div>Инструкция не загрузилась. Попробуйте обновить страницу.</div>
        )}
      </div>
    </div>
  );
}