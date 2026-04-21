"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, Sparkles, UtensilsCrossed } from "lucide-react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

const MENU_CATEGORIES = ["Закуски", "Горячее блюдо", "Напитки"];

type Party = {
  id: string;
  title: string;
  guest_count: number;
};

export default function PartyRoomPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [activeMobileTab, setActiveMobileTab] = useState<"menu" | "chat">("menu");
  const [party, setParty] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchParty = async () => {
      setIsLoading(true);

      const { data, error } = await supabase
        .from("parties")
        .select("id, title, guest_count")
        .eq("id", params.id)
        .maybeSingle<Party>();

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("Failed to fetch party:", error);
        setParty(null);
        setIsLoading(false);
        return;
      }

      setParty(data);
      setIsLoading(false);
    };

    void fetchParty();

    return () => {
      isMounted = false;
    };
  }, [params.id]);

  const guestCountLabel =
    typeof party?.guest_count === "number" ? `${party.guest_count} персон` : "Без гостей";

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Назад</span>
          </button>

          <div className="min-w-0 flex-1">
            {isLoading ? (
              <div className="space-y-2 py-1">
                <div className="h-4 w-48 animate-pulse rounded-full bg-zinc-200" />
                <div className="h-3 w-28 animate-pulse rounded-full bg-zinc-100" />
              </div>
            ) : party ? (
              <p className="truncate text-base font-semibold text-zinc-900">
                {party.title} • {party.guest_count} персон
              </p>
            ) : (
              <p className="truncate text-base font-semibold text-zinc-900">Банкет не найден</p>
            )}
          </div>
        </div>
      </header>

      {!isLoading && !party ? (
        <main className="mx-auto flex min-h-[calc(100vh-81px)] max-w-7xl items-center px-4 py-8">
          <section className="w-full rounded-[2rem] border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <h1 className="mb-3 text-2xl font-semibold text-zinc-900">Банкет не найден</h1>
            <p className="mx-auto mb-6 max-w-md text-sm leading-6 text-zinc-500">
              Возможно, ссылка устарела или этот банкет был удален. Вернитесь на главную и создайте
              новый.
            </p>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              На главную
            </button>
          </section>
        </main>
      ) : (
        <main className="mx-auto max-w-7xl px-4 py-8 pb-24 lg:pb-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <section
              className={`${activeMobileTab === "menu" ? "block" : "hidden"} lg:block lg:col-span-2`}
            >
              <button
                type="button"
                className="mb-8 w-full rounded-2xl bg-black py-5 text-lg font-medium text-white shadow-md transition-all hover:bg-zinc-800 active:scale-[0.99]"
              >
                <span className="inline-flex items-center gap-3">
                  <Sparkles className="h-5 w-5" />
                  <span>Сгенерировать меню с ИИ</span>
                </span>
              </button>

              {MENU_CATEGORIES.map((category) => (
                <article
                  key={category}
                  className="mb-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"
                >
                  <h2 className="mb-2 text-xl font-semibold">{category}</h2>
                  <p className="text-zinc-500">Здесь появятся предложенные блюда...</p>
                </article>
              ))}
            </section>

            <aside
              className={`${activeMobileTab === "chat" ? "block" : "hidden"} lg:block lg:col-span-1`}
            >
              <div className="space-y-4 lg:sticky lg:top-24">
                <section className="flex h-[600px] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
                  <div className="border-b border-zinc-100 bg-zinc-50/50 px-5 py-3 font-medium">
                    Обсуждение
                  </div>
                  <div className="flex flex-1 items-center justify-center bg-zinc-50/30 p-5 text-sm text-zinc-400">
                    Пока сообщений нет
                  </div>
                  <div className="border-t border-zinc-100 p-4">
                    <input
                      type="text"
                      placeholder="Написать сообщение..."
                      className="w-full rounded-full bg-zinc-100 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black/5"
                    />
                  </div>
                </section>

                <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Гости</h2>
                    <span className="text-sm text-zinc-500">
                      {isLoading ? "Загружаем..." : guestCountLabel}
                    </span>
                  </div>

                  <div className="rounded-2xl bg-zinc-50 px-4 py-6 text-sm text-zinc-500">
                    Список гостей подключим следующим шагом. Пока держим фокус на структуре меню и
                    чате.
                  </div>
                </section>
              </div>
            </aside>
          </div>
        </main>
      )}

      {party && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-around border-t border-zinc-200 bg-white/80 p-2 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setActiveMobileTab("menu")}
            className={`flex min-w-[120px] flex-col items-center gap-1 rounded-2xl px-4 py-2 text-sm font-medium transition-colors ${
              activeMobileTab === "menu" ? "text-black" : "text-zinc-400"
            }`}
          >
            <UtensilsCrossed className="h-5 w-5" />
            <span>Меню</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMobileTab("chat")}
            className={`flex min-w-[120px] flex-col items-center gap-1 rounded-2xl px-4 py-2 text-sm font-medium transition-colors ${
              activeMobileTab === "chat" ? "text-black" : "text-zinc-400"
            }`}
          >
            <MessageCircle className="h-5 w-5" />
            <span>Чат</span>
          </button>
        </nav>
      )}
    </div>
  );
}
