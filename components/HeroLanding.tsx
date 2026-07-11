"use client";

import { Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import ProcessAnimation from "@/components/ProcessAnimation";
import { reachGoal } from "@/lib/metrika";

/**
 * Первый экран Главной (H7/H10): заголовок про боль пользователя, ОДНА крупная
 * CTA «Сфотографировать продукты» под палец, под ней тихая текстовая ссылка
 * «или найти рецепт по названию» — второй сценарий не конкурирует за внимание с
 * основным. Разделы — реальные роуты, поэтому переходы навигационные: фото →
 * /search с фокусом на зоне загрузки (?focus=photo), текстовый поиск →
 * /search?focus=text (фокус на поле ввода). Банкеты убраны с первого экрана —
 * остаются в таб-баре. Никакой логики распознавания тут нет.
 */
export default function HeroLanding() {
  const router = useRouter();

  const handlePhotoClick = () => {
    // Цель Метрики — «мягко»: если ym не загрузился, переход всё равно сработает.
    reachGoal("cta_photo_click");
    router.push("/search?focus=photo");
  };

  const handleTextClick = () => {
    // Вход в текстовый поиск = переход на экран поиска → шлём nav_search
    // (та же цель, что и у таб-бара), сохраняя воронку целой.
    reachGoal("nav_search");
    router.push("/search?focus=text");
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
        <button type="button" className="hero-textlink" onClick={handleTextClick}>
          или найти рецепт по названию
        </button>
      </div>

      <ProcessAnimation />
    </section>
  );
}
