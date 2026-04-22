"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Sparkles, Trash2, UtensilsCrossed } from "lucide-react";
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

const formatTime = (isoString: string) => {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
};

export default function PartyRoomPage() {
  const params = useParams();
  const partyId = params.id as string;
  const router = useRouter();
  const [activeMobileTab, setActiveMobileTab] = useState<"menu" | "chat">("menu");
  const [isAdmin, setIsAdmin] = useState(false);
  const [party, setParty] = useState<Party | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [messages, setMessages] = useState<PartyMessage[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [isAddDishOpen, setIsAddDishOpen] = useState(false);
  const [newDishName, setNewDishName] = useState("");
  const [newDishCategory, setNewDishCategory] = useState("Закуски");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isShoppingListOpen, setIsShoppingListOpen] = useState(false);
  const [isGuestsOpen, setIsGuestsOpen] = useState(false);
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

        if (error) throw error;
        if (itemsError) throw itemsError;

        setParty(data);
        setMenuItems(items || []);
      } catch (err) {
        console.error("Ошибка загрузки банкета:", err);
        setParty(null);
        setMenuItems([]);
      } finally {
        setIsLoading(false);
      }
    }

    if (!partyId) return;

    setIsAdmin(false);
    const savedName = localStorage.getItem(`party_name_${partyId}`);
    if (savedName) {
      const adminFlag = localStorage.getItem(`party_admin_${partyId}`);
      if (adminFlag === "true") setIsAdmin(true);
    }
    setCurrentUser(savedName);
    setGuestName(savedName ?? "");

    void fetchParty();
  }, [partyId]);

  useEffect(() => {
    if (!partyId) return;

    const realtimePartyId = String(partyId);

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("party_messages")
        .select("*")
        .eq("party_id", realtimePartyId)
        .order("created_at", { ascending: true });

      if (data) setMessages(data);
    };

    void fetchMessages();

    const channel = supabase
      .channel(`chat-${realtimePartyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "party_messages",
          filter: `party_id=eq.${realtimePartyId}`,
        },
        (payload) => {
          const newMessage = payload.new as PartyMessage;

          setMessages((current) => {
            if (current.some((message) => message.id === newMessage.id)) {
              return current;
            }

            const filtered = current.filter(
              (message) =>
                !(
                  String(message.id).startsWith("temp-") &&
                  message.text === newMessage.text &&
                  message.user_name === newMessage.user_name
                ),
            );

            return [...filtered, newMessage];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "party_messages",
          filter: `party_id=eq.${realtimePartyId}`,
        },
        (payload) => {
          setMessages((current) => current.filter((message) => message.id !== payload.old.id));
          setSelectedMessageId((current) => (current === payload.old.id ? null : current));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [partyId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleJoin(e?: React.FormEvent) {
    e?.preventDefault();

    const trimmedName = guestName.trim();

    if (!trimmedName) return;

    localStorage.setItem(`party_name_${partyId}`, trimmedName);
    setCurrentUser(trimmedName);
  }

  async function sendMessage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!newMessage.trim() || !currentUser) return;

    const textToSend = newMessage.trim();
    const optimisticMessageId = `temp-${Date.now()}`;

    setNewMessage("");
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticMessageId,
        party_id: partyId,
        user_name: currentUser,
        text: textToSend,
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      const { error } = await supabase.from("party_messages").insert({
        party_id: partyId,
        user_name: currentUser,
        text: textToSend,
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error("Ошибка отправки сообщения:", error);
      setMessages((prev) => prev.filter((message) => message.id !== optimisticMessageId));
      setNewMessage(textToSend);
    }
  }

  async function handleDeleteMessage(id: string) {
    try {
      const { error } = await supabase.from("party_messages").delete().eq("id", id);

      if (error) {
        throw error;
      }

      setSelectedMessageId(null);
      setMessages((prev) => prev.filter((message) => message.id !== id));
    } catch (error) {
      console.error("Ошибка удаления сообщения:", error);
    }
  }

  async function handleDeleteDish(itemId: string) {
    try {
      const { error } = await supabase.from("party_items").delete().eq("id", itemId);

      if (error) {
        throw error;
      }

      setMenuItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (error) {
      console.error("Ошибка удаления блюда:", error);
    }
  }

  async function handleAddManualDish(e: React.FormEvent) {
    e.preventDefault();

    const trimmedName = newDishName.trim();

    if (!trimmedName) return;

    try {
      const { data, error } = await supabase
        .from("party_items")
        .insert({
          party_id: partyId,
          name: trimmedName,
          category: newDishCategory,
          ingredients: [],
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setMenuItems((prev) => [...prev, data]);
      setIsAddDishOpen(false);
      setNewDishName("");
      setNewDishCategory("Закуски");
    } catch (error) {
      console.error("Ошибка добавления блюда:", error);
    }
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

  const groupedMenuItems = MENU_CATEGORIES.map((category) => ({
    category,
    items: menuItems.filter((item) => item.category === category),
  }));

  const shoppingList = useMemo(() => {
    const aggregated: Record<string, { name: string; amount: number; unit: string }> = {};

    menuItems.forEach((item) => {
      let ingredients = item.ingredients;

      if (typeof ingredients === "string") {
        try {
          ingredients = JSON.parse(ingredients);
        } catch (e) {
          ingredients = [];
        }
      }

      if (Array.isArray(ingredients)) {
        ingredients.forEach((ing) => {
          const key = ing.name.toLowerCase().trim();

          if (aggregated[key]) {
            aggregated[key].amount += Number(ing.amount);
          } else {
            aggregated[key] = {
              name: ing.name,
              amount: Number(ing.amount),
              unit: ing.unit,
            };
          }
        });
      }
    });

    return Object.values(aggregated).sort((a, b) => a.name.localeCompare(b.name));
  }, [menuItems]);

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
              <div className="flex min-w-0 flex-col gap-1">
                <p className="truncate text-base font-semibold text-zinc-900">{party.title}</p>
                <span
                  onClick={() => setIsGuestsOpen(true)}
                  className="text-zinc-500 cursor-pointer transition-colors hover:text-black"
                >
                  {party.guest_count} персон (показать)
                </span>
              </div>
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
              {isAdmin && !isLoading && menuItems.length === 0 && (
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
                          <div className="mb-1 flex items-start justify-between gap-3">
                            <p className="font-semibold text-zinc-900">{item.name}</p>
                            {isAdmin && item.id && (
                              <button
                                type="button"
                                onClick={() => handleDeleteDish(item.id!)}
                                className="p-1 -mr-1 -mt-1 text-zinc-400 transition-colors hover:text-red-500 active:scale-90"
                                aria-label={`Удалить блюдо ${item.name}`}
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                  className="h-5 w-5"
                                >
                                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                                </svg>
                              </button>
                            )}
                          </div>
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
                onClick={() => setIsAddDishOpen(true)}
                className="w-full bg-zinc-100 text-zinc-900 border border-zinc-200 text-lg font-medium rounded-2xl py-4 flex items-center justify-center gap-2 hover:bg-zinc-200 transition-all active:scale-[0.99] mt-2 mb-4"
              >
                <span>+</span>
                <span>Добавить свое блюдо</span>
              </button>

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
                <section className="flex h-[calc(100vh-160px)] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm lg:h-[600px]">
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
                          const isSelected = selectedMessageId === message.id;
                          const messageTime = formatTime(message.created_at ?? "");

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
                                <button
                                  type="button"
                                  onClick={() =>
                                    isCurrentUserMessage && message.id
                                      ? setSelectedMessageId(isSelected ? null : message.id)
                                      : undefined
                                  }
                                  className={`relative rounded-2xl px-4 py-3 pr-16 text-left shadow-sm ${
                                    isCurrentUserMessage
                                      ? "cursor-pointer bg-blue-500 text-white"
                                      : "bg-zinc-200 text-zinc-900"
                                  }`}
                                >
                                  <span className="block break-words text-sm leading-relaxed">
                                    {message.text}
                                  </span>
                                  <span
                                    className={`absolute bottom-1.5 right-2 text-[10px] leading-none ${
                                      isCurrentUserMessage ? "text-blue-100/80" : "text-zinc-400"
                                    }`}
                                  >
                                    {messageTime}
                                  </span>
                                </button>
                                {isSelected && message.id && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMessage(message.id)}
                                    className="mt-1 flex cursor-pointer items-center gap-1 text-xs font-medium text-red-500 hover:underline"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    <span>Удалить</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </div>
                  <form
                    onSubmit={sendMessage}
                    className="p-3 border-t border-zinc-100 bg-white flex items-end gap-2"
                  >
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(event) => setNewMessage(event.target.value)}
                      placeholder="Написать сообщение..."
                      className="flex-1 bg-zinc-100 rounded-2xl px-4 py-2.5 max-h-32 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-black/5"
                    />
                    <button
                      type="submit"
                      disabled={!newMessage.trim()}
                      className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-blue-500 text-white transition-all hover:bg-blue-600 active:scale-95 disabled:bg-zinc-200 disabled:text-zinc-400"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="w-4 h-4 translate-x-[1px] translate-y-[-1px]"
                      >
                        <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                      </svg>
                    </button>
                  </form>
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

      {party && currentUser === null && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-50/95 p-4 backdrop-blur-md">
          <div className="animate-in zoom-in-95 w-full max-w-sm rounded-[2rem] border border-zinc-100 bg-white p-8 text-center shadow-2xl duration-300">
            <div className="mb-5 text-5xl">👋</div>
            <h2 className="mb-2 text-2xl font-bold text-zinc-900">Добро пожаловать</h2>
            <p className="mb-8 text-zinc-500">Как вас представить другим участникам банкета?</p>
            <form onSubmit={handleJoin}>
              <input
                type="text"
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                placeholder="Ваше имя"
                className="mb-4 w-full rounded-2xl bg-zinc-100/80 px-5 py-4 text-center text-lg text-zinc-900 transition-all placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black"
                autoFocus
              />
              <button
                type="submit"
                disabled={!guestName.trim()}
                className="w-full rounded-2xl bg-black py-4 text-lg font-medium text-white transition-all hover:bg-zinc-800 active:scale-95 disabled:bg-zinc-200 disabled:text-zinc-400"
              >
                Войти
              </button>
            </form>
          </div>
        </div>
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
              {shoppingList.length > 0 ? (
                shoppingList.map((ingredient) => (
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

      {isAddDishOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-zinc-900/40 p-0 backdrop-blur-sm transition-opacity sm:items-center sm:p-4"
          onClick={() => setIsAddDishOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl animate-in slide-in-from-bottom-10 sm:rounded-3xl sm:p-8 sm:zoom-in-95"
            onClick={(event) => event.stopPropagation()}
          >
            <form onSubmit={handleAddManualDish}>
              <div className="mb-6 flex items-start justify-between gap-4">
                <h2 className="text-2xl font-semibold">Новое блюдо</h2>
                <button
                  type="button"
                  onClick={() => setIsAddDishOpen(false)}
                  className="text-zinc-400 transition-colors hover:text-black"
                >
                  Отмена
                </button>
              </div>

              <input
                type="text"
                value={newDishName}
                onChange={(event) => setNewDishName(event.target.value)}
                placeholder="Например: Крабовый салат"
                className="w-full bg-zinc-100 rounded-2xl px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-black focus:bg-white transition-all mb-6"
                autoFocus
              />

              <div>
                <p className="mb-2 text-sm text-zinc-500">Категория</p>
                <div className="grid grid-cols-3 gap-2">
                {MENU_CATEGORIES.map((category) => {
                  const isActive = newDishCategory === category;

                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setNewDishCategory(category)}
                      className={`rounded-2xl px-3 py-4 text-sm font-medium transition-all ${
                        isActive ? "bg-black text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      {category}
                    </button>
                  );
                })}
                </div>
              </div>

              <button
                type="submit"
                disabled={!newDishName.trim()}
                className="w-full bg-black text-white py-4 rounded-2xl mt-6 disabled:opacity-50"
              >
                Добавить в меню
              </button>
            </form>
          </div>
        </div>
      )}

      {isGuestsOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-zinc-900/40 p-0 backdrop-blur-sm transition-opacity sm:items-center sm:p-4"
          onClick={() => setIsGuestsOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl animate-in slide-in-from-bottom-10 sm:rounded-3xl sm:p-8 sm:zoom-in-95"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <h2 className="text-2xl font-semibold">Участники</h2>
              <button
                type="button"
                onClick={() => setIsGuestsOpen(false)}
                className="text-zinc-400 transition-colors hover:text-black"
              >
                Закрыть
              </button>
            </div>

            <div className="space-y-4">
              {[
                "Организатор - Подтвержден",
                "Анна - Подтвержден",
                "Максим - Подтвержден",
                "Елена - Ожидает ответ",
              ].map((guest) => (
                <div
                  key={guest}
                  className="rounded-2xl bg-zinc-50 px-4 py-4 text-base text-zinc-900"
                >
                  {guest}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
