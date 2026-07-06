"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { YANDEX_METRIKA_ID } from "@/components/YandexMetrika";
import Button from "@/components/ui/Button";

const STORAGE_KEY = "smartcook_onboarding_seen";
const BOT_UA_REGEX =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|vkshare|yandex(bot|images|metrika)?|googlebot|duckduckbot|baiduspider|semrushbot|ahrefsbot|mj12bot|petalbot|headlesschrome/i;

const FEATURES = [
  { icon: "📸", text: "Сфотографируй продукты — получи рецепты из того, что есть" },
  { icon: "🎉", text: "Собери банкет: меню под компанию + список покупок" },
  { icon: "⚡", text: "Бесплатно и без регистрации" },
];

function fireGoal(goal: string) {
  // @ts-ignore
  if (typeof window !== "undefined" && window.ym) {
    // @ts-ignore
    window.ym(YANDEX_METRIKA_ID, "reachGoal", goal);
  }
}

export default function OnboardingModal() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    if (BOT_UA_REGEX.test(navigator.userAgent) || navigator.webdriver) return;

    // Небольшая задержка, чтобы плашка не мешала первой отрисовке страницы.
    const timer = setTimeout(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) return;
        if (localStorage.getItem(STORAGE_KEY)) return;
        localStorage.setItem(STORAGE_KEY, "1");
        setIsOpen(true);
        fireGoal("onboarding_shown");
      });
    }, 600);

    return () => clearTimeout(timer);
  }, []);

  const close = () => setIsOpen(false);

  const handleClosed = () => {
    fireGoal("onboarding_closed");
    close();
  };

  const handlePhotoClick = () => {
    fireGoal("onboarding_photo_click");
    close();
    if (pathname === "/") {
      const input = document.getElementById("hidden-file-input");
      if (input) input.click();
      else router.push("/");
    } else {
      router.push("/");
    }
  };

  const handleBanquetClick = () => {
    fireGoal("onboarding_banquet_click");
    close();
    router.push("/party/create");
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        padding: "var(--space-3)",
      }}
      onClick={handleClosed}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)",
          borderRadius: "var(--radius-md)",
          width: "100%",
          maxWidth: "400px",
          padding: "var(--space-4) var(--space-3)",
          position: "relative",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        }}
      >
        <button
          onClick={handleClosed}
          aria-label="Закрыть"
          style={{
            position: "absolute",
            top: "var(--space-3)",
            right: "var(--space-3)",
            background: "var(--color-bg-subtle)",
            border: "none",
            borderRadius: "50%",
            padding: "var(--space-2)",
            cursor: "pointer",
            color: "var(--color-text-secondary)",
          }}
        >
          <X size={20} />
        </button>

        <h2
          style={{
            fontSize: "var(--font-size-heading)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text)",
            margin: "0 30px var(--space-3) 0",
            lineHeight: 1.25,
          }}
        >
          Привет! SmartCook — твой ИИ-шеф
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
          {FEATURES.map((f) => (
            <div key={f.text} style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
              <span style={{ fontSize: "var(--font-size-heading)", lineHeight: 1, flexShrink: 0 }}>{f.icon}</span>
              <span style={{ fontSize: "var(--font-size-body)", color: "var(--color-text-secondary)", lineHeight: 1.45, paddingTop: "2px" }}>
                {f.text}
              </span>
            </div>
          ))}
        </div>

        <Button variant="primary" onClick={handlePhotoClick}>
          Попробовать по фото
        </Button>

        <Button
          variant="secondary"
          onClick={handleBanquetClick}
          style={{ marginTop: "var(--space-2)" }}
        >
          Собрать банкет
        </Button>
      </div>
    </div>
  );
}
