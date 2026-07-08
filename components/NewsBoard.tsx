import { Newspaper } from "lucide-react";

// Новости проекта. Источник — таблица news (редактируется из админки, этап 8 K).
// Данные приходят ПРОПОМ из серверного компонента (app/page.tsx) → новости в HTML
// сразу, без клиентского запроса после гидрации (этап 10 W). Пастельный тон
// карточки чередуем по индексу — отдельного поля под иконку/цвет в таблице нет.
export type NewsItem = {
  id: string;
  date: string | null;
  title: string;
  body: string;
};

const TONES = ["blue", "green", "amber"] as const;

export default function NewsBoard({ items }: { items: NewsItem[] }) {
  // Нет новостей (или таблицы ещё нет) — секцию не показываем.
  if (!items || items.length === 0) return null;

  return (
    <section className="news-board">
      <h2 className="section-title">Новости проекта</h2>
      <div className="news-grid">
        {items.map((item, i) => {
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
