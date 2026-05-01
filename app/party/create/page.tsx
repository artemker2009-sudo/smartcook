"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { ChevronLeft } from 'lucide-react';
import { bindPartyHostAction, createPartyAction } from '@/app/actions/party'; // Путь может немного отличаться, проверь алиас
import AuthModal from '@/components/modals/AuthModal';
import { supabase } from '@/lib/supabase';

const SCENARIOS = [
  { id: 'new_year', title: 'Новогодний стол', theme: 'Без суеты в последний момент', icon: '🎄' },
  { id: 'bbq', title: 'Шашлыки на даче', theme: 'Мясо, гарниры и удобство', icon: '🥩' },
  { id: 'family', title: 'Семейный ужин', theme: 'Теплый стол на каждый вкус', icon: '👨‍👩‍👧‍👦' },
  { id: 'birthday', title: 'День рождения', theme: 'Празднично и со вкусом', icon: '🎂' },
];

const GUEST_PARTIES_STORAGE_KEY = 'smartcook_guest_parties';
const PENDING_PARTY_STORAGE_KEY = 'smartcook_pending_party';

const saveGuestPartyId = (partyId: string) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(GUEST_PARTIES_STORAGE_KEY) || '[]');
    const currentIds = Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
    localStorage.setItem(GUEST_PARTIES_STORAGE_KEY, JSON.stringify([...new Set([...currentIds, partyId])]));
  } catch {
    localStorage.setItem(GUEST_PARTIES_STORAGE_KEY, JSON.stringify([partyId]));
  }
};

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "Неизвестная ошибка");

