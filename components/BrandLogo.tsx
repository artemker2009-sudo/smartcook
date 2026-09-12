import { ChefHat } from "lucide-react";

/**
 * Логотип SmartCook: шапка шефа + слово, набранное Unbounded (переменная
 * --font-brand задаётся в root-layout). Отдельной иконки-логотипа в репозитории
 * нет, поэтому шапка — ChefHat из lucide-react, который уже стоит в проекте.
 *
 * Это опознавательный знак, а не заголовок страницы: компактный, не тянет на
 * себя внимание от обещания и кнопки. Серверный компонент — на первом экране
 * ему нечего делать на клиенте.
 */
export default function BrandLogo() {
  return (
    <div className="brand-logo">
      <ChefHat className="brand-logo-mark" size={22} strokeWidth={2.2} aria-hidden />
      <span className="brand-logo-word">SmartCook</span>
    </div>
  );
}
