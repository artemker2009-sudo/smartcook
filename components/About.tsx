import React from 'react';
import { Wallet, Zap, Leaf, Globe, Send } from 'lucide-react';

export default function About() {
  return (
    <div className="card" style={{marginTop: '60px', padding: '0', overflow: 'hidden', border: 'none', boxShadow: '0 20px 60px -10px rgba(0,0,0,0.15)'}}> 
      <div style={{background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', padding: '40px 25px', color: 'white', textAlign: 'center'}}> 
        <div style={{fontSize: '50px', marginBottom: '10px'}}>🚀</div> 
        <h1 style={{fontSize: '32px', fontWeight: 900, margin: '0 0 10px 0', lineHeight: 1.1}}>Кухонная революция</h1> 
        <p style={{fontSize: '18px', opacity: 0.9, fontWeight: 500, maxWidth: '400px', margin: '0 auto'}}>Мы превращаем ваше «нечего есть» в гастрономический шедевр.</p> 
      </div> 
      <div style={{padding: '30px 25px'}}> 
        <div style={{background: '#fff1f2', borderRadius: '20px', padding: '20px', marginBottom: '30px', border: '1px solid #fecdd3'}}> 
          <h3 style={{marginTop: 0, color: '#be123c', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: 800}}><span style={{fontSize: '24px'}}>💸</span> Вы теряете 30.000₽</h3> 
          <p style={{marginBottom: 0, color: '#881337', lineHeight: 1.5}}>Именно столько средняя семья выбрасывает в мусорку ежегодно в виде испорченных продуктов.</p> 
        </div> 
        <h3 style={{textAlign: 'center', fontSize: '22px', fontWeight: 800, marginBottom: '20px'}}>Почему это работает?</h3> 
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '40px'}}> 
          <div style={{background: '#f8fafc', padding: '20px 15px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0'}}><div style={{background: '#dbeafe', color: '#2563eb', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px auto'}}><Wallet size={20} /></div><div style={{fontWeight: 800, fontSize: '15px', marginBottom: '5px'}}>Экономия</div><div style={{fontSize: '12px', color: '#64748b'}}>До 5000₽ в месяц</div></div> 
          <div style={{background: '#f8fafc', padding: '20px 15px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0'}}><div style={{background: '#fef3c7', color: '#d97706', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px auto'}}><Zap size={20} /></div><div style={{fontWeight: 800, fontSize: '15px', marginBottom: '5px'}}>Скорость</div><div style={{fontSize: '12px', color: '#64748b'}}>Мгновенный рецепт</div></div> 
          <div style={{background: '#f8fafc', padding: '20px 15px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0'}}><div style={{background: '#dcfce7', color: '#16a34a', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px auto'}}><Leaf size={20} /></div><div style={{fontWeight: 800, fontSize: '15px', marginBottom: '5px'}}>Zero Waste</div><div style={{fontSize: '12px', color: '#64748b'}}>Спасаем еду</div></div> 
          <div style={{background: '#f8fafc', padding: '20px 15px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0'}}><div style={{background: '#f3e8ff', color: '#9333ea', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px auto'}}><Globe size={20} /></div><div style={{fontWeight: 800, fontSize: '15px', marginBottom: '5px'}}>Разнообразие</div><div style={{fontSize: '12px', color: '#64748b'}}>Новые блюда</div></div> 
        </div> 
         
        <div style={{background: '#f8fafc', borderRadius: '24px', padding: '25px 20px', marginBottom: '40px', border: '1px solid #e2e8f0'}}> 
          <h3 style={{margin: '0 0 10px 0', fontSize: '20px', fontWeight: 800, textAlign: 'center'}}>Установите SmartCook как приложение 📲</h3> 
          <p style={{fontSize: '14px', color: '#64748b', textAlign: 'center', marginBottom: '20px', lineHeight: 1.5}}>Быстрый доступ к рецептам в один клик. Не занимает память, не требует скачивания из App Store или Google Play!</p> 
          <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}> 
            <div style={{background: 'white', padding: '15px', borderRadius: '16px', border: '1px solid #f1f5f9'}}> 
              <div style={{fontWeight: 800, fontSize: '16px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px'}}>🍎 Для iPhone (в Safari)</div> 
              <ol style={{margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#475569', lineHeight: 1.6}}> <li>Нажмите иконку <strong>«Поделиться»</strong> (квадрат со стрелочкой вверх в самом низу экрана).</li> <li>Пролистайте меню вниз и выберите <strong>«На экран "Домой"»</strong> (со значком ➕).</li> </ol> 
            </div> 
            <div style={{background: 'white', padding: '15px', borderRadius: '16px', border: '1px solid #f1f5f9'}}> 
              <div style={{fontWeight: 800, fontSize: '16px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px'}}>🤖 Для Android (в Chrome)</div> 
              <ol style={{margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#475569', lineHeight: 1.6}}> <li>Нажмите на <strong>меню</strong> (три точки в правом верхнем углу экрана).</li> <li>Выберите пункт <strong>«Добавить на гл. экран»</strong> или <strong>«Установить приложение»</strong>.</li> </ol> 
            </div> 
          </div> 
        </div> 
        <div style={{background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', borderRadius: '24px', padding: '30px 20px', textAlign: 'center', color: 'white', boxShadow: '0 10px 25px rgba(2, 132, 199, 0.4)', position: 'relative', overflow: 'hidden'}}> 
          <h3 style={{margin: '0 0 10px 0', fontSize: '22px', fontWeight: 900}}>Telegram канал проекта</h3> 
          <p style={{opacity: 0.9, fontSize: '15px', marginBottom: '25px', lineHeight: 1.5}}>Следите за обновлениями, предлагайте идеи и общайтесь напрямую с разработчиком.</p> 
          <a href="https://t.me/smartcook2026" target="_blank" rel="noopener noreferrer" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: 'white', color: '#0284c7', textDecoration: 'none', padding: '16px 20px', borderRadius: '100px', fontWeight: 800, fontSize: '16px', boxShadow: '0 5px 15px rgba(0,0,0,0.1)', transition: 'transform 0.2s'}}> <Send size={20} /> Подписаться</a> 
        </div> 
      </div> 
    </div>
  );
}