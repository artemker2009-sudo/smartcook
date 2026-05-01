"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronRight, Loader2, MoreHorizontal, Plus, UsersRound } from "lucide-react";

import { deletePartyAction, getHubParties, type HubParty } from "@/app/actions/party";
import AppNavigation from "@/components/AppNavigation";
import { supabase } from "@/lib/supabase";

const GUEST_PARTIES_STORAGE_KEY = "smartcook_guest_parties";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const readLocalPartyIds = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(GUEST_PARTIES_STORAGE_KEY) || "[]");

    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
  } catch {
    return [];
  }
};

const removeLocalPartyId = (partyId: string) => {
  try {
    const nextIds = readLocalPartyIds().filter((id) => id !== partyId);
    localStorage.setItem(GUEST_PARTIES_STORAGE_KEY, JSON.stringify(nextIds));
  } catch {
    localStorage.setItem(GUEST_PARTIES_STORAGE_KEY, JSON.stringify([]));
  }
};

const formatCreatedAt = (createdAt: string | null) => {
  if (!createdAt) return "Дата не указана";

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Дата не указана";

  return dateFormatter.format(date);
};

const formatGuests = (guestCount: number | null) => {
  if (typeof guestCount !== "number") return null;

  const mod10 = guestCount % 10;
  const mod100 = guestCount % 100;
  const noun = mod10 === 1 && mod100 !== 11 ? "гость" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "гостя" : "гостей";

  return `${guestCount} ${noun}`;
};

const cardActionButtonClass =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-50 text-zinc-500 shadow-sm ring-1 ring-zinc-100 transition-colors hover:bg-zinc-200 hover:text-zinc-950";

function HubSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="min-h-[208px] animate-pulse rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
        >
          <div className="mb-8 h-10 w-10 rounded-2xl bg-zinc-100" />
          <div className="h-6 w-3/4 rounded-full bg-zinc-100" />
          <div className="mt-4 h-4 w-full rounded-full bg-zinc-100" />
          <div className="mt-2 h-4 w-2/3 rounded-full bg-zinc-100" />
          <div className="mt-8 flex gap-3">
            <div className="h-8 w-28 rounded-full bg-zinc-100" />
            <div className="h-8 w-24 rounded-full bg-zinc-100" />
          </div>
        </div>
      ))}
    </>
  );
}

function CreatePartyCard() {
  return (
    <Link
      href="/party/create"
      className="group relative flex min-h-[208px] overflow-hidden rounded-[28px] bg-zinc-950 p-6 text-white shadow-[0_24px_70px_rgba(9,9,11,0.22)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_80px_rgba(9,9,11,0.28)]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.55),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(244,63,94,0.5),transparent_34%)]" />
      <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full border border-white/15" />
      <div className="relative z-10 flex h-full w-full flex-col justify-between">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
              <Plus size={24} strokeWidth={2.6} />
            </span>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/65">Новый стол</p>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors group-hover:bg-white/25">
            <ChevronRight size={20} />
          </span>
        </div>
        <div>
          <h2 className="text-2xl font-black tracking-tight">Создать новый банкет</h2>
          <p className="mt-3 max-w-xs text-sm leading-6 text-white/70">
            Запустите меню, пригласите гостей и соберите блюда без хаоса в чатах.
          </p>
        </div>
      </div>
    </Link>
  );
}

