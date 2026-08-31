"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X, Camera, ShoppingCart, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isInviteFlow } from "@/lib/sharedShoppingList";
import { YANDEX_METRIKA_ID } from "@/components/YandexMetrika";
import Button from "@/components/ui/Button";

const STORAGE_KEY = "smartcook_onboarding_seen";
const BOT_UA_REGEX =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|vkshare|yandex(bot|images|metrika)?|googlebot|duckduckbot|baiduspider|semrushbot|ahrefsbot|mj12bot|petalbot|headlesschrome/i;

const FEATURES = [
  { icon: Camera, text: "Сфотографируйте продукты — получим рецепты из того, что есть" },
  { icon: ShoppingCart, text: "А умный список покупок соберёт всё для магазина" },
  { icon: Zap, text: "Бесплатно и без регистрации" },
];

function fireGoal(goal: string) {
  // @ts-ignore
  if (typeof window !== "undefined" && window.ym) {
    // @ts-ignore
    window.ym(YANDEX_METRIKA_ID, "reachGoal", goal);
  }
}

// Человек пришёл по личной ссылке с конкретным делом, и реклама «Привет!
// SmartCook — твой ИИ-шеф» встаёт между ним и этим делом.
//
// Проверок ДВЕ, и вторая появилась после приёмки на живых устройствах:
//
//  1. сам маршрут приглашения — /shopping/join/<id>;
//  2. пометка «этот сеанс начался с приглашения» (sessionStorage).
//
// Одного маршрута оказалось мало: с экрана приглашения человек уходит через
// несколько секунд — на /shopping или по таб-бару, — и плашка встречала его
// уже там. Формально «не на приглашении», по ощущению — ровно посреди него.
//
// Проверяем на КЛИЕНТЕ через usePathname, а не серверным гейтом в root-layout
// по x-pathname (как сделано для isAdminRoute): тот считается один раз при
// серверном рендере и не пересчитывается при клиентской навигации — ровно та
// болячка, из-за которой таб-бар когда-то залипал поверх комнаты банкета.
function isQuietMoment(pathname: string): boolean {
  return pathname.startsWith("/shopping/join/") || isInviteFlow();
}

export default function OnboardingModal() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Важно: выходим ДО записи STORAGE_KEY. Иначе приглашение «сожгло» бы
    // единственный показ знакомства, и человек не увидел бы его никогда —
    // а он про приложение ещё ничего не знает.
    if (isQuietMoment(pathname)) return;
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
    // pathname в зависимостях обязателен: без него эффект отработает только при
    // первом монтировании, и человек, перешедший с приглашения на обычную
    // страницу уже внутри приложения (клиентская навигация), не увидел бы
    // знакомство вообще. Повторных показов это не создаёт — их отсекает
    // STORAGE_KEY.
  }, [pathname]);

  const close = () => setIsOpen(false);

  const handleClosed = () => {
    fireGoal("onboarding_closed");
    close();
  };

  const handlePhotoClick = () => {
    fireGoal("onboarding_photo_click");
    close();
    // После этапа 7 поле выбора фото живёт на /search (на Главной его нет).
    // Ведём туда с фокусом на зоне загрузки — как CTA на Главной (ничего не
    // открывается само, пользователь сам выбирает камеру или галерею).
    router.push("/search?focus=photo");
  };

  const handleShoppingClick = () => {
    fireGoal("onboarding_shopping_click");
    close();
    router.push("/shopping");
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
              <f.icon size={20} color="var(--color-accent)" style={{ flexShrink: 0, marginTop: "2px" }} />
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
          onClick={handleShoppingClick}
          style={{ marginTop: "var(--space-2)" }}
        >
          Список покупок
        </Button>
      </div>
    </div>
  );
}
