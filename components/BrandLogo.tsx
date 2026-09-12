import { ChefHat } from "lucide-react";

/**
 * Шапка Главной: логотип во всю ширину экрана поверх фотографии продуктов —
 * полупрозрачная полоса с размытием, содержимое по левому краю на одной
 * вертикали с остальным контентом.
 *
 * Была компактная белая пилюля по центру, но поверх овощей она читалась как
 * случайный элемент, а не как шапка приложения. Отдельной иконки-логотипа в
 * репозитории нет, поэтому шапка шефа — ChefHat из lucide, который уже стоит
 * в проекте.
 *
 * Серверный компонент — на первом экране ему нечего делать на клиенте.
 */
export default function BrandLogo() {
  return (
    <header className="hero-header">
      <div className="hero-header-inner">
        <ChefHat className="hero-header-mark" size={22} strokeWidth={2.2} aria-hidden />
        <span className="hero-header-word">SmartCook</span>
      </div>
    </header>
  );
}
