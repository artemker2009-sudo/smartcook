"use client";

import React, { useRef } from "react";
import { Camera, CalendarHeart } from "lucide-react";
import ProcessAnimation from "@/components/ProcessAnimation";
import { reachGoal } from "@/lib/metrika";

interface HeroLandingProps {
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setSearchMode: (mode: "photo" | "text") => void;
}

/**
 * Первый экран главной: заголовок про боль пользователя, два больших CTA под
 * палец и зацикленная CSS-анимация процесса. Никакой логики распознавания тут
 * нет — фото прокидывается в существующий handleFileChange, банкеты ведут на
 * существующий роут /parties.
 */
export default function HeroLanding({ handleFileChange, setSearchMode }: HeroLandingProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoClick = () => {
    // Цель Метрики — «мягко»: если ym не загрузился, клик всё равно сработает.
    reachGoal("cta_photo_click");
    // Держим нижнюю карточку в режиме фото, чтобы после выбора снимка показать
    // превью, режимы и кнопку «Найти рецепт».
    setSearchMode("photo");
    // Открытие камеры/галереи не зависит от результата reachGoal.
    fileInputRef.current?.click();
  };

  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileChange(e);
    // Плавно доводим пользователя до карточки с превью и подсвечиваем её,
    // чтобы читалась как продолжение сценария, а не второй независимый вход.
    setTimeout(() => {
      const card = document.getElementById("sc-search-card");
      if (!card) return;
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.remove("sc-card-glow");
      // reflow, чтобы анимацию можно было перезапустить
      void card.offsetWidth;
      card.classList.add("sc-card-glow");
      setTimeout(() => card.classList.remove("sc-card-glow"), 1700);
    }, 150);
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png, image/jpeg, image/jpg, .heic, .HEIC"
        style={{ display: "none" }}
        onChange={handlePhotoSelected}
      />

      <ProcessAnimation />
    </section>
  );
}
