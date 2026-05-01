"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle, Flame, Globe, Menu, PartyPopper, Search, Store, User, X } from "lucide-react";

type AppNavigationProps = {
  activeSection?: "parties" | "service" | "profile" | "feed" | "game" | "daily" | "about";
};

const navItems = [
  { id: "profile", label: "Личный кабинет", href: "/", icon: User, color: "#0ea5e9" },
  { id: "service", label: "Поиск", href: "/", icon: Search, color: "#10b981" },
  { id: "parties", label: "Банкеты", href: "/parties", icon: PartyPopper, color: "#111111" },
  { id: "feed", label: "Лента", href: "/", icon: Globe, color: "#8b5cf6" },
  { id: "game", label: "Мой ресторан", href: "/", icon: Store, color: "#f59e0b" },
  { id: "daily", label: "Рецепт дня", href: "/", icon: Flame, color: "#f97316" },
  { id: "about", label: "О проекте", href: "/", icon: CheckCircle, color: "#3b82f6" },
] as const;

export default function AppNavigation({ activeSection }: AppNavigationProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsMenuOpen(true)}
        className="fixed left-5 top-2.5 z-50 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-0 bg-white p-0 shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
        aria-label="Открыть меню"
      >
        <Menu size={24} color="#111" />
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
              borderTopRightRadius: "24px",
              borderBottomRightRadius: "24px",
              borderTopLeftRadius: "0",
              borderBottomLeftRadius: "0",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "40px" }}>
              <span style={{ fontSize: "24px", fontWeight: "900", color: "#059669" }}>SmartCook</span>
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="cursor-pointer border-0 bg-transparent p-0"
                aria-label="Закрыть меню"
              >
                <X size={24} />
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
                    background: isActive ? "#f1f5f9" : "transparent",
                    color: isActive ? "#0f172a" : "#475569",
                    fontWeight: isActive ? 800 : 600,
                    fontSize: "16px",
                    gap: "14px",
                    padding: "14px 16px",
                    borderRadius: "16px",
                    marginBottom: "4px",
                    textDecoration: "none",
                  }}
                >
                  <Icon size={22} color={item.color} style={{ flexShrink: 0 }} />
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
