"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CheckCircle, Flame, Home, ImageIcon, Menu, PartyPopper, Search, ShoppingCart, X } from "lucide-react";

// Вторичная навигация (хамбургер). Основные 3 раздела дублирует таб-бар;
// здесь — лента, банкеты, рецепт дня и о проекте.
// «Лента» — новая премодерируемая лента сообщества (/feed), НЕ старая feed_posts.
//
// Личного кабинета здесь СОЗНАТЕЛЬНО НЕТ: вход в него один — аватарка справа
// сверху (ProfileEntry в root-layout), она видна на каждом экране. Пункт в меню
// был вторым входом в то же место: человек ищет кабинет, находит два пути и не
// понимает, одно это или разное.
//
// Активный пункт считается ПО МАРШРУТУ (usePathname), а не приходит пропом:
// раньше каждая страница передавала activeSection руками, и Главная передавала
// "daily" — на / подсвечивался «Рецепт дня». Проп убран, чтобы такую рассинхронизацию
// нельзя было внести снова.
//
// match — pathname пункта; null означает «не подсвечивать никогда». У «Рецепта дня»
// нет своего маршрута: он открывается как вид внутри /search (?daily=true), а этот
// pathname уже принадлежит «Найти рецепт». Подсветку рецепта дня на самом экране
// делает собственное меню SearchApp по своему activeView.
const navItems = [
  { id: "home", label: "Главная", href: "/", match: "/", icon: Home },
  { id: "service", label: "Найти рецепт", href: "/search", match: "/search", icon: Search },
  { id: "shopping", label: "Покупки", href: "/shopping", match: "/shopping", icon: ShoppingCart },
  { id: "feed", label: "Лента", href: "/feed", match: "/feed", icon: ImageIcon },
  { id: "parties", label: "Банкеты", href: "/parties", match: "/parties", icon: PartyPopper },
  { id: "daily", label: "Рецепт дня", href: "/search?daily=true", match: null, icon: Flame },
  { id: "about", label: "О проекте", href: "/about", match: "/about", icon: CheckCircle },
] as const;

// Точное совпадение маршрута либо вложенный маршрут раздела (/shopping/join/<id>
// — это всё ещё «Покупки»). Для «Главной» второе условие вырождается: match "/"
// дал бы префикс "//", который не встречается, — то есть корень НЕ матчит всё
// подряд. Префиксы разделов не пересекаются, поэтому активным всегда выходит
// ровно один пункт (или ни одного — на /profile, /articles, /recipe/<id>).
function isActiveRoute(pathname: string, match: string | null): boolean {
  if (!match) return false;
  return pathname === match || pathname.startsWith(match + "/");
}

export default function AppNavigation() {
  const pathname = usePathname() || "/";
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsMenuOpen(true)}
        className="fixed left-5 z-50 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-0 bg-white p-0 shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
        style={{ top: "calc(env(safe-area-inset-top) + 8px)" }}
        aria-label="Открыть меню"
      >
        <Menu size={24} color="var(--color-text)" />
      </button>

      {isMenuOpen && (
        <>
          <div className="menu-overlay" onClick={() => setIsMenuOpen(false)} style={{ zIndex: 99 }} />
          <div
            className="menu-drawer open"
            style={{
              left: 0,
              right: "auto",
              transform: "translateX(0)",
              zIndex: 100,
              borderTopRightRadius: "var(--radius-md)",
              borderBottomRightRadius: "var(--radius-md)",
              borderTopLeftRadius: "0",
              borderBottomLeftRadius: "0",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-5)" }}>
              <span style={{ fontSize: "var(--font-size-heading)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-accent)" }}>SmartCook</span>
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="cursor-pointer border-0 bg-transparent p-0"
                aria-label="Закрыть меню"
              >
                <X size={24} color="var(--color-text-secondary)" />
              </button>
            </div>

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = isActiveRoute(pathname, item.match);

              return (
                <Link
                  key={item.id}
                  className="menu-link"
                  href={item.href}
                  onClick={() => setIsMenuOpen(false)}
                  style={{
                    background: isActive ? "var(--color-accent-subtle)" : "transparent",
                    color: isActive ? "var(--color-accent)" : "var(--color-text-secondary)",
                    fontWeight: isActive ? "var(--font-weight-semibold)" : "var(--font-weight-medium)",
                    textDecoration: "none",
                  }}
                >
                  <Icon size={22} style={{ flexShrink: 0 }} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
