"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, PartyPopper } from "lucide-react";
import { reachGoal } from "@/lib/metrika";

// Основная навигация по трём разделам. Мобайл — фиксированный таб-бар снизу
// (safe-area для PWA/iOS), десктоп — те же три пункта в верхней шапке (через
// CSS). Переходы — next/link (реальная смена маршрута → авто-хит Метрики из
// YandexMetrika по usePathname). onClick дополнительно шлёт цель nav_*.
// Порядок: Банкеты — Главная — Поиск. Поиск справа — самое частое действие в
// зоне большого пальца. Лендинг по умолчанию не меняется — заход на Главную (/).
const TABS = [
  {
    href: "/parties",
    label: "Банкеты",
    icon: PartyPopper,
    goal: "nav_banquets",
    isActive: (p: string) => p.startsWith("/parties") || p.startsWith("/party"),
  },
  { href: "/", label: "Главная", icon: Home, goal: "nav_home", isActive: (p: string) => p === "/" },
  { href: "/search", label: "Поиск", icon: Search, goal: "nav_search", isActive: (p: string) => p.startsWith("/search") },
] as const;

export default function TabBar() {
  const pathname = usePathname() || "/";
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
            <Icon size={22} />
            <span className="tab-label">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
