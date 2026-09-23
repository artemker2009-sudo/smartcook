"use client";

import Link from "next/link";
import { reachGoal } from "@/lib/metrika";
import { displayImageUrl } from "@/lib/imageUrl";
import { useIdeaIntent } from "@/lib/useIdeaIntent";

/**
 * «Вы собирались приготовить …» — плашка для вернувшегося.
 *
 * Показывается, только если на устройстве есть свежее (моложе недели)
 * намерение: человек добавил продукты этого рецепта в список покупок или
 * запустил режим готовки и ушёл. У первого захода её нет вовсе.
 *
 * Запись лежит в localStorage, то есть НА СЕРВЕРЕ неизвестна. Поэтому
 * компонент подписан на хранилище через useSyncExternalStore (lib/ideasIntent):
 * первый клиентский рендер совпадает с серверным — плашки нет, — а сразу после
 * гидрации она появляется. Возврат из bfcache (Safari), переключение вкладок и
 * запись из соседней вкладки тоже перечитываются: иначе плашка звала бы
 * готовить то, что человек только что приготовил.
 */
export default function HomeCookResume() {
  const intent = useIdeaIntent();
  if (!intent) return null;

  return (
    <Link
      href={`/ideas/${intent.slug}`}
      className="home-resume"
      onClick={() => reachGoal("home_cook_resume", { slug: intent.slug })}
    >
      {intent.thumb ? (
        <img
          src={displayImageUrl(intent.thumb)}
          alt=""
          width={60}
          height={60}
          className="home-resume-thumb"
          aria-hidden
        />
      ) : (
        // Миниатюры может не быть (рецепт опубликован раньше, чем скрипт
        // досоздал thumb). Место под неё всё равно держим — иначе плашка
        // меняет высоту от рецепта к рецепту.
        <span className="home-resume-thumb home-resume-thumb-empty" aria-hidden />
      )}
      <span className="home-resume-body">
        <span className="home-resume-kicker">Вы собирались приготовить</span>
        <span className="home-resume-title">{intent.title}</span>
      </span>
      <span className="home-resume-cta">Готовим!</span>
    </Link>
  );
}
