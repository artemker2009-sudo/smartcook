"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { MessageCircle, Plus, SendHorizonal, Share2, Sparkles, Users, UtensilsCrossed } from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const MENU_CATEGORIES = ["Закуски", "Салаты", "Горячее", "Напитки"] as const;

type MenuCategory = (typeof MENU_CATEGORIES)[number];

type Party = {
  id: string;
  title: string;
  theme?: string | null;
  guest_count?: number | null;
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
  id?: string;
  party_id?: string;
  name: string;
  category?: string | null;
  ingredients?: MenuIngredient[] | string | null;
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

const formatIngredients = (ingredients?: PartyItem["ingredients"]) => {
  if (!ingredients) return "Ингредиенты пока не указаны";

  if (typeof ingredients === "string") {
    return ingredients || "Ингредиенты пока не указаны";
  }

  const parsed = parseIngredients(ingredients);
  if (parsed.length === 0) return "Ингредиенты пока не указаны";

  return parsed
    .map((ingredient) => {
      const amount = ingredient.amount ?? "";
      const unit = ingredient.unit ?? "";
      return [ingredient.name, amount, unit].filter(Boolean).join(" ");
    })
    .join(", ");
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

  const [guests, setGuests] = useState<PartyMember[]>(() => {
    const baseGuests = initialMembers ?? [];
    if (!storedName) return baseGuests;

    return baseGuests.some((guest) => getGuestName(guest).toLowerCase() === storedName.toLowerCase())
      ? baseGuests
      : [...baseGuests, { party_id: party.id, user_name: storedName }];
  });
  const [messages, setMessages] = useState<PartyMessage[]>(initialMessages ?? []);
  const [menuItems, setMenuItems] = useState<PartyItem[]>(initialItems ?? []);
  const [newMessage, setNewMessage] = useState("");
  const [newDishName, setNewDishName] = useState("");
  const [newDishCategory, setNewDishCategory] = useState<MenuCategory>("Закуски");
  const [isAddDishOpen, setIsAddDishOpen] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isAddingDish, setIsAddingDish] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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
          void supabase
            .from("party_items")
            .select("*")
            .eq("party_id", party.id)
            .then(({ data }) => {
              if (data) setMenuItems(data as PartyItem[]);
            });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [party.id, storedName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTab]);

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

  const handleJoin = async () => {
    if (!inputName.trim()) return;
    const trimmedName = inputName.trim();
    localStorage.setItem(`party_name_${party.id}`, trimmedName);
    setCurrentUser(trimmedName);
    setShowJoinModal(false);
    setGuests((prev) =>
      prev.some((guest) => getGuestName(guest).toLowerCase() === trimmedName.toLowerCase())
        ? prev
        : [...prev, { party_id: party.id, user_name: trimmedName }],
    );
    await supabase.from("party_members").insert([{ party_id: party.id, user_name: trimmedName }]);
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

  const handleAddDish = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newDishName.trim() || isAddingDish) return;

    setIsAddingDish(true);

    const { data } = await supabase
      .from("party_items")
      .insert([{ party_id: party.id, name: newDishName.trim(), category: newDishCategory, ingredients: [] }])
      .select("*")
      .single();

    if (data) {
      setMenuItems((prev) => [...prev, data as PartyItem]);
    }

    setNewDishName("");
    setNewDishCategory("Закуски");
    setIsAddDishOpen(false);
    setIsAddingDish(false);
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
      
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      
      // Нам не нужно делать setMenuItems руками, так как наш Realtime канал 
      // автоматически поймает новые блюда из БД и обновит интерфейс!
      
    } catch (error: any) {
      alert("Ошибка при генерации меню: " + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const renderMenuPanel = () => (
    <section className="space-y-4 p-4 pb-32">
      <button
        type="button"
        onClick={handleGenerateMenu}
        className="flex w-full items-center justify-center gap-2 rounded-3xl bg-black p-4 text-center text-base font-medium text-white shadow-sm transition hover:bg-zinc-800"
      >
        <Sparkles className="h-4 w-4" />
        {isGenerating ? "✨ Шеф-повар думает..." : "✨ Сгенерировать меню с ИИ"}
      </button>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setIsAddDishOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-3xl border border-black/5 bg-white px-4 py-4 text-sm font-medium text-black shadow-sm transition hover:bg-zinc-50"
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
              {items.map((item) => (
                <div
                  key={item.id ?? `${category}-${item.name}`}
                  className="rounded-[28px] bg-zinc-50 px-4 py-4"
                >
                  <div className="text-base font-semibold tracking-tight text-black">{item.name}</div>
                  <p className="mt-1 text-sm leading-6 text-zinc-500">{formatIngredients(item.ingredients)}</p>
                </div>
              ))}
            </div>
          )}
        </article>
      ))}

      <button
        type="button"
        onClick={() => window.alert("Список покупок появится здесь.")}
        className="inline-flex w-full items-center justify-center gap-2 rounded-3xl border border-black/5 bg-white px-5 py-4 text-base font-medium text-black shadow-sm transition hover:bg-zinc-50"
      >
        🛒 Показать список покупок
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
            placeholder={currentUser ? "Написать сообщение..." : "Сначала укажите ваше имя"}
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
                onChange={(event) => setInputName(event.target.value)}
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
          </div>
        </div>
      )}

      {isAddDishOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md"
          onClick={() => setIsAddDishOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-6 shadow-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6">
              <h3 className="text-2xl font-semibold tracking-tight text-black">Добавить свое блюдо</h3>
              <p className="mt-2 text-sm text-zinc-500">Блюдо сразу появится в общем меню для всех участников.</p>
            </div>

            <form onSubmit={handleAddDish} className="space-y-4">
              <input
                type="text"
                value={newDishName}
                onChange={(event) => setNewDishName(event.target.value)}
                placeholder="Например: Брускетта с томатами"
                className="w-full rounded-2xl bg-zinc-100 px-4 py-3.5 text-sm text-black outline-none transition focus:bg-zinc-200"
                autoFocus
              />

              <div className="grid grid-cols-2 gap-2">
                {MENU_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setNewDishCategory(category)}
                    className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
                      newDishCategory === category
                        ? "bg-black text-white"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddDishOpen(false)}
                  className="flex-1 rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-200"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={!newDishName.trim() || isAddingDish}
                  className="flex-1 rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                >
                  {isAddingDish ? "Добавляем..." : "Добавить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
