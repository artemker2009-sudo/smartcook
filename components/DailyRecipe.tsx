import React from 'react';
import { Clock, Flame, Info, ExternalLink, ShoppingCart } from 'lucide-react';

interface DetailedIngredient {
  name: string;
  amount: string;
}

interface DailyRecipeProps {
  data: {
    title: string;
    description?: string;
    time: string;
    calories: string;
    ingredients?: string[];
    detailed_ingredients?: DetailedIngredient[];
    missing_ingredients?: string[]; 
    steps: string[];
    date?: string;
  } | null;
}

const cleanText = (text: string) => text.replace(/^\d+[\.\)]\s*/, '');

// 👇 ВОТ ЗДЕСЬ БЫЛА ОШИБКА. ДОЛЖНО БЫТЬ "export default function"
export default function DailyRecipe({ data }: DailyRecipeProps) {
  if (!data) return (
    <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
      <div className="animate-pulse">⏳ Шеф выбирает лучшее блюдо дня...</div>
    </div>
  );

  // Функция для красивого вывода калорий (чтобы не было "ккал ккал")
  const formatCalories = (cal: string) => {
    const clean = cal.replace(/ккал/gi, '').trim();
    return `${clean} ккал`;
  };

  return (
    <div className="card">
      <div style={{ marginBottom: '20px' }}>
        <div style={{ 
          fontSize: '12px', 
          fontWeight: 'bold', 
          color: '#f97316', 
          textTransform: 'uppercase', 
          letterSpacing: '1px',
          marginBottom: '5px' 
        }}>
          📅 Рецепт дня {data.date && `• ${data.date}`}
        </div>
        <h2 style={{ fontSize: '28px', fontWeight: '900', lineHeight: '1.2', margin: '0 0 10px 0' }}>
          {data.title}
        </h2>
        {data.description && (
          <p style={{ fontSize: '15px', color: '#4b5563', lineHeight: '1.5' }}>
            {data.description}
          </p>
        )}
      </div>

      <div className="recipe-tags" style={{ marginBottom: '25px' }}>
        <div className="tag-badge">
          <Clock size={16} /> {data.time.includes('мин') ? data.time : `${data.time} мин.`}
        </div>
        <div className="tag-badge orange">
          <Flame size={16} /> {formatCalories(data.calories)}
        </div>
      </div>

      {/* БЛОК ПОКУПОК (OZON) */}
      {data.missing_ingredients && data.missing_ingredients.length > 0 && (
        <div style={{
          background: '#fffbeb',
          border: '1px solid #fcd34d',
          borderRadius: '12px',
          padding: '15px',
          marginBottom: '25px',
          color: '#92400e'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontWeight: 800 }}>
            <ShoppingCart size={20} /> Купить ингредиенты:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
            {data.missing_ingredients.map((item, idx) => (
              <a
                key={idx}
                href={`https://www.ozon.ru/search/?text=${encodeURIComponent(item)}&from_global=true`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: '#fef3c7',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  color: '#92400e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: '1px solid #fcd34d',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {item} <ExternalLink size={12} style={{ opacity: 0.6 }} />
              </a>
            ))}
          </div>
          <div style={{ fontSize: '12px', color: '#b45309', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Info size={14} /> Заказать быструю доставку Ozon Fresh до двери
          </div>
        </div>
      )}

      {/* ПОДРОБНЫЕ ИНГРЕДИЕНТЫ */}
      {data.detailed_ingredients ? (
        <div className="ing-box">
          <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Ингредиенты (1 порция)</h3>
          {data.detailed_ingredients.map((ing, i) => (
            <div key={i} className="ing-row">
              <span>{ing.name}</span> <span className="ing-val">{ing.amount}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="ing-box">
          <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Ингредиенты</h3>
          {data.ingredients?.map((ing, i) => (
            <div key={i} className="ing-row">
              <span>{ing}</span>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '20px' }}>👨‍🍳 Как готовить</h3>
      <div>
        {data.steps.map((step, i) => (
          <div key={i} className="step-row">
            <div className="step-num">{i + 1}</div>
            <div className="step-text">{cleanText(step)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}