"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Sparkles, UtensilsCrossed } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

const MENU_CATEGORIES = ["Закуски", "Горячее блюдо", "Напитки"];

type Party = {
  id: string;
  title: string;
  guest_count: number;
};

type MenuIngredient = {
  name: string;
  amount: number;
  unit: string;
};

type MenuItem = {
  id?: string;
  party_id?: string;
  name: string;
  category: string;
  ingredients: MenuIngredient[] | string | null;
};

type PartyMessage = {
  id?: string;
  party_id?: string;
  user_name: string;
  text: string;
  created_at?: string;
};

export default function PartyRoomPage() {
  const params = useParams();
  const partyId = params.id as string;
  const router = useRouter();
  const [activeMobileTab, setActiveMobileTab] = useState<"menu" | "chat">("menu");
  const [party, setParty] = useState<Party | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [messages, setMessages] = useState<PartyMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [currentUser, setCurrentUser] = useState("Организатор");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isShoppingListOpen, setIsShoppingListOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function fetchParty() {
      if (!partyId) return;

      setIsLoading(true);

      try {
        const [{ data, error }, { data: items, error: itemsError }] = await Promise.all([
          supabase.from("parties").select("*").eq("id", partyId).single(),
          supabase.from("party_items").select("*").eq("party_id", partyId),
        ]);
        const { data: initialMessages } = await supabase
          .from("party_messages")
          .select("*")
          .eq("party_id", partyId)
          .order("created_at", { ascending: true });

        if (error) throw error;
        if (itemsError) throw itemsError;

        setParty(data);
        setMenuItems(items || []);
        setMessages(initialMessages || []);
      } catch (err) {
        console.error("Ошибка загрузки банкета:", err);
        setParty(null);
        setMenuItems([]);
        setMessages([]);
      } finally {
        setIsLoading(false);
      }
    }

    if (!partyId) return;

    const channel = supabase
      .channel(`party_messages:${partyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "party_messages",
          filter: `party_id=eq.${partyId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        },
      )
      .subscribe();

    void fetchParty();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [partyId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!newMessage.trim()) return;

    const { error } = await supabase.from("party_messages").insert({
      party_id: partyId,
      user_name: currentUser,
      text: newMessage.trim(),
    });

    if (error) {
      console.error("Ошибка отправки сообщения:", error);
      return;
    }

    setNewMessage("");
  }

  async function handleGenerateMenu() {
    if (!party) return;

    setIsGenerating(true);

    try {
      const response = await fetch("/api/party/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: party.title,
          guestCount: party.guest_count,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Не удалось сгенерировать меню");
      }

      const generatedMenu = Array.isArray(result.menu) ? result.menu : [];
      const itemsToInsert = generatedMenu.map((item: MenuItem) => ({
        party_id: partyId,
        name: item.name,
        category: item.category,
        ingredients: item.ingredients,
      }));

      if (itemsToInsert.length === 0) {
        setMenuItems([]);
        return;
      }

      const { data: insertedItems, error } = await supabase
        .from("party_items")
        .insert(itemsToInsert)
        .select("*");

      if (error) throw error;

      setMenuItems(insertedItems || itemsToInsert);
    } catch (err) {
      console.error("Ошибка генерации меню:", err);
    } finally {
      setIsGenerating(false);
    }
  }

  const guestCountLabel =
    typeof party?.guest_count === "number" ? `${party.guest_count} персон` : "Без гостей";

  const groupedMenuItems = MENU_CATEGORIES.map((category) => ({
    category,
    items: menuItems.filter((item) => item.category === category),
  }));

  const getAggregatedList = () => {
    const aggregatedIngredients = menuItems.reduce<MenuIngredient[]>((acc, item) => {
      if (!Array.isArray(item.ingredients)) {
        return acc;
      }

      item.ingredients.forEach((ingredient) => {
        const existingIngredient = acc.find(
          (currentIngredient) => currentIngredient.name === ingredient.name,
        );

        if (existingIngredient) {
          existingIngredient.amount += ingredient.amount;
          return;
        }

        acc.push({ ...ingredient });
      });

      return acc;
    }, []);

    return aggregatedIngredients.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  };

  const formatIngredients = (ingredients: MenuItem["ingredients"]) => {
    if (!ingredients) return "";

    if (typeof ingredients === "string") {
      return ingredients;
    }

    if (!Array.isArray(ingredients)) {
      return "";
    }

    return ingredients
      .map((ingredient) => `${ingredient.name} - ${ingredient.amount} ${ingredient.unit}`)
      .join(", ");
  };

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
              {!isLoading && menuItems.length === 0 && (
                <button
                  type="button"
                  onClick={handleGenerateMenu}
                  disabled={isGenerating || !party}
                  className="mb-8 w-full rounded-2xl bg-black py-5 text-lg font-medium text-white shadow-md transition-all hover:bg-zinc-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-zinc-400 disabled:shadow-none"
                >
                  <span className="inline-flex items-center gap-3">
                    <Sparkles className="h-5 w-5" />
                    <span>{isGenerating ? "Шеф-повар думает..." : "Сгенерировать меню с ИИ"}</span>
                  </span>
                </button>
              )}

              {groupedMenuItems.map(({ category, items }) => (
                <article
                  key={category}
                  className="mb-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"
                >
                  <h2 className="mb-2 text-xl font-semibold">{category}</h2>

                  {items.length > 0 ? (
                    <div className="space-y-4">
                      {items.map((item, index) => (
                        <div key={item.id || `${item.name}-${index}`}>
                          <p className="font-semibold text-zinc-900">{item.name}</p>
                          <p className="mt-1 text-sm text-zinc-500">
                            {formatIngredients(item.ingredients)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-zinc-500">Пока блюд нет</p>
                  )}
                </article>
              ))}

              <button
                type="button"
                onClick={() => setIsShoppingListOpen(true)}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-zinc-200 bg-white py-4 text-lg font-medium text-zinc-900 transition-all hover:border-black active:scale-[0.99]"
              >
                <span>🛒</span>
                <span>Показать список покупок</span>
              </button>
            </section>

            <aside
              className={`${activeMobileTab === "chat" ? "block" : "hidden"} lg:block lg:col-span-1`}
            >
              <div className="space-y-4 lg:sticky lg:top-24">
                <section className="flex h-[600px] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
                  <div className="border-b border-zinc-100 bg-zinc-50/50 px-5 py-3 font-medium">
                    Обсуждение
                  </div>
                  <div className="flex-1 overflow-y-auto bg-zinc-50/30 p-5">
                    {messages.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                        Пока сообщений нет
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {messages.map((message, index) => {
                          const isCurrentUserMessage = message.user_name === currentUser;

                          return (
                            <div
                              key={message.id || `${message.created_at}-${index}`}
                              className={`flex ${
                                isCurrentUserMessage ? "justify-end" : "justify-start"
                              }`}
                            >
                              <div
                                className={`max-w-[85%] ${
                                  isCurrentUserMessage ? "items-end" : "items-start"
                                } flex flex-col`}
                              >
                                <span className="mb-1 px-1 text-xs text-zinc-400">
                                  {message.user_name}
                                </span>
                                <div
                                  className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                                    isCurrentUserMessage
                                      ? "bg-blue-500 text-white"
                                      : "bg-zinc-200 text-zinc-900"
                                  }`}
                                >
                                  {message.text}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </div>
                  <form onSubmit={sendMessage} className="border-t border-zinc-100 p-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(event) => setNewMessage(event.target.value)}
                        placeholder="Написать сообщение..."
                        className="w-full rounded-full bg-zinc-100 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black/5"
                      />
                      <button
                        type="submit"
                        className="shrink-0 text-blue-500 font-medium px-2"
                      >
                        Отправить
                      </button>
                    </div>
                  </form>
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

      {isShoppingListOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-zinc-900/40 p-0 backdrop-blur-sm transition-opacity sm:items-center sm:p-4"
          onClick={() => setIsShoppingListOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl animate-in slide-in-from-bottom-10 sm:rounded-3xl sm:p-8 sm:zoom-in-95"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <h2 className="text-2xl font-semibold">Список покупок</h2>
              <button
                type="button"
                onClick={() => setIsShoppingListOpen(false)}
                className="text-zinc-400 transition-colors hover:text-black"
              >
                Закрыть
              </button>
            </div>

            <div className="space-y-4">
              {getAggregatedList().length > 0 ? (
                getAggregatedList().map((ingredient) => (
                  <label
                    key={`${ingredient.name}-${ingredient.unit}`}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="flex items-center gap-3 text-base text-zinc-900">
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded border-zinc-300 text-black focus:ring-black/10"
                      />
                      <span>{ingredient.name}</span>
                    </span>
                    <span className="text-sm text-zinc-400">
                      {ingredient.amount} {ingredient.unit}
                    </span>
                  </label>
                ))
              ) : (
                <p className="text-sm text-zinc-500">Список покупок появится после генерации меню.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
