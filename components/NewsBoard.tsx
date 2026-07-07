"use client";

import { Sparkles, Smartphone, SlidersHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Новости проекта. Источник — статический массив в коде (проще таблицы: без
// миграции и RLS-поверхности; редактируется правкой этого файла). Тексты —
// про реально выпущенные фичи, согласованы с директором. При добавлении новой
// новости — новый объект сверху массива.
type NewsItem = {
  date: string;
  title: string;
  text: string;
  icon: LucideIcon;
  tone: "green" | "blue" | "amber";
  href?: string;
};

const NEWS: NewsItem[] = [
  {
    date: "Июль 2026",
    title: "SmartCook можно установить как приложение",
    text: "Откройте сайт с телефона и добавьте на главный экран — иконка как у обычного приложения, открывается в один тап.",
    icon: Smartphone,
    tone: "blue",
  },
  {
    date: "Июль 2026",
    title: "Профиль вкуса",
    text: "Укажите аллергии и нелюбимые продукты один раз — каждый рецепт будет подобран с их учётом.",
    icon: SlidersHorizontal,
    tone: "green",
    href: "/search",
  },
  {
    date: "Июнь 2026",
    title: "Новый дизайн",
    text: "Мы обновили SmartCook: стало чище, быстрее и удобнее с телефона.",
    icon: Sparkles,
    tone: "amber",
  },
];

export default function NewsBoard() {
  return (
    <section className="news-board">
      <h2 className="section-title">Новости проекта</h2>
      <div className="news-grid">
        {NEWS.map((item, i) => {
          const Icon = item.icon;
          const Card = (
            <>
              <div className={`news-icon news-icon-${item.tone}`}>
                <Icon size={20} />
              </div>
              <div className="news-body">
                <div className="news-date">{item.date}</div>
                <div className="news-headline">{item.title}</div>
                <p className="news-text">{item.text}</p>
              </div>
            </>
          );
          return item.href ? (
            <a key={i} href={item.href} className={`news-card news-card-${item.tone}`}>
              {Card}
            </a>
          ) : (
            <div key={i} className={`news-card news-card-${item.tone}`}>
              {Card}
            </div>
          );
        })}
      </div>
    </section>
  );
}
