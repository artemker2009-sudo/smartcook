"use client";

import { Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import ProcessAnimation from "@/components/ProcessAnimation";
import { reachGoal } from "@/lib/metrika";
import type { DemoChip } from "@/lib/demoChips";

/**
 * Первый экран Главной (H7/H10): заголовок про боль пользователя, ОДНА крупная
 * CTA «Сфотографировать продукты» под палец, под ней тихая текстовая ссылка
 * «или найти рецепт по названию» — второй сценарий не конкурирует за внимание с
 * основным. Разделы — реальные роуты, поэтому переходы навигационные: фото →
 * /search с фокусом на зоне загрузки (?focus=photo), текстовый поиск →
 * /search?focus=text (фокус на поле ввода). Банкеты убраны с первого экрана —
 * остаются в таб-баре. Никакой логики распознавания тут нет.
 */
export default function HeroLanding({ demoChips = [] }: { demoChips?: DemoChip[] }) {
  const router = useRouter();

  const handlePhotoClick = () => {
    // Цель Метрики — «мягко»: если ym не загрузился, переход всё равно сработает.
    reachGoal("cta_photo_click");
    router.push("/search?focus=photo");
  };

  const handleTextClick = () => {
    // Вход в текстовый поиск = переход на экран поиска → шлём nav_search
    // (та же цель, что и у таб-бара), сохраняя воронку целой.
    reachGoal("nav_search");
    router.push("/search?focus=text");
  };

  // H8 «магия без фото»: тап по демо-чипу → цель demo_chip_click (с параметром,
  // какой чип) + переход в поиск с ?demo=<ключ блюда>. Дальше SearchApp делает
  // строго кэш-запрос (0 расхода OpenAI), воронка считается text_search_*.
  const handleDemoChip = (chip: DemoChip) => {
    reachGoal("demo_chip_click", { chip: chip.key });
    router.push(`/search?demo=${encodeURIComponent(chip.key)}`);
  };

  return (
    <section className="hero-landing">
      <div className="hero-brand">SmartCook</div>
      <h1 className="hero-headline">
        Не знаете, <span className="hero-mark">что приготовить</span> из того,
        что есть дома?
      </h1>
      <p className="hero-subhead">
        Сфотографируйте продукты — и получите 3 варианта ужина за минуту.
      </p>

      <div className="hero-cta-group">
        <button type="button" className="btn-primary hero-cta" onClick={handlePhotoClick}>
          <Camera size={20} /> Сфотографировать продукты
        </button>
        <button type="button" className="hero-textlink" onClick={handleTextClick}>
          или найти рецепт по названию
        </button>
      </div>

      {/* H8 «магия без фото»: рабочее демо. Показываем ТОЛЬКО если сервер отдал
          прогретые в кэше чипы (иначе блок не рендерим). Тап → мгновенный рецепт
          из кэша, без камеры и регистрации. */}
      {demoChips.length > 0 && (
        <div className="demo-magic">
          <p className="demo-magic-caption">
            Или нажмите на продукты — покажем, что из них приготовить
          </p>
          <div className="demo-chip-row">
            {demoChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="demo-chip"
                onClick={() => handleDemoChip(chip)}
              >
                <span className="demo-chip-emoji" aria-hidden>{chip.emoji}</span>
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <ProcessAnimation />
    </section>
  );
}
