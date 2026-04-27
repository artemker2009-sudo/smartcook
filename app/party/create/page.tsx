"use client";

import { useState } from 'react';
import { createPartyAction } from '@/app/actions/party'; // Путь может немного отличаться, проверь алиас

const SCENARIOS = [
  { id: 'new_year', title: 'Новогодний стол', theme: 'Без суеты в последний момент', icon: '🎄' },
  { id: 'bbq', title: 'Шашлыки на даче', theme: 'Мясо, гарниры и удобство', icon: '🥩' },
  { id: 'family', title: 'Семейный ужин', theme: 'Теплый стол на каждый вкус', icon: '👨‍👩‍👧‍👦' },
  { id: 'birthday', title: 'День рождения', theme: 'Празднично и со вкусом', icon: '🎂' },
];

export default function CreatePartyPage() {
  const [selectedScenario, setSelectedScenario] = useState(SCENARIOS[0]);
  const [guestCount, setGuestCount] = useState(4);
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async () => {
    setIsLoading(true);

    try {
      // Вызываем серверную функцию (никаких fetch-запросов с клиента!)
      const result = await createPartyAction(selectedScenario.title, guestCount, selectedScenario.theme);

      if (!result.success || !result.partyId) {
        throw new Error(result.error);
      }

      // Сохраняем флаг создателя в localStorage, чтобы в комнате дать права хоста
      localStorage.setItem(`party_admin_${result.partyId}`, 'true');

      // Жесткий редирект для iOS
      window.location.href = `/party/${result.partyId}`;

    } catch (error: any) {
      alert(`Ошибка при создании: ${error.message}`);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F7] p-4 font-sans text-black pb-24">
      <div className="max-w-md mx-auto space-y-6 pt-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Организовать банкет</h1>
          <p className="text-zinc-500 text-sm">Выберите повод и количество гостей.</p>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-medium">1. Выберите сценарий</h2>
          <div className="grid gap-3">
            {SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                onClick={() => setSelectedScenario(scenario)}
                className={`flex flex-col items-start p-4 rounded-2xl border-2 transition-all text-left ${
                  selectedScenario.id === scenario.id 
                    ? 'border-black bg-white shadow-sm' 
                    : 'border-transparent bg-white/60 hover:bg-white'
                }`}
              >
                <span className="text-2xl mb-2">{scenario.icon}</span>
                <span className="font-semibold text-lg">{scenario.title}</span>
                <span className="text-sm text-zinc-500">{scenario.theme}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 bg-white p-4 rounded-2xl border border-zinc-100">
          <h2 className="text-lg font-medium">2. На сколько персон готовим?</h2>
          <input
            type="number"
            min="1"
            max="100"
            value={guestCount}
            onChange={(e) => setGuestCount(parseInt(e.target.value) || 1)}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-4 text-xl font-medium outline-none focus:border-black transition-colors"
          />
        </div>

        <button
          onClick={handleCreate}
          disabled={isLoading}
          className="w-full bg-black text-white font-medium text-lg p-4 rounded-2xl active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100 mt-4"
        >
          {isLoading ? 'Создаем...' : 'Создать меню'}
        </button>
      </div>
    </div>
  );
}
