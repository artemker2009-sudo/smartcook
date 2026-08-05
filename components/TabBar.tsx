"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Home, Search, ShoppingCart } from "lucide-react";
import { reachGoal } from "@/lib/metrika";

// Основная навигация по трём разделам. Мобайл — фиксированный таб-бар снизу
// (safe-area для PWA/iOS), десктоп — те же три пункта в верхней шапке (через
// CSS). Переходы — next/link (реальная смена маршрута → авто-хит Метрики из
// YandexMetrika по usePathname). onClick дополнительно шлёт цель nav_*.
// Порядок: Покупки — Главная — Поиск. «Поиск» справа — самое частое действие в
// зоне большого пальца. Подписи в таб-баре — одно короткое слово (iOS-стиль),
// чтобы не переносились на узких экранах; в контенте раздел зовётся «Найти
// рецепт» (хамбургер-меню, заголовки) — это не трогаем. Лендинг по умолчанию не
// меняется — заход на Главную (/). «Банкеты» переехали в гамбургер-меню; прямые
// ссылки /parties и /party/<id> работают как раньше.
const TABS = [
  {
    href: "/shopping",
    label: "Покупки",
    icon: ShoppingCart,
    goal: "nav_shopping",
    isActive: (p: string) => p.startsWith("/shopping"),
  },
  { href: "/", label: "Главная", icon: Home, goal: "nav_home", isActive: (p: string) => p === "/" },
  { href: "/search", label: "Поиск", icon: Search, goal: "nav_search", isActive: (p: string) => p.startsWith("/search") },
] as const;

export default function TabBar() {
  const pathname = usePathname() || "/";

  // Где таб-бар скрыт — должно совпадать с серверной логикой в app/layout.tsx
  // (админка и полноэкранная комната банкета /party/<id>, кроме /party/create).
  // Считаем это НА КЛИЕНТЕ по usePathname, потому что root-layout — серверный
  // компонент и не пересчитывает свой gate при soft-навигации между детьми:
  // при переходе со списка банкетов в комнату фиксированный бар оставался
  // смонтированным и перекрывал переключатель Меню/Чат.
  const isAdminRoute = pathname.startsWith("/admin");
  const isPartyRoom = pathname.startsWith("/party/") && pathname !== "/party/create";
  const hidden = isAdminRoute || isPartyRoom;

  // Класс has-tabbar на <body> (нижний отступ под фиксированный бар) сервер
  // задаёт для первого кадра, но при soft-навигации он тоже «залипает».
  // Держим его в синхроне с фактической видимостью бара на клиенте.
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
