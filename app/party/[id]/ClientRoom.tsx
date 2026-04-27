"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { MessageCircle, Plus, SendHorizonal, Share2, Sparkles, Users, UtensilsCrossed } from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const MENU_CATEGORIES = ["Закуски", "Салаты", "Горячее", "Напитки"] as const;
const FREE_GUEST_LIMIT = 2;
const ORGANIZER_ALERT_MESSAGE =
  "Кто-то хочет зайти, но лимит исчерпан! Организатор, обнови банкет до PRO.";

type MenuCategory = (typeof MENU_CATEGORIES)[number];

type Party = {
  id: string;
  title: string;
  theme?: string | null;
  guest_count?: number | null;
  is_paid?: boolean | null;
};

type PartyMember = {
  id?: string;
  party_id?: string;
  user_name?: string | null;
  name?: string | null;
  created_at?: string | null;
};

type MenuIngredient = {
  name: string;
  amount?: number | string | null;
  unit?: string | null;
};

type PartyItem = {
  id: string;
  party_id?: string;
  name: string;
  category?: string | null;
  ingredients?: MenuIngredient[] | string | null;
  votes?: string[] | null;
  created_at?: string | null;
};

type PartyMessage = {
  id?: string;
  party_id?: string;
  user_name?: string | null;
  text: string;
  created_at?: string | null;
};

type ClientRoomProps = {
  party: Party;
  initialItems: PartyItem[];
  initialMembers: PartyMember[];
  initialMessages: PartyMessage[];
};

const isMenuCategory = (value: string): value is MenuCategory =>
  MENU_CATEGORIES.includes(value as MenuCategory);

const normalizeCategory = (category?: string | null): MenuCategory => {
  if (category === "Горячее блюдо") return "Горячее";
  if (category && isMenuCategory(category)) return category;
  return "Закуски";
};

const getGuestName = (guest: PartyMember) => (guest.user_name ?? guest.name ?? "").trim();

const getMessageAuthor = (message: PartyMessage) => (message.user_name ?? "").trim();

