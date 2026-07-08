"use client";

import { Camera, CalendarHeart } from "lucide-react";
import { useRouter } from "next/navigation";
import ProcessAnimation from "@/components/ProcessAnimation";
import { reachGoal } from "@/lib/metrika";

/**
 * Первый экран Главной: заголовок про боль пользователя, два больших CTA под
 * палец и зацикленная CSS-анимация процесса (эталон). Разделы теперь — реальные
 * роуты, поэтому CTA ведут навигацией: фото → /search с фокусом на зоне загрузки
 * (?focus=photo, ничего не открывается само), банкеты → /parties. Никакой логики
 * распознавания тут нет.
 */
export default function HeroLanding() {
  const router = useRouter();

  const handlePhotoClick = () => {
    // Цель Метрики — «мягко»: если ym не загрузился, переход всё равно сработает.
    reachGoal("cta_photo_click");
    router.push("/search?focus=photo");
  };

  return (
    <section className="hero-landing">
      <div className="hero-brand">SmartCook</div>
      <h1 className="hero-headline">
        Не знаете, <span className="hero-mark">что приготовить</span> из того,
        что есть дома?
      </h1>
      <p className="hero-subhead">
        Сфотографируйте продукты — и получите 3 варианта ужина за минуту.
      </p>

      <div className="hero-cta-group">
        <button type="button" className="btn-primary hero-cta" onClick={handlePhotoClick}>
          <Camera size={20} /> Сфотографировать продукты
        </button>
        <a
          href="/parties"
          className="btn-secondary hero-cta"
          onClick={() => reachGoal("cta_banquet_click")}
        >
          <span className="hero-cta-icon"><CalendarHeart size={20} /></span>{" "}
          Собрать банкет
        </a>
      </div>

      <ProcessAnimation />
    </section>
  );
}
