"use client";

import {
  Carrot,
  Drumstick,
  Cherry,
  Salad,
  Egg,
  Fish,
  CheckCircle,
  ChefHat,
  Clock,
} from "lucide-react";

/**
 * Чистая CSS-анимация процесса «фото → распознали продукты → рецепт».
 *
 * Три сцены сложены абсолютно внутри .process-stage с фиксированной высотой —
 * это исключает layout shift соседнего контента. Тайминги и цикл заданы в
 * globals.css (класс .proc-*). При prefers-reduced-motion анимация не
 * применяется и виден статичный финальный кадр — карточка рецепта.
 *
 * Декоративный блок: aria-hidden, чтобы скринридеры его не озвучивали.
 */
export default function ProcessAnimation() {
  return (
    <div className="process-stage" aria-hidden="true">
      {/* Сцена 1 + 2: «фото» продуктов, поверх появляются плашки распознавания */}
      <div className="proc-scene proc-photo">
        <div className="proc-photo-card">
          <div className="proc-photo-grid">
            <span><Carrot size={24} /></span>
            <span><Drumstick size={24} /></span>
            <span><Cherry size={24} /></span>
            <span><Salad size={24} /></span>
            <span><Egg size={24} /></span>
            <span><Fish size={24} /></span>
          </div>

          <div className="proc-chip proc-chip-1">
            <CheckCircle size={13} /> Помидоры <b>98%</b>
          </div>
          <div className="proc-chip proc-chip-2">
            <CheckCircle size={13} /> Курица <b>95%</b>
          </div>
          <div className="proc-chip proc-chip-3">
            <CheckCircle size={13} /> Сыр <b>91%</b>
          </div>
        </div>
      </div>

      {/* Сцена 3: карточка готового рецепта со скелет-строками вместо шагов */}
      <div className="proc-scene proc-recipe">
        <div className="proc-recipe-card">
          <div className="proc-recipe-head">
            <ChefHat size={18} />
            <span className="proc-recipe-title">Курица с овощами</span>
          </div>
          <div className="proc-recipe-meta">
            <Clock size={13} /> 25 мин
          </div>
          <div className="proc-skel-lines">
            <span className="proc-skel" />
            <span className="proc-skel" />
            <span className="proc-skel" />
          </div>
        </div>
      </div>
    </div>
  );
}
