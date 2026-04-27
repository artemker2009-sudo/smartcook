"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Plus, SendHorizonal, Share2, Sparkles, Users } from "lucide-react";
import { useParams } from "next/navigation";

import { supabase } from "@/lib/supabase";

const MENU_CATEGORIES = ["Закуски", "Салаты", "Горячее", "Напитки"] as const;

type MenuCategory = (typeof MENU_CATEGORIES)[number];

type Party = {
  id: string;
  title: string;
  guest_count: number | null;
};

type PartyMember = {
  id?: string;
  party_id?: string;
  name: string;
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
  user_name: string;
  text: string;
  created_at?: string | null;
};

const getStoredNameKey = (partyId: string) => `party_name_${partyId}`;

const isMenuCategory = (value: string): value is MenuCategory =>
  MENU_CATEGORIES.includes(value as MenuCategory);

const normalizeCategory = (category?: string | null): MenuCategory => {
  if (category === "Горячее блюдо") return "Горячее";
  if (category && isMenuCategory(category)) return category;
  return "Закуски";
};

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

const upsertMember = (prev: PartyMember[], next: PartyMember) => {
  if (next.id && prev.some((member) => member.id === next.id)) {
    return prev.map((member) => (member.id === next.id ? next : member));
  }

  if (prev.some((member) => member.name.trim().toLowerCase() === next.name.trim().toLowerCase())) {
    return prev.map((member) =>
      member.name.trim().toLowerCase() === next.name.trim().toLowerCase() ? { ...member, ...next } : member,
    );
  }

  return [...prev, next];
};

const upsertItem = (prev: PartyItem[], next: PartyItem) => {
  if (!next.id) return [...prev, next];
  const exists = prev.some((item) => item.id === next.id);
  return exists ? prev.map((item) => (item.id === next.id ? next : item)) : [...prev, next];
};