function PartyCard({ party, onRequestDelete }: { party: HubParty; onRequestDelete: (party: HubParty) => void }) {
  const router = useRouter();
  const guests = formatGuests(party.guest_count);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/party/${party.id}`)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(`/party/${party.id}`);
        }
      }}
      className="group relative flex min-h-[208px] cursor-pointer flex-col justify-between rounded-[28px] border border-white/80 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(15,23,42,0.12)]"
    >
      <div>
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-2xl">🍽️</div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRequestDelete(party);
            }}
            className={cardActionButtonClass}
            aria-label="Открыть действия банкета"
          >
            <MoreHorizontal size={20} />
          </button>
        </div>
        <h2 className="truncate text-2xl font-black tracking-tight text-zinc-950">
          {party.title?.trim() || "Без названия"}
        </h2>
        <p
          className="mt-3 min-h-[48px] overflow-hidden text-sm leading-6 text-zinc-500"
          style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}
        >
          {party.theme?.trim() || "Тема банкета пока не указана"}
        </p>
      </div>

      <div className="mt-7 flex flex-wrap gap-2 text-xs font-bold text-zinc-500">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-50 px-3 py-2">
          <CalendarDays size={14} />
          {formatCreatedAt(party.created_at)}
        </span>
        {guests && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-50 px-3 py-2">
            <UsersRound size={14} />
            {guests}
          </span>
        )}
      </div>
    </article>
  );
}

export default function PartiesHubPage() {
  const [parties, setParties] = useState<HubParty[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [partyToDelete, setPartyToDelete] = useState<HubParty | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let isCancelled = false;

    const loadParties = async () => {
      setIsLoading(true);
      setError("");

      try {
        const localIds = readLocalPartyIds();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const nextParties = await getHubParties(session?.user?.id ?? null, localIds);

        if (!isCancelled) {
          setParties(nextParties);
        }
      } catch (loadError) {
        console.error("Hub parties load error:", loadError);

        if (!isCancelled) {
          setError("Не удалось загрузить банкеты. Попробуйте обновить страницу.");
          setParties([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadParties();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadParties();
    });

    return () => {
      isCancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleConfirmDelete = async () => {
    if (!partyToDelete) return;

    setIsDeleting(true);
    setDeleteError("");

    try {
      const result = await deletePartyAction(partyToDelete.id);

      if (!result.success) {
        throw new Error(result.error);
      }

      removeLocalPartyId(partyToDelete.id);
      setParties((currentParties) => currentParties.filter((party) => party.id !== partyToDelete.id));
      setPartyToDelete(null);
    } catch (deleteError) {
      console.error("Party delete error:", deleteError);
      setDeleteError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить банкет.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#f5f5f7] px-4 pb-8 pt-24 text-zinc-950 sm:px-6 sm:pt-28 lg:px-8">
      <AppNavigation activeSection="parties" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.22),transparent_62%)]" />

      <div className="relative mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-3 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-orange-500">SmartCook Hub</p>
            <h1 className="text-4xl font-black tracking-[-0.04em] text-zinc-950 sm:text-6xl">Мои банкеты</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-500">
              Все ваши банкетные комнаты в одном месте: личные, сохраненные в браузере и недавние гостевые.
            </p>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-3xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <CreatePartyCard />
          {isLoading ? (
            <HubSkeleton />
          ) : (
            parties.map((party) => <PartyCard key={party.id} party={party} onRequestDelete={setPartyToDelete} />)
          )}
        </section>

        {!isLoading && parties.length === 0 && (
          <section className="mt-8 rounded-[32px] border border-dashed border-zinc-200 bg-white/70 px-6 py-14 text-center shadow-[0_18px_60px_rgba(15,23,42,0.05)] backdrop-blur">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-orange-50 text-4xl">🍽️</div>
            <h2 className="text-2xl font-black tracking-tight text-zinc-950">У вас пока нет ни одного банкета.</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500">
              Самое время это исправить! Создайте первую комнату и соберите меню вместе с гостями.
            </p>
          </section>
        )}
      </div>

      {partyToDelete && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/35 px-4 backdrop-blur-md">
          <div className="w-full max-w-sm scale-100 rounded-[32px] border border-white/70 bg-white/95 p-6 text-center shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
            <h2 className="text-2xl font-black tracking-tight text-zinc-950">Удалить банкет?</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-500">
              Это действие безвозвратно. Меню, чат и список гостей будут стерты навсегда.
            </p>

            {deleteError && (
              <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                {deleteError}
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!isDeleting) {
                    setPartyToDelete(null);
                    setDeleteError("");
                  }
                }}
                disabled={isDeleting}
                className="rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-bold text-zinc-700 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isDeleting && <Loader2 size={16} className="animate-spin" />}
                Да, удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
