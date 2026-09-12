import { ChefHat } from "lucide-react";

/**
 * Шапка Главной: логотип по центру поверх фотографии продуктов — на одной оси
 * с заголовком, подзаголовком и кнопкой.
 *
 * Своей полосы у шапки НЕТ — любая заливка во всю ширину давала
 * горизонтальную границу поперёк первого экрана. Читаемость держит маленькое
 * световое пятно под самим логотипом (.hero-header-inner::before).
 *
 * Слово набрано Manrope ExtraBold: Unbounded в этом кегле читался плохо.
 * Отдельной иконки-логотипа в репозитории нет, поэтому шапка шефа — ChefHat
 * из lucide, который уже стоит в проекте.
 *
 * Серверный компонент — на первом экране ему нечего делать на клиенте.
 */
export default function BrandLogo() {
  return (
    <header className="hero-header">
      <div className="hero-header-inner">
        <ChefHat className="hero-header-mark" size={25} strokeWidth={2.2} aria-hidden />
        <span className="hero-header-word">SmartCook</span>
      </div>
    </header>
  );
}
