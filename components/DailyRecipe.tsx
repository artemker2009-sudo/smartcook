import React from 'react';
import { Clock, Flame, Info, ExternalLink, ShoppingCart } from 'lucide-react';

// --- ТИПЫ ДАННЫХ ---
interface DetailedIngredient {
  name: string;
  amount: string;
}

interface DailyRecipeProps {
  data: any; // Используем any для безопасности (чтобы не падало при несовпадении типов)
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

// Безопасное преобразование в массив
const ensureArray = (item: any): any[] => {
  if (!item) return [];
  if (Array.isArray(item)) return item;
  if (typeof item === 'string') return [item];
  return [];
};

// Безопасное получение строки
const safeString = (val: any) => {
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  return "";
};

// Очистка текста шагов
const cleanText = (text: any) => {
  return safeString(text).replace(/^(Шаг \d+|Step \d+|\d+[\.\)])[:\s]*/i, '').trim();
};

// Красивый формат калорий
const formatCalories = (cal: string) => {
  const clean = cal.replace(/ккал/gi, '').trim();
  return clean ? `${clean} ккал` : "";
};

// --- КОМПОНЕНТ ---
export default function DailyRecipe({ data }: DailyRecipeProps) {
  
  // 1. ЗАГЛУШКА ПРИ ЗАГРУЗКЕ
  if (!data) return (
    <div style={{ 
      background: 'white', 
      borderRadius: '24px', 
      padding: '40px', 
      textAlign: 'center', 
      boxShadow: '0 10px 40px -10px rgba(0,0,0,0.1)' 
    }}>
      <div className="animate-pulse" style={{ color: '#9ca3af', fontWeight: 500 }}>
        ⏳ Шеф выбирает лучшее блюдо дня...
      </div>
    </div>
  );

  // 2. ЕСЛИ ОШИБКА API
  if (data.error) {
    return (
      <div style={{ 
        background: '#fef2f2', 
        borderRadius: '24px', 
        padding: '30px', 
        textAlign: 'center', 
        color: '#dc2626',
        border: '1px solid #fecaca'
      }}>
        <h3 style={{ margin: 0, fontSize: '18px' }}>Упс, на кухне заминка</h3>
        <p style={{ margin: '10px 0 0 0', opacity: 0.8 }}>{data.error}</p>
      </div>
    );
  }

  // 3. ПОДГОТОВКА ДАННЫХ
  const title = safeString(data.title) || "Секретное блюдо";
  const description = safeString(data.description);
  const time = safeString(data.time);
  const calories = safeString(data.calories);
  const date = safeString(data.date);
  
  const steps = ensureArray(data.steps);
  const detailedIngs = ensureArray(data.detailed_ingredients);
  const simpleIngs = ensureArray(data.ingredients);
  const missingIngs = ensureArray(data.missing_ingredients);

  return (
    <div style={{
      background: 'white',
      borderRadius: '24px',
      padding: '25px',
      boxShadow: '0 10px 40px -10px rgba(0,0,0,0.08)',
      marginBottom: '30px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Декоративный фон сверху */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '6px',
        background: 'linear-gradient(90deg, #f97316, #fbbf24)'
      }} />

      {/* ЗАГОЛОВОК */}
      <div style={{ marginBottom: '25px' }}>
        <div style={{ 
          fontSize: '11px', 
          fontWeight: '800', 
          color: '#f97316', 
          textTransform: 'uppercase', 
          letterSpacing: '1.5px', 
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <Flame size={14} fill="#f97316" /> РЕЦЕПТ ДНЯ {date && `• ${date}`}
        </div>
        <h2 style={{ 
          fontSize: '28px', 
          fontWeight: '900', 
          lineHeight: '1.1', 
          margin: '0 0 12px 0', 
          color: '#111827' 
        }}>
          {title}
        </h2>
        {description && (
          <p style={{ fontSize: '15px', color: '#4b5563', lineHeight: '1.6', margin: 0 }}>
            {description}
          </p>
        )}
      </div>

      {/* ТЕГИ (ВРЕМЯ И КАЛОРИИ) */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
        {time && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: '#f3f4f6', padding: '6px 14px', borderRadius: '100px',
            fontSize: '14px', fontWeight: '600', color: '#374151'
          }}>
            <Clock size={16} /> {time.includes('мин') ? time : `${time} мин.`}
          </div>
        )}
        {calories && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: '#fff7ed', padding: '6px 14px', borderRadius: '100px',
            fontSize: '14px', fontWeight: '600', color: '#ea580c'
          }}>
            <Flame size={16} /> {formatCalories(calories)}
          </div>
        )}
      </div>

      {/* БЛОК ПОКУПОК (ЖЕЛТЫЙ) */}
      {missingIngs.length > 0 && (
        <div style={{
          background: '#fffbeb',
          border: '1px solid #fcd34d',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '30px'
        }}>
          <div style={{ 
            display: 'flex', alignItems: 'center', gap: '8px', 
            marginBottom: '12px', fontWeight: 800, color: '#92400e', fontSize: '15px'
          }}>
            <ShoppingCart size={18} /> Купить ингредиенты:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            {missingIngs.map((item: any, idx: number) => (
              <a
                key={idx}
                href={`https://www.ozon.ru/search/?text=${encodeURIComponent(safeString(item))}&from_global=true`}
                target="_blank" rel="noopener noreferrer"
                style={{
                  background: '#ffffff',
                  padding: '6px 12px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  color: '#92400e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: '1px solid #fcd34d',
                  boxShadow: '0 2px 5px rgba(252, 211, 77, 0.2)',
                  transition: 'transform 0.2s'
                }}
              >
                {safeString(item)} <ExternalLink size={12} style={{ opacity: 0.5 }} />
              </a>
            ))}
          </div>
          <div style={{ 
            fontSize: '12px', color: '#b45309', display: 'flex', alignItems: 'center', gap: '5px', opacity: 0.8 
          }}>
            <Info size={14} /> Нажмите, чтобы найти на Ozon Fresh
          </div>
        </div>
      )}

      {/* ИНГРЕДИЕНТЫ */}
      <div style={{ marginBottom: '30px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 15px 0' }}>🥬 Ингредиенты</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {detailedIngs.length > 0 ? (
            detailedIngs.map((ing: any, i: number) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: '1px dashed #e5e7eb', fontSize: '15px'
              }}>
                <span style={{ color: '#1f2937', fontWeight: 500 }}>
                  {typeof ing === 'object' ? safeString(ing.name) : safeString(ing)}
                </span> 
                {(typeof ing === 'object' && ing.amount) && (
                   <span style={{ fontWeight: 700, color: '#111827', background: '#f3f4f6', padding: '4px 8px', borderRadius: '6px', fontSize: '13px' }}>
                     {safeString(ing.amount)}
                   </span>
                )}
              </div>
            ))
          ) : (
            simpleIngs.map((ing: any, i: number) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: '1px dashed #e5e7eb' }}>
                {safeString(ing)}
              </div>
            ))
          )}
          
          {detailedIngs.length === 0 && simpleIngs.length === 0 && (
             <div style={{ color: '#9ca3af', fontStyle: 'italic', padding: '10px' }}>
               Список ингредиентов пуст
             </div>
          )}
        </div>
      </div>

      {/* ШАГИ ПРИГОТОВЛЕНИЯ */}
      <div>
        <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 20px 0' }}>👨‍🍳 Пошаговый рецепт</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {steps.length > 0 ? (
            steps.map((step: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: '15px' }}>
                {/* Кружок с номером */}
                <div style={{
                  flexShrink: 0,
                  width: '32px',
                  height: '32px',
                  background: '#1f2937',
                  color: 'white',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                }}>
                  {i + 1}
                </div>
                {/* Текст шага */}
                <div style={{ 
                  flex: 1, 
                  paddingTop: '4px', 
                  fontSize: '15px', 
                  lineHeight: '1.6', 
                  color: '#374151' 
                }}>
                  {cleanText(step)}
                </div>
              </div>
            ))
          ) : (
            <div style={{ color: '#6b7280', padding: '10px' }}>
              Инструкция еще готовится...
            </div>
          )}
        </div>
      </div>

    </div>
  );
}