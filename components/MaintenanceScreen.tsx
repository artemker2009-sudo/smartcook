import { Send } from "lucide-react";
import ProcessAnimation from "@/components/ProcessAnimation";

const TELEGRAM_CHANNEL_URL = "https://t.me/smartcook2026";

/**
 * Экран технического обслуживания в общем дизайн-языке SmartCook.
 * Анимация процесса (фото → продукты → рецепт) — та же, что на главной, и она
 * на чистом CSS, поэтому «живёт» даже без гидрации. Пользователю показываем,
 * что умеет сервис, и приглашаем в Telegram, пока идёт обновление.
 */
export default function MaintenanceScreen() {
  return (
    <main className="maint">
      <div className="maint-inner">
        <div className="maint-badge">
          <span className="maint-dot" /> Скоро вернёмся
        </div>

        <div className="maint-brand">SmartCook</div>

        <h1 className="hero-headline">Обновляем кухню</h1>
        <p className="hero-subhead">
          Наводим порядок и готовим новые фишки. А пока — посмотрите, как работает
          SmartCook, и подпишитесь на наш Telegram, чтобы не пропустить запуск.
        </p>

        {/* Та же «завораживающая» сцена, что на первом экране */}
        <ProcessAnimation />
        <p className="maint-caption">
          Фото продуктов → 3 варианта ужина за минуту
        </p>

        <div className="maint-cta">
          <a
            className="btn-primary"
            href={TELEGRAM_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Send size={18} /> Подписаться в Telegram
          </a>
        </div>

        <p className="maint-thanks">Спасибо, что вы с нами 💚</p>
      </div>
    </main>
  );
}
