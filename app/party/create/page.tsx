"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cake, ChevronLeft, Flame, Loader2, TreePine, Users, UsersRound, type LucideIcon } from 'lucide-react';
import { bindPartyHostAction, createPartyAction } from '@/app/actions/party';
import AuthModal from '@/components/modals/AuthModal';
import { supabase } from '@/lib/supabase';

type Scenario = {
  id: string;
  title: string;
  theme: string;
  Icon: LucideIcon;
  iconClassName: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: 'new_year',
    title: 'Новогодний стол',
    theme: 'Без суеты в последний момент',
    Icon: TreePine,
    iconClassName: 'bg-emerald-100 text-emerald-700',
  },
  {
    id: 'bbq',
    title: 'Шашлыки на даче',
    theme: 'Мясо, гарниры и удобство',
    Icon: Flame,
    iconClassName: 'bg-orange-100 text-orange-600',
  },
  {
    id: 'family',
    title: 'Семейный ужин',
    theme: 'Теплый стол на каждый вкус',
    Icon: Users,
    iconClassName: 'bg-blue-100 text-blue-600',
  },
  {
    id: 'birthday',
    title: 'День рождения',
    theme: 'Празднично и со вкусом',
    Icon: Cake,
    iconClassName: 'bg-rose-100 text-rose-600',
  },
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
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(SCENARIOS[0]);
  const [customReason, setCustomReason] = useState("");
  const [guestCount, setGuestCount] = useState<string | number>(4);
  const [isLoading, setIsLoading] = useState(false);
  const [createdPartyId, setCreatedPartyId] = useState<string | null>(null);
  const [showSaveChoice, setShowSaveChoice] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [createError, setCreateError] = useState("");

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
    setCreateError("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user ?? null;

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
      setCreateError(`Ошибка при создании: ${getErrorMessage(error)}`);
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
    <div className="min-h-screen overflow-hidden bg-[#f5f5f7] px-4 pb-24 pt-5 font-sans text-zinc-950">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.24),transparent_44%),radial-gradient(circle_at_top_right,rgba(244,63,94,0.18),transparent_42%)]" />
      <div className="relative mx-auto max-w-md space-y-8">
        <header className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/80 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-orange-200/50 blur-2xl" />
          <div className="absolute -bottom-20 left-10 h-36 w-36 rounded-full bg-rose-200/45 blur-2xl" />
          <div className="relative">
            <button
              type="button"
              onClick={() => router.push('/parties')}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-bold text-zinc-700 shadow-sm ring-1 ring-zinc-200 transition hover:bg-white active:scale-[0.98]"
            >
              <ChevronLeft size={18} />
              Назад
            </button>

            <div className="mt-8">
              <h1 className="text-4xl font-black tracking-[-0.04em]">Организовать банкет</h1>
              <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-500">
                Выберите сценарий, задайте гостей, а SmartCook соберет комнату для совместного меню.
              </p>
            </div>
          </div>
        </header>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-500">Шаг 1</p>
              <h2 className="mt-1 text-xl font-black tracking-tight">Выберите сценарий</h2>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-zinc-400 shadow-sm ring-1 ring-zinc-100">
              {selectedScenario ? "Выбрано" : "Свой повод"}
            </span>
          </div>

          <div className="grid gap-3">
            {SCENARIOS.map((scenario) => {
              const isSelected = selectedScenario?.id === scenario.id;

              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => {
                    setSelectedScenario(scenario);
                    setCustomReason("");
                  }}
                  className={`group flex cursor-pointer items-center gap-4 rounded-[24px] border p-4 text-left transition-all duration-200 active:scale-[0.99] ${
                    isSelected
                      ? 'border-zinc-950 bg-white shadow-[0_16px_45px_rgba(15,23,42,0.10)] ring-2 ring-zinc-950'
                      : 'border-white/80 bg-white/65 shadow-sm hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_14px_36px_rgba(15,23,42,0.08)]'
                  }`}
                  aria-pressed={isSelected}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${scenario.iconClassName}`}
                  >
                    <scenario.Icon size={22} strokeWidth={2.4} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-lg font-black tracking-tight">{scenario.title}</span>
                    <span className="mt-1 block text-sm leading-5 text-zinc-500">{scenario.theme}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-zinc-600">Или свой повод</span>
            <input
              type="text"
              value={customReason}
              onChange={(e) => {
                setCustomReason(e.target.value);
                setSelectedScenario(null);
                setCreateError("");
              }}
              placeholder="Например: ужин для команды"
              className="w-full rounded-[22px] border border-white/80 bg-white px-5 py-4 text-base font-semibold outline-none shadow-sm transition-all placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950"
            />
          </label>
        </section>

        <section className="space-y-4 rounded-[28px] border border-white/80 bg-white/85 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-500">Шаг 2</p>
            <h2 className="mt-1 text-xl font-black tracking-tight">На сколько персон готовим?</h2>
          </div>
          <div className="relative">
            <UsersRound className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
            <input
              type="number"
              min="1"
              max="100"
              inputMode="numeric"
              value={guestCount}
              onChange={(e) => {
                setGuestCount(e.target.value === "" ? "" : Number(e.target.value));
                setCreateError("");
              }}
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 py-4 pl-12 pr-4 text-xl font-black outline-none transition-all focus:border-zinc-950 focus:bg-white focus:ring-2 focus:ring-zinc-950"
            />
          </div>
          {(!Number.isFinite(normalizedGuestCount) || normalizedGuestCount <= 0) && (
            <p className="text-sm font-semibold text-red-500">Укажите хотя бы одного гостя.</p>
          )}
        </section>

        {createError && (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
            {createError}
          </div>
        )}

        <button
          type="button"
          onClick={handleCreate}
          disabled={isCreateDisabled}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[24px] bg-zinc-950 p-5 text-lg font-black text-white shadow-[0_20px_55px_rgba(9,9,11,0.22)] transition-all hover:-translate-y-0.5 hover:bg-black hover:shadow-[0_24px_65px_rgba(9,9,11,0.28)] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none disabled:hover:translate-y-0 disabled:active:scale-100"
        >
          {isLoading && <Loader2 size={20} className="animate-spin" />}
          {isLoading ? 'Создаем комнату...' : 'Создать меню'}
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
