import React from 'react';
import { Clock, Flame, Info, ExternalLink, ShoppingCart } from 'lucide-react';

// Типы данных
interface DetailedIngredient {
  name: string;
  amount: string;
}

interface DailyRecipeProps {
  data: any; // Используем any, чтобы компонент был "всеядным" и не падал от ошибок типов
}

// 1. Умная функция очистки текста
const cleanText = (text: any) => {
  if (!text) return "";
  // Превращаем в строку и удаляем нумерацию в начале (1., Шаг 1 и т.д.)
  return String(text).replace(/^(Шаг \d+|Step \d+|\d+[\.\)])[:\s]*/i, '').trim();
};

// 2. ЗАЩИТА ОТ БЕЛОГО ЭКРАНА: Гарантируем, что это массив
const ensureArray = (item: any): any[] => {
  if (!item) return [];
  if (Array.isArray(item)) return item;
  // Если пришла просто строка, кладем её в массив, чтобы map сработал
  if (typeof item === 'string') return [item];
  return [];
};

export default function DailyRecipe({ data }: DailyRecipeProps) {
  // Если данных нет, показываем красивую загрузку
  if (!data) return (
    <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
      <div className="animate-pulse">⏳ Шеф загружает рецепт...</div>
    </div>
  );

  // Если вдруг пришла ошибка вместо рецепта
  if (data.error) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '20px', color: 'red' }}>
        <h3>Упс, ошибка кухни</h3>
        <p>{data.error}</p>
      </div>
    );
  }

  // Безопасное извлечение данных
  const title = data.title || "Рецепт дня";
  const description = data.description || "";
  // Время и калории приводим к строке
  const time = data.time ? String(data.time) : "";
  const calories = data.calories ? String(data.calories) : "";
  const date = data.date || "";

  // 3. Используем защитную функцию для всех списков
  const steps = ensureArray(data.steps);
  const detailedIngs = ensureArray(data.detailed_ingredients);
  const simpleIngs = ensureArray(data.ingredients);
  const missingIngs = ensureArray(data.missing_ingredients);

  // Форматирование калорий
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

      {/* БЛОК ПОКУПОК (OZON) */}
      {missingIngs.length > 0 && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fcd34d',
          borderRadius: '12px', padding: '15px', marginBottom: '25px', color: '#92400e'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontWeight: 800 }}>
            <ShoppingCart size={20} /> Купить ингредиенты:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
            {missingIngs.map((item: any, idx: number) => (
              <a
                key={idx}
                href={`https://www.ozon.ru/search/?text=${encodeURIComponent(String(item))}&from_global=true`}
                target="_blank" rel="noopener noreferrer"
                style={{
                  background: '#fef3c7', padding: '6px 12px', borderRadius: '8px',
                  fontSize: '14px', fontWeight: 600, textDecoration: 'none', color: '#92400e',
                  display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #fcd34d'
                }}
              >
                {String(item)} <ExternalLink size={12} style={{ opacity: 0.6 }} />
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
        {detailedIngs.length > 0 ? (
          detailedIngs.map((ing: any, i: number) => (
            <div key={i} className="ing-row">
              {/* Проверяем, объект это или строка */}
              <span>{typeof ing === 'object' ? ing.name : ing}</span> 
              {typeof ing === 'object' && ing.amount && (
                 <span className="ing-val">{ing.amount}</span>
              )}
            </div>
          ))
        ) : (
          simpleIngs.map((ing: any, i: number) => (
            <div key={i} className="ing-row"><span>{String(ing)}</span></div>
          ))
        )}
        {detailedIngs.length === 0 && simpleIngs.length === 0 && (
          <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>Список ингредиентов не загрузился</div>
        )}
      </div>

      {/* ШАГИ ПРИГОТОВЛЕНИЯ */}
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
          <div style={{ color: '#6b7280' }}>Инструкция по приготовлению пока не готова.</div>
        )}
      </div>
    </div>
  );
}