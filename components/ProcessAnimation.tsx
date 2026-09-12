"use client";

import {
  Carrot,
  CheckCircle,
  ChefHat,
  Drumstick,
  Egg,
  Fish,
  Salad,
  Cherry,
  Volume2,
} from "lucide-react";

/**
 * Анимация сценария «сфотографировал → выбрал из трёх → готовлю под голос».
 *
 * Подход прежний (был на Главной до PR #104): три сцены сложены абсолютно
 * внутри .process-stage с ФИКСИРОВАННОЙ высотой — соседний контент не прыгает,
 * CLS остаётся нулевым. Весь тайминг — один общий цикл в @keyframes
 * (globals.css, классы .proc-*), никакого JS и никаких библиотек. Картинки не
 * грузятся: сцены собраны из иконок lucide и обычных фигур.
 *
 * Подписи под блоком («Сфотографируйте → Выберите из трёх → Готовьте под
 * голос») подсвечиваются тем же циклом той же длины — см. HowItWorks.
 *
 * prefers-reduced-motion: анимации не применяются вовсе, и виден статичный
 * первый кадр — карточка с продуктами и чипами.
 *
 * Блок декоративный: aria-hidden, скринридеру он ничего не добавляет к тексту
 * трёх подписей рядом.
 */
export default function ProcessAnimation() {
  return (
    <div className="process-stage" aria-hidden="true">
      {/* Сцена 1 — «фото холодильника»: продукты на полке и чипы распознавания,
          которые выскакивают по одному. */}
      <div className="proc-scene proc-scene-a">
        <div className="proc-fridge">
          <div className="proc-fridge-grid">
            <span><Carrot size={18} /></span>
            <span><Drumstick size={18} /></span>
            <span><Egg size={18} /></span>
            <span><Salad size={18} /></span>
            <span><Fish size={18} /></span>
            <span><Cherry size={18} /></span>
          </div>
          <div className="proc-chip proc-chip-1"><CheckCircle size={12} /> Курица</div>
          <div className="proc-chip proc-chip-2"><CheckCircle size={12} /> Помидоры</div>
          <div className="proc-chip proc-chip-3"><CheckCircle size={12} /> Сыр</div>
        </div>
      </div>

      {/* Сцена 2 — три карточки блюд, средняя подсвечивается. */}
      <div className="proc-scene proc-scene-b">
        <div className="proc-dishes">
          <div className="proc-dish">
            <span className="proc-dish-thumb"><ChefHat size={16} /></span>
            <span className="proc-dish-line" />
            <span className="proc-dish-line proc-dish-line-short" />
          </div>
          <div className="proc-dish proc-dish-pick">
            <span className="proc-dish-thumb"><ChefHat size={16} /></span>
            <span className="proc-dish-line" />
            <span className="proc-dish-line proc-dish-line-short" />
            <span className="proc-dish-check"><CheckCircle size={14} /></span>
          </div>
          <div className="proc-dish">
            <span className="proc-dish-thumb"><ChefHat size={16} /></span>
            <span className="proc-dish-line" />
            <span className="proc-dish-line proc-dish-line-short" />
          </div>
        </div>
      </div>

      {/* Сцена 3 — строка рецепта, которую читают вслух. */}
      <div className="proc-scene proc-scene-c">
        <div className="proc-voice">
          <span className="proc-voice-icon">
            <Volume2 size={18} />
            <i className="proc-wave proc-wave-1" />
            <i className="proc-wave proc-wave-2" />
          </span>
          <span className="proc-voice-text">
            <b>Шаг 2.</b> Обжарьте лук до золотистого
            <span className="proc-caret" />
          </span>
        </div>
      </div>
    </div>
  );
}
