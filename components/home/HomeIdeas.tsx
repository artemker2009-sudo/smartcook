"use client";

import Link from "next/link";
import IdeaCardLink from "@/components/IdeaCardLink";
import { reachGoal } from "@/lib/metrika";
import { splitIntoColumns, type IdeaCard } from "@/lib/ideasFeed";

/**
 * «Идеи на сегодня» — четыре карточки каталога на Главной.
 *
 * Набор выбирает СЕРВЕР (lib/homeIdeas.ts) и передаёт готовым пропом: карточки
 * есть в HTML сразу, без JS и без запроса после гидрации. Клиентский компонент
 * нужен ровно для целей Метрики на нажатиях.
 *
 * Карточка — тот же IdeaCardLink, что в ленте: одна разметка на оба места,
 * иначе «те же карточки, что в ленте» разошлось бы при первой правке. Картинки
 * — миниатюры (в набор попадают только рецепты с thumb_url).
 *
 * Про ИИ здесь не пишем намеренно: пометка стоит в самой ленте «Идей», рядом с
 * каталогом целиком, а не под четырьмя карточками.
 */
export default function HomeIdeas({ cards }: { cards: IdeaCard[] }) {
  if (cards.length === 0) return null;

  // Две колонки, как в ленте: раскладка чистой функцией — одинаково на сервере
  // и на клиенте, без измерений DOM.
  const columns = splitIntoColumns(cards, 2);

  return (
    <section className="home-ideas">
      <div className="home-ideas-head">
        <h2 className="home-ideas-title">Идеи на сегодня</h2>
        <Link
          href="/ideas"
          className="home-ideas-all"
          onClick={() => reachGoal("home_more_ideas", { from: "header" })}
        >
          Все идеи →
        </Link>
      </div>
      <p className="home-ideas-sub">Новые каждый день.</p>

      <div className="home-ideas-grid">
        {columns.map((column, index) => (
          <div className="home-ideas-col" key={index}>
            {column.map((card) => (
              <IdeaCardLink
                key={card.slug}
                card={card}
                // Без eager: карточки лежат ПОД фотографией первого экрана, а
                // она — LCP-кадр Главной. Четыре приоритетных запроса рядом с
                // ней отняли бы у неё канал ровно там, где мерится скорость.
                onOpen={(opened) => reachGoal("home_idea_open", { slug: opened.slug })}
              />
            ))}
          </div>
        ))}
      </div>

      <Link
        href="/ideas"
        className="home-ideas-more"
        onClick={() => reachGoal("home_more_ideas", { from: "button" })}
      >
        Больше идей
      </Link>
    </section>
  );
}
