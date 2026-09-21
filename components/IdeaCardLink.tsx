"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { IdeaCard } from "@/lib/ideasFeed";
import { displayImageUrl } from "@/lib/imageUrl";

/**
 * Карточка каталога «Идеи». ОДНА на ленту и на блоки «Другие варианты» /
 * «Похожие идеи» под рецептом: если бы разметка жила в двух местах, эти два
 * места разошлись бы при первой же правке, и «те же карточки, что в ленте»
 * перестало бы быть правдой.
 *
 * Место под картинку зарезервировано через aspect-ratio ДО загрузки — ноль
 * прыжков вёрстки. Проявление по onLoad, но с оговоркой: закэшированная
 * картинка бывает готова ДО того, как React повесит обработчик, и onLoad не
 * случится никогда. Поэтому в ref-колбэке проверяем complete — иначе
 * закэшированные карточки остались бы прозрачными навсегда.
 */
export default function IdeaCardLink({
  card,
  eager = false,
  onOpen,
  children,
}: {
  card: IdeaCard;
  eager?: boolean;
  onOpen?: (card: IdeaCard) => void;
  /** Служебные узлы ленты (маркер прокрутки). Обычно ничего. */
  children?: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);
  const setRef = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete) setLoaded(true);
  }, []);

  const portrait = card.imageAspect === "portrait";

  return (
    <Link
      href={`/ideas/${card.slug}`}
      className="ideas-card"
      onClick={onOpen ? () => onOpen(card) : undefined}
    >
      <img
        ref={setRef}
        src={displayImageUrl(card.imageUrl)}
        alt={card.title}
        width={1024}
        height={portrait ? 1536 : 1024}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={eager ? "high" : "auto"}
        onLoad={() => setLoaded(true)}
        className={`ideas-card-img${portrait ? " ideas-card-img-portrait" : ""}${
          loaded ? " is-loaded" : ""
        }`}
      />
      <div className="ideas-card-body">
        <span className="ideas-card-title">{card.title}</span>
        <span className="ideas-card-time">{card.cookingTimeMinutes} мин</span>
      </div>
      {children}
    </Link>
  );
}