const formatTime = (value?: string | null) => {
  if (!value) return "";

  return new Date(value).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const parseIngredients = (ingredients?: PartyItem["ingredients"]) => {
  if (!ingredients) return [] as MenuIngredient[];

  if (typeof ingredients === "string") {
    try {
      const parsed = JSON.parse(ingredients);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return Array.isArray(ingredients) ? ingredients : [];
};

export default function ClientRoom({
  party,
  initialItems,
  initialMembers,
  initialMessages,
}: ClientRoomProps) {
  const storedName =
    typeof window === "undefined" ? "" : localStorage.getItem(`party_name_${party.id}`)?.trim() ?? "";

  const [currentUser, setCurrentUser] = useState<string | null>(storedName || null);
  const [showJoinModal, setShowJoinModal] = useState(!storedName);
  const [inputName, setInputName] = useState(storedName);
  const [activeTab, setActiveTab] = useState<"menu" | "chat">("menu");
  const [showPaywall, setShowPaywall] = useState(false);
  const [isProcessingPay, setIsProcessingPay] = useState(false);
  const [currentParty, setCurrentParty] = useState(party);
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [isObserver, setIsObserver] = useState(false);
  const [joinLimitReached, setJoinLimitReached] = useState(false);
  const [pendingJoinName, setPendingJoinName] = useState("");
  const [isNotifyingOrganizer, setIsNotifyingOrganizer] = useState(false);
  const [hasNotifiedOrganizer, setHasNotifiedOrganizer] = useState(false);

  const [guests, setGuests] = useState<PartyMember[]>(() => {
    const baseGuests = initialMembers ?? [];
    if (!storedName) return baseGuests;

    return baseGuests.some((guest) => getGuestName(guest).toLowerCase() === storedName.toLowerCase())
      ? baseGuests
      : [...baseGuests, { party_id: party.id, user_name: storedName }];
  });
  const [messages, setMessages] = useState<PartyMessage[]>(initialMessages ?? []);
  const [menuItems, setMenuItems] = useState<PartyItem[]>(initialItems ?? []);
  const [showAddDishModal, setShowAddDishModal] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [newDishName, setNewDishName] = useState("");
  const [newDishCategory, setNewDishCategory] = useState("Закуски");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const CATEGORIES = ["Закуски", "Салаты", "Горячее", "Напитки"] as const;

  // Отправка аналитики
  const trackEvent = async (eventType: string) => {
    try {
      await supabase.from("analytics_events").insert([
        {
          party_id: party.id,
          user_name: currentUser || "anonymous",
          event_type: eventType,
        },
      ]);
    } catch (e) {
      console.error("Analytics error", e);
    }
  };

  const refreshMenuItems = useCallback(async () => {
    const { data } = await supabase.from("party_items").select("*").eq("party_id", party.id);
    const nextItems = (data as PartyItem[] | null) ?? [];
    setMenuItems(nextItems);
    return nextItems;
  }, [party.id]);

  const completeJoin = useCallback(
    async (name: string) => {
      localStorage.setItem(`party_name_${party.id}`, name);
      setInputName(name);
      setCurrentUser(name);
      setIsObserver(false);
      setJoinLimitReached(false);
      setPendingJoinName("");
      setHasNotifiedOrganizer(false);
      setShowJoinModal(false);
      setGuests((prev) =>
        prev.some((guest) => getGuestName(guest).toLowerCase() === name.toLowerCase())
          ? prev
          : [...prev, { party_id: party.id, user_name: name }],
      );
      await supabase.from("party_members").insert([{ party_id: party.id, user_name: name }]);
    },
    [party.id],
  );

  const handleAddCustomDish = async () => {
    if (!newDishName.trim() || !currentUser) return;

    await supabase.from("party_items").insert([
      {
        party_id: party.id,
        name: newDishName.trim(),
        category: newDishCategory,
        ingredients: [],
        votes: [currentUser],
      },
    ]);

    setNewDishName("");
    setShowAddDishModal(false);
  };

  const toggleVote = async (itemId: string, currentVotes: string[] | null) => {
    if (!currentUser) return;
    const votes = currentVotes || [];

    const newVotes = votes.includes(currentUser)
      ? votes.filter((vote) => vote !== currentUser)
      : [...votes, currentUser];

    setMenuItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, votes: newVotes } : item)));

    await supabase.from("party_items").update({ votes: newVotes }).eq("id", itemId);
  };

  useEffect(() => {
    if (storedName) {
      void supabase.from("party_members").insert([{ party_id: party.id, user_name: storedName }]);
    }

    const channel = supabase
      .channel(`room-${party.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "party_messages",
          filter: `party_id=eq.${party.id}`,
        },
        (payload) => {
          setMessages((prev) => {
            const next = payload.new as PartyMessage;
            const exists = prev.some((message) => message.id && message.id === next.id);
            if (exists) return prev;
            return [...prev, next].sort((a, b) => {
              const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
              const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
              return aTime - bTime;
            });
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "party_members",
          filter: `party_id=eq.${party.id}`,
        },
        (payload) => {
          const nextGuest = payload.new as PartyMember;
          setGuests((prev) =>
            prev.some((guest) => getGuestName(guest).toLowerCase() === getGuestName(nextGuest).toLowerCase())
              ? prev
              : [...prev, nextGuest],
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "party_items",
          filter: `party_id=eq.${party.id}`,
        },
        () => {
          void refreshMenuItems().then((items) => {
            if (items.length > 0) {
              setIsGenerating(false);
            }
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [party.id, refreshMenuItems, storedName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTab]);

  useEffect(() => {
    if (!isGenerating) return;

    const intervalId = window.setInterval(() => {
      void supabase
        .from("party_items")
        .select("id")
        .eq("party_id", party.id)
        .limit(1)
        .then(async ({ data }) => {
          if (!data?.length) return;

          await refreshMenuItems();
          setIsGenerating(false);
          window.clearInterval(intervalId);
        });
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isGenerating, party.id, refreshMenuItems]);

  const groupedItems = useMemo(
    () =>
      MENU_CATEGORIES.map((category) => ({
        category,
        items: menuItems.filter((item) => normalizeCategory(item.category) === category),
      })),
    [menuItems],
  );

  const guestNames = useMemo(
    () =>
      Array.from(new Set(guests.map(getGuestName).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru")),
    [guests],
  );

  const shoppingList = useMemo(() => {
    const aggregated = new Map<string, { name: string; amount?: number | string | null; unit?: string | null }>();

    for (const item of menuItems) {
      for (const ingredient of parseIngredients(item.ingredients)) {
        const name = ingredient.name?.trim();
        if (!name) continue;

        const key = `${name.toLowerCase()}::${ingredient.unit ?? ""}`;
        const prev = aggregated.get(key);

        if (!prev) {
          aggregated.set(key, { ...ingredient, name });
          continue;
        }

        const prevAmount = typeof prev.amount === "number" ? prev.amount : Number(prev.amount);
        const nextAmount = typeof ingredient.amount === "number" ? ingredient.amount : Number(ingredient.amount);

        if (Number.isFinite(prevAmount) && Number.isFinite(nextAmount)) {
          aggregated.set(key, { ...prev, amount: prevAmount + nextAmount });
        }
      }
    }

    return Array.from(aggregated.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [menuItems]);

  const handleJoin = async () => {
    if (!inputName.trim()) return;

    const trimmedName = inputName.trim();
    const normalizedName = trimmedName.toLowerCase();
    const uniqueGuests = Array.from(new Set(guests.map(getGuestName).filter(Boolean)));
    const isExistingGuest = uniqueGuests.some((guestName) => guestName.toLowerCase() === normalizedName);

    if (!currentParty.is_paid && !isExistingGuest && uniqueGuests.length >= FREE_GUEST_LIMIT) {
      setPendingJoinName(trimmedName);
      setJoinLimitReached(true);
      setHasNotifiedOrganizer(false);
      return;
    }

    await completeJoin(trimmedName);
  };

  const handleMockPayment = async () => {
    setIsProcessingPay(true);
    // Имитация задержки банка
    await new Promise((r) => setTimeout(r, 1500));

    // Обновляем статус банкета в БД
    await supabase.from("parties").update({ is_paid: true }).eq("id", currentParty.id);

    // ФИКС БАГА: Если человек пытался зайти, у него в inputName осталось имя,
    // но он еще не является currentUser. Регистрируем его автоматически!
    if (inputName.trim() && !currentUser) {
      const name = inputName.trim();
      localStorage.setItem(`party_name_${party.id}`, name);
      setCurrentUser(name);

      // Записываем спонсора в список участников
      await supabase.from("party_members").insert([{ party_id: party.id, user_name: name }]);

      // Скрываем модалку входа, если она висела под пейволлом
      setShowJoinModal(false);
    }

    // Обновляем локально статус и закрываем Пейволл
    setCurrentParty({ ...currentParty, is_paid: true });
    setIsProcessingPay(false);
    await trackEvent("paywall_payment_success");
    setShowPaywall(false);
  };

  const handleNotifyOrganizer = async () => {
    if (isNotifyingOrganizer) return;

    setIsNotifyingOrganizer(true);

    try {
      await supabase.from("party_messages").insert([
        {
          party_id: party.id,
          user_name: pendingJoinName || "Гость",
          text: ORGANIZER_ALERT_MESSAGE,
        },
      ]);
      setHasNotifiedOrganizer(true);
      setActiveTab("chat");
    } finally {
      setIsNotifyingOrganizer(false);
    }
  };

  const handleWatchOnly = () => {
    setCurrentUser(null);
    setIsObserver(true);
    setJoinLimitReached(false);
    setPendingJoinName("");
    setHasNotifiedOrganizer(false);
    setShowJoinModal(false);
  };

  const sendMessage = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser || isSendingMessage) return;

    const text = newMessage.trim();
    setNewMessage("");
    setIsSendingMessage(true);

    await supabase.from("party_messages").insert([{ party_id: party.id, user_name: currentUser, text }]);

    setIsSendingMessage(false);
  };

  const handleShare = async () => {
    const shareData = {
      title: party.title,
      text: `Присоединяйся к банкету «${party.title}»`,
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      await navigator.clipboard.writeText(shareData.url);
      window.alert("Ссылка скопирована в буфер обмена.");
    } catch {
      // Игнорируем отмену шаринга и недоступность API.
    }
  };

  const handleGenerateMenu = async () => {
    if (!currentParty.is_paid) {
      setShowPaywall(true);
      void trackEvent("paywall_view_from_ai");
      return;
    }

    try {
      setIsGenerating(true);
      const res = await fetch('/api/party/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          partyId: party.id, 
          theme: party.theme || party.title, 
          guestCount: party.guest_count || 4 
        })
      });
      
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Ошибка сервера (${res.status}). Сервер перегружен, попробуйте еще раз.`);
      }

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      await refreshMenuItems();
      void trackEvent("ai_menu_generated_success");
    } catch (error: any) {
      const latestItems = await refreshMenuItems();
      if (latestItems.length > 0) {
        return;
      }

      alert("Не удалось сгенерировать меню: " + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const renderMenuPanel = () => (
    <section className="space-y-4 p-4 pb-32">
      {menuItems.length === 0 && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleGenerateMenu}
            disabled={isGenerating}
            className="w-full bg-black text-white font-medium p-4 rounded-3xl flex items-center justify-center gap-2 disabled:opacity-80 transition-all"
          >
            <Sparkles className="h-4 w-4" />
            {isGenerating ? "✨ Шеф-повар составляет меню..." : "✨ Сгенерировать меню с ИИ (PRO)"}
          </button>

          {isGenerating && (
            <div className="bg-zinc-100 rounded-3xl p-6 text-center animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="text-2xl mb-2">⏳</div>
              <h3 className="font-semibold text-lg mb-1">Меню уже готовится</h3>
              <p className="text-zinc-500 text-sm mb-4">
                Нейросеть подбирает лучшие блюда. Пока вы ждете, пригласите друзей — они смогут добавлять свои идеи!
              </p>
              <button
                type="button"
                onClick={handleShare}
                className="bg-white text-black font-medium px-6 py-3 rounded-2xl shadow-sm border border-black/5 hover:bg-zinc-50 transition-colors w-full"
              >
                Поделиться ссылкой
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setShowAddDishModal(true)}
          disabled={!currentUser}
          className="inline-flex items-center justify-center gap-2 rounded-3xl border border-black/5 bg-white px-4 py-4 text-sm font-medium text-black shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Добавить блюдо
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center justify-center gap-2 rounded-3xl border border-black/5 bg-white px-4 py-4 text-sm font-medium text-black shadow-sm transition hover:bg-zinc-50"
        >
          <Share2 className="h-4 w-4" />
          Поделиться
        </button>
      </div>

      {groupedItems.map(({ category, items }) => (
        <article key={category} className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-black">{category}</h2>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500">
              {items.length}
            </span>
          </div>

          {items.length === 0 ? (
            <p className="text-sm leading-6 text-zinc-400">Здесь появятся предложенные блюда...</p>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const ingredients = parseIngredients(item.ingredients);

                return (
                  <div key={item.id ?? `${category}-${item.name}`} className="rounded-[28px] bg-zinc-50 px-4 py-4">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="text-black font-medium">{item.name}</div>

                        {ingredients.length > 0 && (
                          <div className="text-sm text-zinc-500 mt-1">
                            {ingredients.map((ing) => `${ing.name} ${ing.amount} ${ing.unit}`).join(", ")}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleVote(item.id, item.votes ?? null)}
                        disabled={!currentUser}
                        className="flex items-center gap-1.5 bg-zinc-100 px-3 py-1.5 rounded-full shrink-0 active:scale-95 transition-transform disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="text-sm">{item.votes?.includes(currentUser || "") ? "❤️" : "🤍"}</span>
                        <span className="text-sm font-medium">{item.votes?.length || 0}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      ))}

      <button
        type="button"
        onClick={() => {
          if (currentParty.is_paid) {
            setShowShoppingList(true);
            void trackEvent("shopping_list_opened");
          } else {
            setShowPaywall(true);
            void trackEvent("paywall_view_from_cart");
          }
        }}
        className="w-full bg-white text-black font-medium p-4 rounded-3xl flex items-center justify-center gap-2 shadow-sm border border-black/5 active:scale-95 transition-transform"
      >
        <span>🛒</span> {currentParty.is_paid ? "Показать список покупок" : "Открыть список покупок (PRO)"}
      </button>
    </section>
  );

  const renderChatPanel = () => (
    <section className="m-4 flex h-[calc(100vh-180px)] flex-col overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
      <div className="border-b border-zinc-100 p-4">
        <div className="flex items-center gap-2 text-base font-semibold tracking-tight text-black">
          <MessageCircle className="h-4 w-4" />
          Обсуждение
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {guestNames.length === 0 ? (
            <span className="text-sm text-zinc-400">Пока никто не присоединился</span>
          ) : (
            guestNames.map((guestName) => (
              <span
                key={guestName}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  guestName === currentUser ? "bg-black text-white" : "bg-zinc-100 text-zinc-500"
                }`}
              >
                {guestName}
                {guestName === currentUser ? " (вы)" : ""}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-zinc-400">
            Пока сообщений нет
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => {
              const author = getMessageAuthor(message);
              const isOwn = author === currentUser;

              return (
                <div
                  key={message.id ?? `${message.created_at}-${index}`}
                  className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                >
                  <div className={`flex max-w-[85%] flex-col ${isOwn ? "items-end" : "items-start"}`}>
                    <span className="mb-1 px-1 text-xs text-zinc-400">{isOwn ? "Вы" : author || "Гость"}</span>
                    <div
                      className={`rounded-[24px] px-4 py-3 ${
                        isOwn ? "bg-black text-white" : "bg-zinc-100 text-black"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.text}</p>
                      <div className={`mt-2 text-[11px] ${isOwn ? "text-zinc-300" : "text-zinc-400"}`}>
                        {formatTime(message.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <form onSubmit={sendMessage} className="border-t border-zinc-100 bg-white p-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={newMessage}
            onChange={(event) => setNewMessage(event.target.value)}
            placeholder={
              currentUser
                ? "Написать сообщение..."
                : isObserver
                  ? "Режим наблюдателя: чат доступен после Party Pass"
                  : "Сначала укажите ваше имя"
            }
            disabled={!currentUser}
            className="h-12 flex-1 rounded-2xl bg-zinc-100 px-4 text-sm text-black outline-none transition focus:bg-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-400"
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || !currentUser || isSendingMessage}
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
          >
            <SendHorizonal className="h-4 w-4" />
          </button>
        </div>
      </form>
    </section>
  );

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-black">
      <header className="sticky top-0 z-30 border-b border-black/5 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex min-w-[76px] items-center gap-1 text-sm font-medium text-black transition hover:text-zinc-600"
          >
            <span aria-hidden="true">‹</span>
            Назад
          </button>

          <div className="min-w-0 text-center">
            <h1 className="truncate text-base font-semibold tracking-tight text-black">{party.title}</h1>
            <p className="text-sm font-medium text-zinc-500">
              {party.title} • {party.guest_count ?? guestNames.length} персон
            </p>
          </div>

          <button
            type="button"
            onClick={handleShare}
            className="inline-flex min-w-[76px] items-center justify-end gap-1 text-sm font-medium text-black transition hover:text-zinc-600"
          >
            <Share2 className="h-4 w-4" />
            <span className="sr-only">Поделиться</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl pb-28">
        {activeTab === "menu" ? (
          <>
            {isObserver && (
              <div className="px-4 pt-4">
                <div className="rounded-3xl border border-amber-200/70 bg-amber-50 p-4 shadow-sm">
                  <p className="text-sm font-semibold tracking-tight text-black">Режим наблюдателя</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">
                    Вы можете смотреть меню и чат. Голосование и сообщения откроются после Party Pass.
                  </p>
                </div>
              </div>
            )}
            <div className="px-4 pt-4">
              <div className="rounded-3xl border border-black/5 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-zinc-100 p-3">
                    <Users className="h-5 w-5 text-zinc-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-500">Участники банкета</p>
                    <p className="truncate text-base font-semibold tracking-tight text-black">
                      {guestNames.length > 0 ? guestNames.join(", ") : "Список гостей появится здесь"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            {renderMenuPanel()}
          </>
        ) : (
          renderChatPanel()
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-black/5 bg-white/90 backdrop-blur-md">
        <div className="mx-auto grid max-w-3xl grid-cols-2 px-6 pb-8 pt-3">
          <button
            type="button"
            onClick={() => setActiveTab("menu")}
            className={`flex flex-col items-center justify-center gap-1 text-sm font-medium transition ${
              activeTab === "menu" ? "text-black" : "text-zinc-400"
            }`}
          >
            <UtensilsCrossed className="h-5 w-5" />
            <span>Меню</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`flex flex-col items-center justify-center gap-1 text-sm font-medium transition ${
              activeTab === "chat" ? "text-black" : "text-zinc-400"
            }`}
          >
            <MessageCircle className="h-5 w-5" />
            <span>Чат</span>
          </button>
        </div>
      </nav>

      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-8 shadow-sm">
            {joinLimitReached ? (
              <div className="space-y-5">
                <div className="text-center">
                  <div className="mb-4 text-4xl">🥂</div>
                  <h2 className="text-3xl font-semibold tracking-tight text-black">Лимит гостей исчерпан</h2>
                  <p className="mt-3 text-sm leading-6 text-zinc-500">
                    Упс! Этот банкет сейчас в бесплатном режиме (лимит 2 гостя). Чтобы вы могли зайти и
                    участвовать в обсуждении, нужно активировать Party Pass.
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowPaywall(true)}
                    className="w-full rounded-2xl bg-black px-5 py-4 text-base font-medium text-white transition hover:bg-zinc-800"
                  >
                    Стать спонсором банкета (Оплатить 29 ₽)
                  </button>
                  <button
                    type="button"
                    onClick={handleNotifyOrganizer}
                    disabled={isNotifyingOrganizer}
                    className="w-full rounded-2xl bg-zinc-100 px-5 py-4 text-base font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isNotifyingOrganizer ? "Отправляем сообщение..." : "Уведомить организатора"}
                  </button>
                  <button
                    type="button"
                    onClick={handleWatchOnly}
                    className="w-full rounded-2xl border border-black/5 bg-white px-5 py-4 text-base font-medium text-black transition hover:bg-zinc-50"
                  >
                    Просто смотреть
                  </button>
                </div>

                {hasNotifiedOrganizer && (
                  <p className="text-center text-sm leading-6 text-zinc-500">
                    Сообщение отправлено в чат банкета. Можно подождать организатора или продолжить в режиме
                    наблюдателя.
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="mb-6 text-center">
                  <div className="mb-4 text-4xl">👋</div>
                  <h2 className="text-3xl font-semibold tracking-tight text-black">Добро пожаловать</h2>
                  <p className="mt-3 text-sm leading-6 text-zinc-500">
                    Как вас представить другим участникам банкета?
                  </p>
                </div>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleJoin();
                  }}
                  className="space-y-4"
                >
                  <input
                    value={inputName}
                    onChange={(event) => {
                      setInputName(event.target.value);
                      setJoinLimitReached(false);
                      setHasNotifiedOrganizer(false);
                    }}
                    placeholder="Введите ваше имя"
                    className="w-full rounded-2xl bg-zinc-100 px-5 py-4 text-base text-black outline-none transition focus:bg-zinc-200"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!inputName.trim()}
                    className="w-full rounded-2xl bg-zinc-200 px-5 py-4 text-base font-medium text-black transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
                  >
                    Войти
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {showAddDishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold mb-2">Добавить свое блюдо</h2>
            <p className="text-sm text-zinc-500 mb-6">Блюдо сразу появится в общем меню для всех участников.</p>

            <input
              type="text"
              placeholder="Например: Брускетта с томатами"
              value={newDishName}
              onChange={(e) => setNewDishName(e.target.value)}
              className="w-full bg-zinc-100 border border-transparent rounded-2xl p-4 outline-none focus:border-black mb-4 transition-colors text-black"
            />

            <div className="grid grid-cols-2 gap-2 mb-6">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setNewDishCategory(cat)}
                  className={`p-3 rounded-xl text-sm font-medium transition-colors ${
                    newDishCategory === cat ? "bg-black text-white" : "bg-zinc-100 text-black hover:bg-zinc-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowAddDishModal(false)}
                className="flex-1 bg-zinc-100 text-black font-medium p-4 rounded-xl hover:bg-zinc-200 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleAddCustomDish}
                disabled={!newDishName.trim()}
                className="flex-1 bg-black text-white font-medium p-4 rounded-xl disabled:opacity-50 active:scale-95 transition-all"
              >
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {showShoppingList && (
        <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-md sm:p-4">
          <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-2xl animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Список покупок</h2>
                <p className="mt-1 text-sm text-zinc-500">Собрано автоматически из ингредиентов выбранных блюд.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowShoppingList(false)}
                className="rounded-full bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-500 transition hover:bg-zinc-200 hover:text-black"
              >
                Закрыть
              </button>
            </div>

            {shoppingList.length === 0 ? (
              <div className="rounded-3xl bg-zinc-50 p-5 text-sm text-zinc-500">
                Добавьте блюда с ингредиентами, и список покупок появится здесь.
              </div>
            ) : (
              <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                {shoppingList.map((ingredient) => (
                  <div
                    key={`${ingredient.name}-${ingredient.unit ?? ""}`}
                    className="flex items-center justify-between rounded-2xl bg-zinc-50 px-4 py-3"
                  >
                    <span className="font-medium text-black">{ingredient.name}</span>
                    <span className="text-sm text-zinc-500">
                      {[ingredient.amount, ingredient.unit].filter(Boolean).join(" ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showPaywall && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md sm:p-4 transition-all">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center text-3xl shadow-lg">
                👑
              </div>
            </div>

            <h2 className="text-2xl font-bold text-center mb-2 tracking-tight">Party Pass</h2>
            <p className="text-center text-zinc-500 text-sm mb-6">
              Вы можете оплатить доступ сами, чтобы помочь организатору, или подождать, пока это сделает
              он. Party Pass открывает ИИ-генерацию, список покупок и безлимит гостей для ВСЕХ участников
              этого банкета.
            </p>

            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-3">
                <span className="text-green-500 text-xl">✓</span>
                <span className="text-sm font-medium">Моментальная ИИ-генерация меню</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-500 text-xl">✓</span>
                <span className="text-sm font-medium">Умный список покупок</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-500 text-xl">✓</span>
                <span className="text-sm font-medium">Безлимитное количество гостей</span>
              </div>
            </div>
            
            <button
              type="button"
              onClick={handleMockPayment}
              disabled={isProcessingPay}
              className="w-full bg-black text-white text-lg font-medium p-4 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              {isProcessingPay ? "Обработка..." : "Стать спонсором банкета (Оплатить 29 ₽)"}
            </button>
            
            <button
              type="button"
              onClick={() => {
                setShowPaywall(false);
                void trackEvent("paywall_cancelled");
              }}
              className="w-full mt-3 text-zinc-400 text-sm font-medium p-3 hover:text-black transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
