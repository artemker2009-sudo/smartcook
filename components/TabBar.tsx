"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Camera, Home, ShoppingCart, User } from "lucide-react";
import { reachGoal } from "@/lib/metrika";
import { isChromeHidden } from "@/lib/layoutGate";

// Основная навигация по четырём разделам. Мобайл — фиксированный таб-бар снизу
// (safe-area для PWA/iOS), десктоп — те же пункты в верхней шапке (через CSS).
// Переходы — next/link (реальная смена маршрута → авто-хит Метрики из
// YandexMetrika по usePathname). onClick дополнительно шлёт цель nav_*.
//
// Порядок (этап H11): Главная — По фото — Покупки — Профиль. «По фото» ведёт в
// тот же /search с фокусом на зоне загрузки, что и главная кнопка Главной, и
// шлёт СТАРУЮ цель nav_search: на ней собрана воронка входа в поиск, переименование
// разорвало бы месячные ряды. «Профиль» — новый пункт и новая цель nav_profile;
// он заменил аватарку-вход в root-layout (ProfileEntry), чтобы вход в кабинет
// был ровно один.
//
// Подписи — одно короткое слово (iOS-стиль), чтобы не переносились на узких
// экранах; в контенте раздел зовётся «Найти рецепт» — это не трогаем.
// «Банкеты» и «Лента» в таб-баре не живут: за месяц ноль кликов и ноль
// публикаций. Ссылки на них остались в личном кабинете, прямые /parties,
// /party/<id> и /feed работают как раньше.
const TABS = [
  { href: "/", label: "Главная", icon: Home, goal: "nav_home", isActive: (p: string) => p === "/" },
  {
    href: "/search?focus=photo",
    label: "По фото",
    icon: Camera,
    goal: "nav_search",
    isActive: (p: string) => p.startsWith("/search"),
  },
  {
    href: "/shopping",
    label: "Покупки",
    icon: ShoppingCart,
    goal: "nav_shopping",
    isActive: (p: string) => p.startsWith("/shopping"),
  },
  {
    href: "/profile",
    label: "Профиль",
    icon: User,
    goal: "nav_profile",
    isActive: (p: string) => p.startsWith("/profile"),
  },
] as const;

export default function TabBar() {
  const pathname = usePathname() || "/";

  // Где таб-бар скрыт: админка и полноэкранная комната банкета /party/<id>
  // (кроме /party/create). Правило лежит в lib/layoutGate.ts — ОДНО на всю
  // обвязку, чтобы копии в разных компонентах не разъезжались. Считается НА
  // КЛИЕНТЕ по usePathname: серверный root-layout не пересчитывает свой гейт
  // при soft-навигации между детьми, из-за чего бар когда-то залипал в комнате
  // банкета и перекрывал переключатель Меню/Чат.
  const hidden = isChromeHidden(pathname);

  // Класс has-tabbar на <body> (нижний отступ под фиксированный бар) сервер
  // теперь ставит БЕЗУСЛОВНО — это верное значение почти для всех экранов, и
  // именно так layout остался статическим. Снять его там, где бара нет, —
  // задача этого эффекта; он и раньше держал класс в синхроне при навигации.
  useEffect(() => {
    document.body.classList.toggle("has-tabbar", !hidden);
  }, [hidden]);

  if (hidden) return null;

  return (
    <nav className="tab-bar" aria-label="Основная навигация">
      {TABS.map((t) => {
        const active = t.isActive(pathname);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`tab-item${active ? " tab-item-active" : ""}`}
            onClick={() => reachGoal(t.goal)}
            aria-current={active ? "page" : undefined}
          >
            <span className="tab-icon">
              <Icon size={24} strokeWidth={active ? 2.4 : 2} />
            </span>
            <span className="tab-label">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