export default function CreatePartyPage() {
  const router = useRouter();
  const [selectedScenario, setSelectedScenario] = useState<(typeof SCENARIOS)[number] | null>(SCENARIOS[0]);
  const [customReason, setCustomReason] = useState("");
  const [guestCount, setGuestCount] = useState<string | number>(4);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [createdPartyId, setCreatedPartyId] = useState<string | null>(null);
  const [showSaveChoice, setShowSaveChoice] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user || null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const normalizedGuestCount = guestCount === "" ? 0 : Number(guestCount);
  const customTitle = customReason.trim();
  const partyTitle = customTitle || selectedScenario?.title || "";
  const partyTheme = customTitle ? "Свой повод" : selectedScenario?.theme || "";
  const isCreateDisabled = isLoading || !partyTitle || !Number.isFinite(normalizedGuestCount) || normalizedGuestCount <= 0;

  const redirectToParty = (partyId: string) => {
    localStorage.setItem(`party_admin_${partyId}`, 'true');
    window.location.href = `/party/${partyId}`;
  };

  const bindHostAndRedirect = async (partyId: string, hostId: string) => {
    const bindResult = await bindPartyHostAction(partyId, hostId);
    if (!bindResult.success) throw new Error(bindResult.error);

    localStorage.removeItem(PENDING_PARTY_STORAGE_KEY);
    redirectToParty(partyId);
  };

  const handleCreate = async () => {
    if (isCreateDisabled) return;

    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user || user;

      // Вызываем серверную функцию (никаких fetch-запросов с клиента!)
      const result = await createPartyAction(partyTitle, normalizedGuestCount, partyTheme, currentUser?.id);

      if (!result.success || !result.partyId) {
        throw new Error(result.error);
      }

      if (currentUser?.id) {
        redirectToParty(result.partyId);
        return;
      }

      setCreatedPartyId(result.partyId);
      setShowSaveChoice(true);
      setIsLoading(false);

    } catch (error) {
      alert(`Ошибка при создании: ${getErrorMessage(error)}`);
      setIsLoading(false);
    }
  };

  const handleLoginChoice = () => {
    if (!createdPartyId) return;

    localStorage.setItem(PENDING_PARTY_STORAGE_KEY, createdPartyId);
    setAuthMode('register');
    setAuthError("");
    setShowSaveChoice(false);
    setIsAuthModalOpen(true);
  };

  const handleIncognitoChoice = () => {
    if (!createdPartyId) return;

    saveGuestPartyId(createdPartyId);
    redirectToParty(createdPartyId);
  };

  const handleAuth = async () => {
    if (!authUsername.trim() || authPassword.length < 6) {
      setAuthError("Введите логин и пароль (мин. 6 символов)");
      return;
    }

    const safeUsername = authUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (safeUsername.length < 4) {
      setAuthError("Логин: только a-z, 0-9, _ (мин. 4 символа)");
      return;
    }

    setAuthLoading(true);
    setAuthError("");
    const dummyEmail = `${safeUsername}@smartcook.app`;

    try {
      const authResult = authMode === 'register'
        ? await supabase.auth.signUp({
            email: dummyEmail,
            password: authPassword,
            options: { data: { full_name: authUsername.trim(), username: safeUsername } },
          })
        : await supabase.auth.signInWithPassword({ email: dummyEmail, password: authPassword });

      if (authResult.error) {
        if (authResult.error.message.includes('already registered') || authResult.error.message.includes('User already exists')) {
          setAuthError("Этот Username уже занят! Выберите другой или войдите.");
          return;
        }

        if (authResult.error.message.includes('Invalid login credentials')) {
          setAuthError("Неверный Username или пароль!");
          return;
        }

        throw authResult.error;
      }

      const partyId = createdPartyId || localStorage.getItem(PENDING_PARTY_STORAGE_KEY);
      const authUser = authResult.data.user;
      if (!partyId || !authUser?.id) throw new Error("Не удалось сохранить комнату после входа");

      await bindHostAndRedirect(partyId, authUser.id);
    } catch (error) {
      setAuthError("Ошибка: " + getErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F7] p-4 font-sans text-black pb-24">
      <div className="max-w-md mx-auto space-y-6 pt-8">
        <button
          type="button"
          onClick={() => router.push('/parties')}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm ring-1 ring-zinc-200 transition hover:bg-zinc-50 active:scale-[0.98]"
        >
          <ChevronLeft size={18} />
          Назад
        </button>

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
                onClick={() => {
                  setSelectedScenario(scenario);
                  setCustomReason("");
                }}
                className={`flex flex-col items-start p-4 rounded-2xl border-2 transition-all text-left ${
                  selectedScenario?.id === scenario.id
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
          <input
            type="text"
            value={customReason}
            onChange={(e) => {
              setCustomReason(e.target.value);
              setSelectedScenario(null);
            }}
            placeholder="Или впишите свой повод..."
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-base font-medium outline-none transition-colors placeholder:text-zinc-400 focus:border-black"
          />
        </div>

        <div className="space-y-3 bg-white p-4 rounded-2xl border border-zinc-100">
          <h2 className="text-lg font-medium">2. На сколько персон готовим?</h2>
          <input
            type="number"
            min="1"
            max="100"
            value={guestCount}
            onChange={(e) => setGuestCount(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-4 text-xl font-medium outline-none focus:border-black transition-colors"
          />
        </div>

        <button
          onClick={handleCreate}
          disabled={isCreateDisabled}
          className="w-full bg-black text-white font-medium text-lg p-4 rounded-2xl active:scale-[0.98] transition-all disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 disabled:active:scale-100 mt-4"
        >
          {isLoading ? 'Создаем...' : 'Создать меню'}
        </button>
      </div>

      {showSaveChoice && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-md sm:items-center">
          <div className="w-full max-w-md animate-in slide-in-from-bottom-6 rounded-t-3xl border border-white/60 bg-white p-6 shadow-2xl sm:rounded-3xl sm:zoom-in-95">
            <div className="mb-6">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-orange-400">Сохранение комнаты</p>
                <h2 className="text-3xl font-black tracking-tight text-black">Где будем хранить рецепты? 🍳</h2>
              </div>
            </div>

            <div className="space-y-4">
              <button
                type="button"
                onClick={handleLoginChoice}
                className="w-full rounded-3xl bg-gradient-to-br from-orange-400 via-rose-500 to-fuchsia-600 p-5 text-left text-white shadow-xl shadow-rose-500/25 transition active:scale-[0.99]"
              >
                <span className="block text-lg font-black">Войти / Создать аккаунт</span>
                <span className="mt-2 block text-sm leading-6 text-white/85">
                  Твой банкет будет доступен с любого устройства и никогда не потеряется.
                </span>
              </button>

              <button
                type="button"
                onClick={handleIncognitoChoice}
                className="w-full rounded-3xl border border-zinc-200 bg-white p-5 text-left transition hover:bg-zinc-50 active:scale-[0.99]"
              >
                <span className="block text-lg font-black text-black">Остаться инкогнито 🥷</span>
                <span className="mt-2 block text-sm leading-6 text-zinc-500">
                  Сохраним только в этом браузере. Если почистишь кэш — комната сгорит 🫠
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => {
          setIsAuthModalOpen(false);
          if (createdPartyId) setShowSaveChoice(true);
        }}
        authMode={authMode}
        setAuthMode={setAuthMode}
        authUsername={authUsername}
        setAuthUsername={setAuthUsername}
        authPassword={authPassword}
        setAuthPassword={setAuthPassword}
        authLoading={authLoading}
        handleAuth={handleAuth}
      />

      {authError && (
        <div className="fixed left-4 right-4 top-4 z-[100001] mx-auto max-w-md rounded-2xl bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-600 shadow-lg">
          {authError}
        </div>
      )}
    </div>
  );
}
