"use client";

import { Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import { reachGoal } from "@/lib/metrika";

/**
 * Первый экран Главной (H11 «одно обещание, одна кнопка»). Занимает весь
 * viewport телефона: бренд, обещание, подзаголовок, ОДНА крупная кнопка на всю
 * ширину и под ней тихая текстовая ссылка на текстовый ввод. Больше на первом
 * экране нет ничего — ни анимации, ни витрин, ни второй кнопки: 51% визитов
 * приходят сюда и половина уходит за 30 секунд, поэтому внимание не делим.
 *
 * Что отсюда уехало ниже по странице (не удалено): демо-чипы H8 — под блок
 * «Как это работает»; плашка RuStore — к последним блокам. Анимация процесса
 * (ProcessAnimation) снята с Главной совсем, компонент остался в репозитории.
 *
 * Переходы навигационные, разделы — реальные роуты: фото → /search?focus=photo
 * (фокус на зоне загрузки), текст → /search?focus=text (фокус на поле ввода).
 * Никакой логики распознавания тут нет.
 */
export default function HeroLanding() {
  const router = useRouter();

  const handlePhotoClick = () => {
    // Цель Метрики — «мягко»: если ym не загрузился, переход всё равно сработает.
    reachGoal("cta_photo_click");
    router.push("/search?focus=photo");
  };

  const handleTextClick = () => {
    // cta_text_click — новая цель именно этой ссылки (меряем, сколько людей
    // выбирают текст вместо фото). nav_search шлём следом и НЕ переименовываем:
    // это та же цель, что у таб-бара, на ней собрана воронка входа в поиск.
    reachGoal("cta_text_click");
    reachGoal("nav_search");
    router.push("/search?focus=text");
  };

  return (
    <section className="hero-screen">
      <div className="hero-brand">SmartCook</div>
      <h1 className="hero-headline">Ужин из того, что есть</h1>
      <p className="hero-subhead">
        Сфотографируйте продукты — три рецепта за минуту. Телефон читает вслух,
        пока руки в муке.
      </p>

      <button type="button" className="btn-primary hero-cta" onClick={handlePhotoClick}>
        <Camera size={22} /> Сфотографировать холодильник
      </button>
      <button type="button" className="hero-textlink" onClick={handleTextClick}>
        или напишите, что есть
      </button>
    </section>
  );
}
