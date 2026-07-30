"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle, Flame, Home, ImageIcon, Menu, PartyPopper, Search, User, X } from "lucide-react";

type AppNavigationProps = {
  activeSection?: "home" | "parties" | "service" | "profile" | "daily" | "about" | "feed";
};

// Вторичная навигация (хамбургер). Основные 3 раздела дублирует таб-бар;
// здесь — доступ к личному кабинету, ленте, рецепту дня и о проекте. Все пункты
// ведут на реальные роуты (Поиск/кабинет/рецепт дня — это /search с параметром).
// «Лента» — новая премодерируемая лента сообщества (/feed), НЕ старая feed_posts.
const navItems = [
  { id: "home", label: "Главная", href: "/", icon: Home },
  { id: "service", label: "Найти рецепт", href: "/search", icon: Search },
  { id: "feed", label: "Лента", href: "/feed", icon: ImageIcon },
  { id: "parties", label: "Банкеты", href: "/parties", icon: PartyPopper },
  { id: "profile", label: "Личный кабинет", href: "/profile", icon: User },
  { id: "daily", label: "Рецепт дня", href: "/search?daily=true", icon: Flame },
  { id: "about", label: "О проекте", href: "/about", icon: CheckCircle },
] as const;

export default function AppNavigation({ activeSection }: AppNavigationProps) {
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
              const isActive = activeSection === item.id;

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
