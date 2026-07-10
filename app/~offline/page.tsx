import type { Metadata } from "next";
import OfflineRetryButton from "@/components/OfflineRetryButton";

// Офлайн-фолбэк PWA. @ducanh2912/next-pwa автоматически находит этот маршрут
// (app/~offline/page.*), кладёт его в precache и подставляет как документ-фолбэк:
// когда навигация к странице проваливается из-за отсутствия сети и её нет в
// рантайм-кэше, сервис-воркер отдаёт именно эту страницу. Без офлайн-заглушки
// TWA не проходит ревью Google Play.
//
// Страница самодостаточна (инлайновые стили), чтобы корректно отрисоваться, даже
// если что-то из precache недоступно. Не индексируется — это служебный экран.
export const metadata: Metadata = {
  title: "Нет соединения — SmartCook",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#faf9f7",
        color: "#1c1917",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <div
          aria-hidden
          style={{
            width: 72,
            height: 72,
            margin: "0 auto 24px",
            borderRadius: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(5,150,105,0.1)",
            fontSize: 34,
          }}
        >
          📡
        </div>
        <h1 style={{ fontSize: 26, margin: "0 0 12px", fontWeight: 700 }}>
          Нет соединения
        </h1>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.5,
            margin: "0 0 28px",
            color: "#57534e",
          }}
        >
          Похоже, интернет пропал. Проверьте подключение — и мы снова покажем,
          что приготовить из того, что есть дома.
        </p>
        <OfflineRetryButton />
      </div>
    </main>
  );
}
