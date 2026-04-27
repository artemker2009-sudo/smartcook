"use client";

import { type FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

const SCENARIOS = [
  { id: "birthday", title: "День рождения", desc: "Торт, закуски и вау-эффект", emoji: "🎂" },
  { id: "newyear", title: "Новогодний стол", desc: "Без суеты в последний момент", emoji: "🎄" },
  { id: "bbq", title: "Шашлыки на даче", desc: "Мясо, гарниры и удобство", emoji: "🥩" },
  { id: "family", title: "Семейный ужин", desc: "Теплый стол на каждый вкус", emoji: "👨‍👩‍👧‍👦" },
];

export default function CreatePartyPage() {
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [guestCount, setGuestCount] = useState<number>(4);
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    alert(`Шаг 1: Кнопка нажата. Данные: ${selectedScenario ?? "без сценария"}, ${guestCount}`);

    if (!selectedScenario) {
      alert("Ошибка: не выбран сценарий банкета");
      return;
    }

    setIsLoading(true);
    const safetyTimeout = setTimeout(() => {
      setIsLoading(false);
      alert("Превышено время ожидания. Попробуйте нажать кнопку еще раз или проверьте интернет.");
    }, 15000);

    try {
      const parsedGuestCount = parseInt(String(guestCount).trim(), 10);
      const safeGuestCount = Number.isFinite(parsedGuestCount) && parsedGuestCount > 0 ? parsedGuestCount : 4;

      alert("Шаг 2: Данные готовы. Отправляем в Supabase...");

      const { data, error } = await supabase
        .from("parties")
        .insert([
          {
            title: selectedScenario,
            guest_count: safeGuestCount,
          },
        ])
        .select()
        .single();

      if (error) {
        alert(`Ошибка БД: ${error.message}`);
        console.error("Supabase Error:", error);
        throw error;
      }

      if (!data) {
        alert("Ошибка: БД не вернула data");
        throw new Error("No data returned");
      }

      if (!data.id) {
        alert("Ошибка: БД не вернула id созданного банкета");
        throw new Error("No party id returned");
      }

      alert(`Шаг 3: Банкет создан в БД! ID: ${data.id}. Сохраняем админа...`);

      try {
        localStorage.setItem(`party_admin_${data.id}`, "true");
      } catch (lsError) {
        alert(`Ошибка LocalStorage (возможно, инкогнито): ${String(lsError)}`);
      }

      alert("Шаг 4: Делаем редирект...");
      window.location.href = `/party/${data.id}`;
    } catch (error) {
      console.error("Ошибка при создании банкета:", error);
      alert(
        `Глобальная ошибка: ${
          error instanceof Error ? error.message : JSON.stringify(error)
        }`,
      );
    } finally {
      clearTimeout(safetyTimeout);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-16 px-4 sm:px-6 lg:px-8 font-sans text-zinc-900">
      <form className="max-w-2xl mx-auto" onSubmit={handleCreate}>
        
        <div className="text-center mb-12">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 mb-3">
            Организовать банкет
          </h1>
          <p className="text-lg text-zinc-500">
            Выберите повод и количество гостей. Синдром чистого листа отменяется.
          </p>
        </div>

        <div className="mb-8">
          <h2 className="text-lg font-medium mb-4 text-zinc-900">1. Выберите сценарий</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SCENARIOS.map((scenario) => {
              const isSelected = selectedScenario === scenario.title;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => setSelectedScenario(scenario.title)}
                  className={`relative flex flex-col items-start p-6 rounded-3xl border text-left transition-all duration-200 ${
                    isSelected
                      ? "border-black bg-white ring-2 ring-black shadow-md scale-[1.02]"
                      : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"
                  }`}
                >
                  <span className="text-3xl mb-3">{scenario.emoji}</span>
                  <span className="font-semibold text-lg text-zinc-900 mb-1">{scenario.title}</span>
                  <span className="text-sm text-zinc-500 leading-relaxed">{scenario.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-10 bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
          <label htmlFor="guests" className="block text-lg font-medium text-zinc-900 mb-3">
            2. На сколько персон готовим?
          </label>
          <input
            type="number"
            id="guests"
            min="1"
            value={guestCount}
            onChange={(e) => setGuestCount(Number(e.target.value))}
            className="w-full text-xl px-5 py-4 rounded-2xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
          />
        </div>

        <button
          type="submit"
          disabled={!selectedScenario || isLoading}
          className="w-full bg-black text-white text-lg font-medium py-4 rounded-2xl hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed transition-all shadow-md active:scale-[0.98]"
        >
          {isLoading ? "Подготавливаем меню..." : "Создать меню"}
        </button>
        
      </form>
    </div>
  );
}
