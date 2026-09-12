"use client";

import { Camera, ListChecks, Volume2 } from "lucide-react";
import { useRouter } from "next/navigation";
import ProcessAnimation from "@/components/ProcessAnimation";
import { reachGoal } from "@/lib/metrika";
import type { DemoChip } from "@/lib/demoChips";

// Три шага сценария. Над подписями крутится ProcessAnimation: сцена «фото
// холодильника» → «три блюда» → «читаю вслух». Подпись активного шага
// подсвечивается ТЕМ ЖЕ циклом (класс how-step-N и @keyframes howStepN в
// globals.css той же длины, что и сцены) — никакого JS для синхронизации не
// нужно, а значит нечему разъезжаться.
const STEPS = [
  { icon: Camera, label: "Сфотографируйте" },
  { icon: ListChecks, label: "Выберите из трёх" },
  { icon: Volume2, label: "Готовьте под голос" },
] as const;

/**
 * «Как это работает» + демо-чипы H8 под ним.
 *
 * Чипы переехали сюда с первого экрана: это второй по кликам элемент Главной
 * (demo_chip_click), терять его нельзя, но на первом экране он был второй
 * кнопкой. Механика прежняя: тап → цель demo_chip_click с ключом чипа →
 * /search?demo=<ключ>, дальше SearchApp делает строго кэш-запрос (0 расхода
 * OpenAI). Показываем только чипы, реально прогретые в dish_cache (проверка на
 * сервере, app/page.tsx); пусто — блок чипов не рендерим вовсе.
 */
export default function HowItWorks({ demoChips = [] }: { demoChips?: DemoChip[] }) {
  const router = useRouter();

  const handleDemoChip = (chip: DemoChip) => {
    reachGoal("demo_chip_click", { chip: chip.key });
    router.push(`/search?demo=${encodeURIComponent(chip.key)}`);
  };

  return (
    <section className="how-block">
      {/* Анимация и подписи — один блок в тонкой рамке. Демо-чипы ниже
          сознательно ОСТАЮТСЯ за рамкой: это отдельное предложение
          «попробовать без фото», а не часть объяснения сценария. */}
      <div className="how-card">
        <ProcessAnimation />

        <ol className="how-steps">
          {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={step.label} className={`how-step how-step-${i + 1}`}>
              <span className="how-step-icon" aria-hidden>
                <Icon size={22} />
              </span>
              <span className="how-step-label">{step.label}</span>
              {i < STEPS.length - 1 && (
                <span className="how-step-arrow" aria-hidden>
                  →
                </span>
              )}
            </li>
          );
        })}
        </ol>
      </div>

      {demoChips.length > 0 && (
        <div className="demo-magic">
          <p className="demo-magic-caption">Попробовать без фото:</p>
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
    </section>
  );
}
