"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const SCENARIOS = [
  { id: "birthday", title: "День рождения", desc: "Торт, закуски и вау-эффект", emoji: "🎂" },
  { id: "newyear", title: "Новогодний стол", desc: "Без суеты в последний момент", emoji: "🎄" },
  { id: "bbq", title: "Шашлыки на даче", desc: "Мясо, гарниры и удобство", emoji: "🥩" },
  { id: "family", title: "Семейный ужин", desc: "Теплый стол на каждый вкус", emoji: "👨‍👩‍👧‍👦" },
];

export default function CreatePartyPage() {
  const router = useRouter();
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [guestCount, setGuestCount] = useState<number>(4);
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async () => {
    if (!selectedScenario) return;
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from("parties")
        .insert({
          title: selectedScenario,
          guest_count: guestCount,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      localStorage.setItem(`party_admin_${data.id}`, "true");
      router.push("/party/" + data.id);
    } catch (error) {
      console.error("Failed to create party:", error);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-16 px-4 sm:px-6 lg:px-8 font-sans text-zinc-900">
      <div className="max-w-2xl mx-auto">
        
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
          onClick={handleCreate}
          disabled={!selectedScenario || isLoading}
          className="w-full bg-black text-white text-lg font-medium py-4 rounded-2xl hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed transition-all shadow-md active:scale-[0.98]"
        >
          {isLoading ? "Подготавливаем меню..." : "Создать меню"}
        </button>
        
      </div>
    </div>
  );
}
