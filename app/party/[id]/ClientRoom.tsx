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

  const renderMenuPanel = () => (
    <section className="space-y-4">
      {menuItems.length === 0 ? (
        <button
          type="button"
          onClick={() => window.alert("Здесь появится генерация меню с ИИ.")}
          className="flex min-h-[220px] w-full flex-col items-center justify-center gap-4 rounded-[28px] bg-black px-6 py-8 text-center text-white shadow-sm transition hover:bg-zinc-800"
        >
          <Sparkles className="h-10 w-10" />
          <div>
            <div className="text-2xl font-semibold">Сгенерировать меню с ИИ</div>
            <p className="mt-2 text-sm text-zinc-300">
              Пока блюд нет. Заполните банкет автоматически одним нажатием.
            </p>
          </div>
        </button>
      ) : null}

      {groupedItems.map(({ category, items }) => (
        <article key={category} className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-zinc-950">{category}</h2>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500">
              {items.length}
            </span>
          </div>

          {items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
              Пока в этой категории пусто
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id ?? `${category}-${item.name}`}
                  className="rounded-3xl border border-zinc-200 bg-zinc-50 px-4 py-4"
                >
                  <div className="text-base font-semibold text-zinc-950">{item.name}</div>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">{formatIngredients(item.ingredients)}</p>
                </div>
              ))}
            </div>
          )}
        </article>
      ))}

      <button
        type="button"
        onClick={() => setIsAddDishOpen(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-[28px] border border-zinc-200 bg-white px-5 py-4 text-base font-medium text-zinc-950 shadow-sm transition hover:bg-zinc-100"
      >
        <Plus className="h-4 w-4" /> Добавить свое блюдо
      </button>
    </section>
  );

  const renderChatPanel = () => (
    <section className="flex min-h-[620px] flex-col rounded-[28px] border border-zinc-200 bg-white p-4 shadow-sm xl:h-[calc(100vh-12rem)]">
      <div className="mb-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Участники</h2>
          <span className="text-sm text-zinc-400">{guestNames.length}</span>
        </div>

        {guestNames.length === 0 ? (
          <p className="text-sm text-zinc-500">Пока никто не присоединился.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {guestNames.map((guestName) => (
              <span
                key={guestName}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  guestName === currentUser
                    ? "border-black bg-black text-white"
                    : "border-zinc-200 bg-white text-zinc-700"
                }`}
              >
                {guestName}
                {guestName === currentUser ? " (вы)" : ""}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-zinc-200">
        <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-4">
          <h2 className="text-lg font-semibold text-zinc-950">Чат банкета</h2>
        </div>

        <div className="flex-1 overflow-y-auto bg-zinc-50/70 px-4 py-5">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-sm text-zinc-500">
              Напишите первое сообщение и начните обсуждение.
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
                        className={`rounded-[24px] px-4 py-3 shadow-sm ${
                          isOwn ? "bg-black text-white" : "border border-zinc-200 bg-white text-zinc-950"
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

        <form onSubmit={sendMessage} className="border-t border-zinc-200 bg-white p-3">
          <div className="flex items-end gap-3">
            <input
              type="text"
              value={newMessage}
              onChange={(event) => setNewMessage(event.target.value)}
              placeholder={currentUser ? "Написать сообщение..." : "Сначала укажите ваше имя"}
              disabled={!currentUser}
              className="h-12 flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-sm text-zinc-950 outline-none transition focus:border-zinc-300 focus:bg-white disabled:cursor-not-allowed disabled:text-zinc-400"
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
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <header className="mb-6 rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-zinc-400">Банкет</p>
              <h1 className="truncate text-3xl font-semibold tracking-tight text-zinc-950">{party.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-500">
                <span className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1.5">
                  <Users className="h-4 w-4" />
                  {guestNames.length} участников
                </span>
                {party.guest_count ? (
                  <span className="rounded-full bg-zinc-100 px-3 py-1.5">План: {party.guest_count} гостей</span>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={handleShare}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100"
            >
              <Share2 className="h-4 w-4" />
              Поделиться
            </button>
          </div>
        </header>

        <div className="mb-4 grid grid-cols-2 gap-3 xl:hidden">
          <button
            type="button"
            onClick={() => setActiveTab("menu")}
            className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition ${
              activeTab === "menu" ? "bg-black text-white" : "border border-zinc-200 bg-white text-zinc-700"
            }`}
          >
            <UtensilsCrossed className="h-4 w-4" />
            Меню
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition ${
              activeTab === "chat" ? "bg-black text-white" : "border border-zinc-200 bg-white text-zinc-700"
            }`}
          >
            <MessageCircle className="h-4 w-4" />
            Чат
          </button>
        </div>

        <div className="hidden gap-6 xl:grid xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          {renderMenuPanel()}
          {renderChatPanel()}
        </div>

        <div className="xl:hidden">{activeTab === "menu" ? renderMenuPanel() : renderChatPanel()}</div>
      </div>

      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[32px] bg-white p-8 shadow-2xl">
            <div className="mb-6">
              <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-zinc-400">Участник</p>
              <h2 className="text-3xl font-semibold text-zinc-950">Как вас зовут?</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-500">
                Имя нужно, чтобы вы появились в списке гостей и могли писать в чат.
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
                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-4 text-base text-zinc-950 outline-none transition focus:border-zinc-300 focus:bg-white"
                autoFocus
              />
              <button
                type="submit"
                disabled={!inputName.trim()}
                className="w-full rounded-2xl bg-black px-5 py-4 text-base font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                Продолжить
              </button>
            </form>
          </div>
        </div>
      )}

      {isAddDishOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setIsAddDishOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-[32px] bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6">
              <h3 className="text-2xl font-semibold text-zinc-950">Добавить свое блюдо</h3>
              <p className="mt-2 text-sm text-zinc-500">
                Блюдо сразу появится в общем меню для всех участников.
              </p>
            </div>

            <form onSubmit={handleAddDish} className="space-y-4">
              <input
                type="text"
                value={newDishName}
                onChange={(event) => setNewDishName(event.target.value)}
                placeholder="Например: Брускетта с томатами"
                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3.5 text-sm text-zinc-950 outline-none transition focus:border-zinc-300 focus:bg-white"
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
                        : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100"
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
                  className="flex-1 rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
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
