"use client";

import { useEffect, useState } from "react";
import { Newspaper } from "lucide-react";
import { supabase } from "@/lib/supabase";

// Новости проекта. Источник — таблица news (редактируется из админки, этап 8 K).
// Публично видны только is_visible=true (фильтруется RLS + запросом). Свежие
// сверху (created_at desc). Пастельный тон карточки чередуем по индексу —
// отдельного поля под иконку/цвет в таблице нет (поля: date/title/body/is_visible).
type NewsItem = {
  id: string;
  date: string | null;
  title: string;
  body: string;
};

const TONES = ["blue", "green", "amber"] as const;

export default function NewsBoard() {
  const [news, setNews] = useState<NewsItem[] | null>(null);

  useEffect(() => {
    supabase
      .from("news")
      .select("id,date,title,body")
      .eq("is_visible", true)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => setNews(error ? [] : ((data as NewsItem[]) ?? [])));
  }, []);

  // Нет новостей (или таблицы ещё нет) — секцию не показываем.
  if (!news || news.length === 0) return null;

  return (
    <section className="news-board">
      <h2 className="section-title">Новости проекта</h2>
      <div className="news-grid">
        {news.map((item, i) => {
          const tone = TONES[i % TONES.length];
          return (
            <div key={item.id} className={`news-card news-card-${tone}`}>
              <div className={`news-icon news-icon-${tone}`}>
                <Newspaper size={20} />
              </div>
              <div className="news-body">
                {item.date && <div className="news-date">{item.date}</div>}
                <div className="news-headline">{item.title}</div>
                <p className="news-text">{item.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
