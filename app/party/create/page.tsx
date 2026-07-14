"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cake, ChevronLeft, Flame, Loader2, TreePine, Users, UsersRound, type LucideIcon } from 'lucide-react';
import { bindPartyHostAction, createPartyAction } from '@/app/actions/party';
import AuthModal from '@/components/modals/AuthModal';
import { useAuthModal } from '@/components/modals/useAuthModal';
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
  const [createError, setCreateError] = useState("");

  // Регистрация/вход — общий хук (см. components/modals/useAuthModal). Хозяина
  // комнаты привязываем сразу после входа, а редиректим только когда флоу
  // закрыт: у регистрации между ними есть экран с кодом восстановления.
  const { open: openAuthModal, authModalProps } = useAuthModal({
    onAuthenticated: async (authedUser) => {
      const partyId = createdPartyId || localStorage.getItem(PENDING_PARTY_STORAGE_KEY);
      if (!partyId) throw new Error("Не удалось сохранить комнату после входа");

      const bindResult = await bindPartyHostAction(partyId, authedUser.id);
      if (!bindResult.success) throw new Error(bindResult.error);

      localStorage.removeItem(PENDING_PARTY_STORAGE_KEY);
    },
    onFinished: () => {
      if (createdPartyId) redirectToParty(createdPartyId);
    },
  });

  const normalizedGuestCount = guestCount === "" ? 0 : Number(guestCount);
  const customTitle = customReason.trim();
  const partyTitle = customTitle || selectedScenario?.title || "";
  const partyTheme = customTitle ? "Свой повод" : selectedScenario?.theme || "";
  const isCreateDisabled = isLoading || !partyTitle || !Number.isFinite(normalizedGuestCount) || normalizedGuestCount <= 0;

  const redirectToParty = (partyId: string) => {
    localStorage.setItem(`party_admin_${partyId}`, 'true');
    window.location.href = `/party/${partyId}`;
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
    setShowSaveChoice(false);
    openAuthModal('register');
  };

  const handleIncognitoChoice = () => {
    if (!createdPartyId) return;

    saveGuestPartyId(createdPartyId);
    redirectToParty(createdPartyId);
  };


  return (
    <div className="min-h-screen overflow-hidden bg-[#faf9f7] px-4 pb-24 pt-5 font-sans text-zinc-950">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,rgba(5,150,105,0.07),transparent_60%)]" />
      <div className="relative mx-auto max-w-md space-y-8">
        <header className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/80 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-emerald-200/40 blur-2xl" />
          <div className="absolute -bottom-20 left-10 h-36 w-36 rounded-full bg-emerald-100/50 blur-2xl" />
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
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-600">Шаг 1</p>
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
                      ? 'border-emerald-500 bg-white shadow-[0_16px_45px_rgba(5,150,105,0.14)] ring-2 ring-emerald-500'
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
              className="w-full rounded-[22px] border border-white/80 bg-white px-5 py-4 text-base font-semibold outline-none shadow-sm transition-all placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
            />
          </label>
        </section>

        <section className="space-y-4 rounded-[28px] border border-white/80 bg-white/85 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-600">Шаг 2</p>
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
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 py-4 pl-12 pr-4 text-xl font-black outline-none transition-all focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500"
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
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[24px] bg-emerald-600 p-5 text-lg font-black text-white shadow-[0_18px_45px_rgba(5,150,105,0.3)] transition-all hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-[0_22px_55px_rgba(5,150,105,0.36)] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none disabled:hover:translate-y-0 disabled:active:scale-100"
        >
          {isLoading && <Loader2 size={20} className="animate-spin" />}
          {isLoading ? 'Создаем комнату...' : 'Создать банкет'}
        </button>
      </div>

      {showSaveChoice && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-md sm:items-center">
          <div className="w-full max-w-md animate-in slide-in-from-bottom-6 overflow-hidden rounded-3xl border border-white/60 bg-white p-6 shadow-2xl sm:zoom-in-95">
            <div className="mb-6">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">Сохранение комнаты</p>
                <h2 className="text-3xl font-black tracking-tight text-black">Где сохраним этот банкет? 🥂</h2>
              </div>
            </div>

            <div className="space-y-4">
              <button
                type="button"
                onClick={handleLoginChoice}
                className="w-full rounded-3xl bg-emerald-600 p-5 text-left text-white shadow-xl shadow-emerald-600/25 transition hover:bg-emerald-700 active:scale-[0.99]"
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
        {...authModalProps}
        onClose={() => {
          authModalProps.onClose();
          if (createdPartyId) setShowSaveChoice(true);
        }}
      />

    </div>
  );
}