const upsertMessage = (prev: PartyMessage[], next: PartyMessage) => {
  const withoutOptimisticTwin = prev.filter(
    (message) =>
      !(
        String(message.id).startsWith("temp-") &&
        message.user_name === next.user_name &&
        message.text === next.text
      ),
  );

  if (next.id && withoutOptimisticTwin.some((message) => message.id === next.id)) {
    return withoutOptimisticTwin;
  }

  return [...withoutOptimisticTwin, next].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return aTime - bTime;
  });
};

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-zinc-200/80 ${className}`} />;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="mb-6 rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm">
          <SkeletonBlock className="mb-4 h-8 w-64" />
          <SkeletonBlock className="h-5 w-40" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <div className="space-y-4">
            <SkeletonBlock className="h-16 w-full rounded-[28px]" />
            {MENU_CATEGORIES.map((category) => (
              <div
                key={category}
                className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm"
              >
                <SkeletonBlock className="mb-5 h-6 w-32" />
                <div className="space-y-3">
                  <SkeletonBlock className="h-16 w-full" />
                  <SkeletonBlock className="h-16 w-full" />
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm">
            <SkeletonBlock className="mb-4 h-10 w-full rounded-2xl" />
            <SkeletonBlock className="mb-3 h-24 w-full rounded-3xl" />
            <SkeletonBlock className="mb-3 ml-auto h-20 w-2/3 rounded-3xl" />
            <SkeletonBlock className="h-14 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PartyRoomPage() {
  const params = useParams();
  const partyId = params.id as string;
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [party, setParty] = useState<Party | null>(null);
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [items, setItems] = useState<PartyItem[]>([]);
  const [messages, setMessages] = useState<PartyMessage[]>([]);

  const [currentUserName, setCurrentUserName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [newDishName, setNewDishName] = useState("");
  const [newDishCategory, setNewDishCategory] = useState<MenuCategory>("Закуски");

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isAddingDish, setIsAddingDish] = useState(false);
  const [isAddDishOpen, setIsAddDishOpen] = useState(false);

  const [showNameModal, setShowNameModal] = useState(false);
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    if (!partyId) return;

    let isCancelled = false;

    const initializePage = async () => {
      const storedName = window.localStorage.getItem(getStoredNameKey(partyId)) ?? "";
      if (isCancelled) return;

      setCurrentUserName(storedName);
      setNameInput(storedName);
      setShowNameModal(!storedName);

      setIsLoading(true);
      setPageError("");

      const [partyResult, membersResult, itemsResult, messagesResult] = await Promise.all([
        supabase.from("parties").select("*").eq("id", partyId).maybeSingle(),
        supabase.from("party_members").select("*").eq("party_id", partyId),
        supabase.from("party_items").select("*").eq("party_id", partyId),
        supabase
          .from("party_messages")
          .select("*")
          .eq("party_id", partyId)
          .order("created_at", { ascending: true }),
      ]);

      if (isCancelled) return;

      if (partyResult.error || membersResult.error || itemsResult.error || messagesResult.error) {
        console.error("Ошибка загрузки банкета:", {
          party: partyResult.error,
          members: membersResult.error,
          items: itemsResult.error,
          messages: messagesResult.error,
        });
        setPageError("Не удалось загрузить банкет. Попробуйте обновить страницу.");
        setParty(null);
        setMembers([]);
        setItems([]);
        setMessages([]);
        setIsLoading(false);
        return;
      }

      setParty((partyResult.data as Party | null) ?? null);
      setMembers((membersResult.data as PartyMember[]) ?? []);
      setItems((itemsResult.data as PartyItem[]) ?? []);
      setMessages((messagesResult.data as PartyMessage[]) ?? []);
      setIsLoading(false);
    };

    void initializePage();

    return () => {
      isCancelled = true;
    };
  }, [partyId]);

  useEffect(() => {
    if (!partyId) return;

    const channel = supabase
      .channel(`party-room-${partyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "party_messages",
          filter: `party_id=eq.${partyId}`,
        },
        (payload) => {
          setMessages((prev) => upsertMessage(prev, payload.new as PartyMessage));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "party_members",
          filter: `party_id=eq.${partyId}`,
        },
        (payload) => {
          setMembers((prev) => upsertMember(prev, payload.new as PartyMember));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "party_items",
          filter: `party_id=eq.${partyId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setItems((prev) => prev.filter((item) => item.id !== payload.old.id));
            return;
          }

          const nextItem = payload.new as PartyItem;
          setItems((prev) => upsertItem(prev, nextItem));
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

  const groupedItems = useMemo(
    () =>
      MENU_CATEGORIES.map((category) => ({
        category,
        items: items.filter((item) => normalizeCategory(item.category) === category),
      })),
    [items],
  );

  const memberNames = useMemo(
    () =>
      Array.from(
        new Set(
          members
            .map((member) => member.name.trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, "ru")),
    [members],
  );

  const handleSaveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = nameInput.trim();
    if (!trimmedName || !partyId) return;

    window.localStorage.setItem(getStoredNameKey(partyId), trimmedName);
    setCurrentUserName(trimmedName);
    setShowNameModal(false);
    setMembers((prev) => upsertMember(prev, { id: `temp-${trimmedName}`, name: trimmedName }));

    setIsSavingName(true);

    const { data, error } = await supabase
      .from("party_members")
      .insert({ party_id: partyId, name: trimmedName })
      .select("*")
      .single();

    setIsSavingName(false);

    if (error) {
      console.error("Ошибка добавления участника:", error);
      window.localStorage.removeItem(getStoredNameKey(partyId));
      setCurrentUserName("");
      setMembers((prev) => prev.filter((member) => member.id !== `temp-${trimmedName}`));
      setShowNameModal(true);
      window.alert("Не удалось сохранить имя в списке участников. Попробуйте обновить страницу.");
      return;
    }

    setMembers((prev) => upsertMember(prev, data as PartyMember));
  };

  const handleShare = async () => {
    if (!party) return;

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
    } catch (error) {
      console.error("Ошибка шаринга:", error);
    }
  };

  const handleSendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const text = messageInput.trim();
    if (!text || !partyId || !currentUserName || isSendingMessage) return;

    const optimisticId = `temp-${Date.now()}`;
    const optimisticMessage: PartyMessage = {
      id: optimisticId,
      party_id: partyId,
      user_name: currentUserName,
      text,
      created_at: new Date().toISOString(),
    };

    setMessageInput("");
    setIsSendingMessage(true);
    setMessages((prev) => upsertMessage(prev, optimisticMessage));

    const { data, error } = await supabase
      .from("party_messages")
      .insert({
        party_id: partyId,
        user_name: currentUserName,
        text,
      })
      .select("*")
      .single();

    setIsSendingMessage(false);

    if (error) {
      console.error("Ошибка отправки сообщения:", error);
      setMessages((prev) => prev.filter((message) => message.id !== optimisticId));
      setMessageInput(text);
      return;
    }

    setMessages((prev) => upsertMessage(prev, data as PartyMessage));
  };

  const handleAddDish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = newDishName.trim();
    if (!trimmedName || !partyId || isAddingDish) return;

    setIsAddingDish(true);

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

    setIsAddingDish(false);

    if (error) {
      console.error("Ошибка добавления блюда:", error);
      window.alert("Не удалось добавить блюдо.");
      return;
    }

    setItems((prev) => upsertItem(prev, data as PartyItem));
    setNewDishName("");
    setNewDishCategory("Закуски");
    setIsAddDishOpen(false);
  };

  if (isLoading) {
    return (
      <>
        <LoadingScreen />
        {showNameModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-[32px] bg-white p-8 shadow-2xl">
              <div className="mb-6">
                <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-zinc-400">
                  Участник
                </p>
                <h2 className="text-3xl font-semibold text-zinc-950">Как вас зовут?</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-500">
                  Имя нужно, чтобы вы появились в списке гостей и могли писать в чат.
                </p>
              </div>

              <form onSubmit={handleSaveName} className="space-y-4">
                <input
                  value={nameInput}
                  onChange={(event) => setNameInput(event.target.value)}
                  placeholder="Введите ваше имя"
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-4 text-base text-zinc-950 outline-none transition focus:border-zinc-300 focus:bg-white"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!nameInput.trim() || isSavingName}
                  className="w-full rounded-2xl bg-black px-5 py-4 text-base font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                >
                  {isSavingName ? "Сохраняем..." : "Продолжить"}
                </button>
              </form>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <header className="mb-6 rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-zinc-400">
                Банкет
              </p>
              <h1 className="truncate text-3xl font-semibold tracking-tight text-zinc-950">
                {party?.title ?? "Банкет не найден"}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-500">
                <span className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1.5">
                  <Users className="h-4 w-4" />
                  {members.length} участников
                </span>
                {party?.guest_count ? (
                  <span className="rounded-full bg-zinc-100 px-3 py-1.5">
                    План: {party.guest_count} гостей
                  </span>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={handleShare}
              disabled={!party}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
            >
              <Share2 className="h-4 w-4" />
              Поделиться
            </button>
          </div>
        </header>

        {pageError ? (
          <div className="rounded-[32px] border border-red-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-zinc-950">Не удалось открыть банкет</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-500">{pageError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              Обновить страницу
            </button>
          </div>
        ) : !party ? (
          <div className="rounded-[32px] border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-zinc-950">Банкет не найден</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-500">
              Возможно, ссылка устарела или мероприятие уже было удалено.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
            <section className="space-y-4">
              {items.length === 0 ? (
                <button
                  type="button"
                  onClick={() => window.alert("Заглушка: здесь будет генерация меню с ИИ.")}
                  className="flex w-full items-center justify-center gap-3 rounded-[28px] bg-black px-6 py-5 text-left text-white shadow-sm transition hover:bg-zinc-800"
                >
                  <Sparkles className="h-5 w-5" />
                  <span className="text-lg font-medium">Сгенерировать меню с ИИ</span>
                </button>
              ) : null}

              {groupedItems.map(({ category, items: categoryItems }) => (
                <article
                  key={category}
                  className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm"
                >
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold text-zinc-950">{category}</h2>
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500">
                      {categoryItems.length}
                    </span>
                  </div>

                  {categoryItems.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
                      Пока в этой категории пусто
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {categoryItems.map((item) => (
                        <div
                          key={item.id ?? `${category}-${item.name}`}
                          className="rounded-3xl border border-zinc-200 bg-zinc-50 px-4 py-4"
                        >
                          <div className="text-base font-semibold text-zinc-950">{item.name}</div>
                          <p className="mt-2 text-sm leading-6 text-zinc-500">
                            {formatIngredients(item.ingredients)}
                          </p>
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

            <section className="flex min-h-[620px] flex-col rounded-[28px] border border-zinc-200 bg-white p-4 shadow-sm xl:h-[calc(100vh-12rem)]">
              <div className="mb-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Участники
                  </h2>
                  <span className="text-sm text-zinc-400">{members.length}</span>
                </div>

                {memberNames.length === 0 ? (
                  <p className="text-sm text-zinc-500">Пока никто не присоединился.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {memberNames.map((memberName) => (
                      <span
                        key={memberName}
                        className={`rounded-full border px-3 py-1.5 text-sm ${
                          memberName === currentUserName
                            ? "border-black bg-black text-white"
                            : "border-zinc-200 bg-white text-zinc-700"
                        }`}
                      >
                        {memberName}
                        {memberName === currentUserName ? " (вы)" : ""}
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
                        const isOwn = message.user_name === currentUserName;

                        return (
                          <div
                            key={message.id ?? `${message.created_at}-${index}`}
                            className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                          >
                            <div className={`max-w-[85%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                              <span className="mb-1 px-1 text-xs text-zinc-400">
                                {isOwn ? "Вы" : message.user_name}
                              </span>
                              <div
                                className={`rounded-[24px] px-4 py-3 shadow-sm ${
                                  isOwn
                                    ? "bg-black text-white"
                                    : "border border-zinc-200 bg-white text-zinc-950"
                                }`}
                              >
                                <p className="whitespace-pre-wrap break-words text-sm leading-6">
                                  {message.text}
                                </p>
                                <div
                                  className={`mt-2 text-[11px] ${
                                    isOwn ? "text-zinc-300" : "text-zinc-400"
                                  }`}
                                >
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

                <form
                  onSubmit={handleSendMessage}
                  className="border-t border-zinc-200 bg-white p-3"
                >
                  <div className="flex items-end gap-3">
                    <input
                      type="text"
                      value={messageInput}
                      onChange={(event) => setMessageInput(event.target.value)}
                      placeholder={
                        currentUserName ? "Написать сообщение..." : "Сначала укажите ваше имя"
                      }
                      disabled={!currentUserName}
                      className="h-12 flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-sm text-zinc-950 outline-none transition focus:border-zinc-300 focus:bg-white disabled:cursor-not-allowed disabled:text-zinc-400"
                    />
                    <button
                      type="submit"
                      disabled={!messageInput.trim() || !currentUserName || isSendingMessage}
                      className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
                    >
                      <SendHorizonal className="h-4 w-4" />
                    </button>
                  </div>
                </form>
              </div>
            </section>
          </div>
        )}
      </div>

      {showNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[32px] bg-white p-8 shadow-2xl">
            <div className="mb-6">
              <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-zinc-400">
                Участник
              </p>
              <h2 className="text-3xl font-semibold text-zinc-950">Как вас зовут?</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-500">
                После этого вы появитесь в списке гостей и сможете писать в чат.
              </p>
            </div>

            <form onSubmit={handleSaveName} className="space-y-4">
              <input
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                placeholder="Введите ваше имя"
                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-4 text-base text-zinc-950 outline-none transition focus:border-zinc-300 focus:bg-white"
                autoFocus
              />
              <button
                type="submit"
                disabled={!nameInput.trim() || isSavingName}
                className="w-full rounded-2xl bg-black px-5 py-4 text-base font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isSavingName ? "Сохраняем..." : "Продолжить"}
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
