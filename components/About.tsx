import React from 'react';
import { isNativePlatform, openExternal } from "@/lib/native";
import { Wallet, Zap, Leaf, Globe, Send, Rocket, Banknote, Smartphone, Plus } from 'lucide-react';

export default function About() {
  return (
    <div className="card" style={{marginTop: 'var(--space-5)', padding: '0', overflow: 'hidden', border: 'none', boxShadow: '0 20px 60px -10px rgba(0,0,0,0.15)'}}>
      <div style={{background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%)', padding: 'var(--space-5) var(--space-4)', color: 'white', textAlign: 'center'}}>
        <Rocket size={50} style={{ display: 'block', margin: '0 auto var(--space-2) auto' }} />
        <h1 style={{fontSize: 'var(--font-size-title)', fontWeight: 'var(--font-weight-semibold)', margin: '0 0 var(--space-2) 0', lineHeight: 1.1}}>Кухонная революция</h1>
        <p style={{fontSize: 'var(--font-size-body)', opacity: 0.9, fontWeight: 'var(--font-weight-regular)', maxWidth: '400px', margin: '0 auto'}}>Мы превращаем ваше «нечего есть» в гастрономический шедевр.</p>
      </div>
      <div style={{padding: 'var(--space-4)'}}>
        <div style={{background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)', border: '1px solid var(--color-border)'}}>
          <h3 style={{marginTop: 0, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-semibold)'}}><Banknote size={24} color="var(--color-accent)" /> Вы теряете 30.000₽</h3>
          <p style={{marginBottom: 0, color: 'var(--color-text-secondary)', lineHeight: 1.5}}>Именно столько средняя семья выбрасывает в мусорку ежегодно в виде испорченных продуктов.</p>
        </div>
        <h3 style={{textAlign: 'center', fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-3)', color: 'var(--color-text)'}}>Почему это работает?</h3>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-5)'}}>
          <div style={{background: 'var(--color-bg)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--color-border)'}}><div style={{background: 'var(--color-accent-subtle)', color: 'var(--color-accent)', width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-2) auto'}}><Wallet size={20} /></div><div style={{fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', marginBottom: 'var(--space-1)', color: 'var(--color-text)'}}>Экономия</div><div style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)'}}>До 5000₽ в месяц</div></div>
          <div style={{background: 'var(--color-bg)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--color-border)'}}><div style={{background: 'var(--color-accent-subtle)', color: 'var(--color-accent)', width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-2) auto'}}><Zap size={20} /></div><div style={{fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', marginBottom: 'var(--space-1)', color: 'var(--color-text)'}}>Скорость</div><div style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)'}}>Мгновенный рецепт</div></div>
          <div style={{background: 'var(--color-bg)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--color-border)'}}><div style={{background: 'var(--color-accent-subtle)', color: 'var(--color-accent)', width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-2) auto'}}><Leaf size={20} /></div><div style={{fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', marginBottom: 'var(--space-1)', color: 'var(--color-text)'}}>Zero Waste</div><div style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)'}}>Спасаем еду</div></div>
          <div style={{background: 'var(--color-bg)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--color-border)'}}><div style={{background: 'var(--color-accent-subtle)', color: 'var(--color-accent)', width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-2) auto'}}><Globe size={20} /></div><div style={{fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-caption)', marginBottom: 'var(--space-1)', color: 'var(--color-text)'}}>Разнообразие</div><div style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)'}}>Новые блюда</div></div>
        </div>

        <div style={{background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4) var(--space-3)', marginBottom: 'var(--space-5)', border: '1px solid var(--color-border)'}}>
          <h3 style={{margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-semibold)', textAlign: 'center', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)'}}><Smartphone size={20} /> Установите SmartCook как приложение</h3>
          <p style={{fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', textAlign: 'center', marginBottom: 'var(--space-3)', lineHeight: 1.5}}>Быстрый доступ к рецептам в один клик. Не занимает память, не требует скачивания из App Store или Google Play!</p>
          <div style={{display: 'flex', flexDirection: 'column', gap: 'var(--space-3)'}}>
            <div style={{background: 'var(--color-surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)'}}>
              <div style={{fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)', color: 'var(--color-text)'}}><Smartphone size={18} /> Для iPhone (в Safari)</div>
              <ol style={{margin: 0, paddingLeft: 'var(--space-4)', fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', lineHeight: 1.6}}> <li>Нажмите иконку <strong>«Поделиться»</strong> (квадрат со стрелочкой вверх в самом низу экрана).</li> <li>Пролистайте меню вниз и выберите <strong>«На экран "Домой"»</strong> (со значком <Plus size={12} style={{ display: 'inline' }} />).</li> </ol>
            </div>
            <div style={{background: 'var(--color-surface)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)'}}>
              <div style={{fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)', color: 'var(--color-text)'}}><Smartphone size={18} /> Для Android (в Chrome)</div>
              <ol style={{margin: 0, paddingLeft: 'var(--space-4)', fontSize: 'var(--font-size-caption)', color: 'var(--color-text-secondary)', lineHeight: 1.6}}> <li>Нажмите на <strong>меню</strong> (три точки в правом верхнем углу экрана).</li> <li>Выберите пункт <strong>«Добавить на гл. экран»</strong> или <strong>«Установить приложение»</strong>.</li> </ol>
            </div>
          </div>
        </div>
        <div style={{background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4) var(--space-3)', textAlign: 'center', color: 'white', boxShadow: '0 10px 25px rgba(5, 150, 105, 0.4)', position: 'relative', overflow: 'hidden'}}>
          <h3 style={{margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-semibold)'}}>Telegram канал проекта</h3>
          <p style={{opacity: 0.9, fontSize: 'var(--font-size-body)', marginBottom: 'var(--space-4)', lineHeight: 1.5}}>Следите за обновлениями, предлагайте идеи и общайтесь напрямую с разработчиком.</p>
          <a href="https://t.me/smartcook2026" target="_blank" rel="noopener noreferrer" onClick={(e) => { if (isNativePlatform()) { e.preventDefault(); void openExternal("https://t.me/smartcook2026"); } }} style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', background: 'white', color: 'var(--color-accent-hover)', textDecoration: 'none', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-sm)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)', boxShadow: '0 5px 15px rgba(0,0,0,0.1)', transition: 'transform 0.2s'}}> <Send size={20} /> Подписаться</a>
        </div>
      </div>
    </div>
  );
}
