"use client";

import { type ChangeEvent, type FormEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, type User } from "@supabase/supabase-js";
import {
  Bug,
  Heart,
  Loader2,
  MessageCircle,
  Paperclip,
  Plus,
  SendHorizonal,
  Share2,
  Sparkles,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { reachGoal } from "@/lib/metrika";
import {
  activatePartyPassAction,
  addPartyItemAction,
  bindPartyHostAction,
  joinPartyAction,
  sendPaywallChatAlertAction,
  togglePartyItemVoteAction,
  updatePartyRoomSettingsAction,
} from "@/app/actions/party";
import AuthModal from "@/components/modals/AuthModal";
import FullScreenImage from "@/components/modals/FullScreenImage";
import ReportError from "@/components/ReportError";
import BanquetAccountBanner from "@/components/BanquetAccountBanner";
import { claimGuestPartiesToAccount } from "@/lib/claimParties";
import { preparePhoto, reportPhotoError, isHeic } from "@/lib/photo";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const MENU_CATEGORIES = ["Закуски", "Салаты", "Горячее", "Гарниры", "Напитки", "Десерты"] as const;
const SUPABASE_TIMEOUT_MS = 12000;
const ADD_DISH_TIMEOUT_MS = 30000;
const CHAT_PHOTO_UPLOAD_TIMEOUT_MS = 30000;
const CHAT_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const GENERATE_MENU_TIMEOUT_MS = 65000;
const CHAT_PHOTO_MESSAGE_PREFIX = "__party_chat_photo__:";
const PAYWALL_ALERT_MESSAGE_MARKER = "бесплатный лимит гостей уже закончился";
const TELEGRAM_CHANNEL_URL = "https://t.me/smartcook2026";
const TELEGRAM_CHANNEL_NAME = "SmartCook";
const getOnboardingStorageKey = (partyId: string) => `onboarding_seen_${partyId}`;

type MenuCategory = (typeof MENU_CATEGORIES)[number];

type Party = {
  id: string;
  title: string;
  description?: string | null;
  theme?: string | null;
  guest_count?: number | null;
  host_id?: string | null;
  is_paid?: boolean | null;
  is_generating?: boolean | null;
};

type AiConfig = {
  promptTitle: string;
  promptDescription: string;
  categories: string[];
  tags: string[];
  budget: string;
  mustHave: string;
  mustNotHave: string;
};

type PartyMember = {
  id?: string;
  party_id?: string;
  user_id?: string | null;
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
  description?: string | null;
  category?: string | null;
  ingredients?: MenuIngredient[] | string | null;
  votes?: string[] | null;
  created_at?: string | null;
};

type PartyMessage = {
  id?: string;
  party_id?: string;
  user_id?: string | null;
  user_name?: string | null;
  text: string;
  created_at?: string | null;
  local_photo_url?: string;
};

type StoredPartyParticipant = {
  userId: string;
  name: string;
};

type ClientRoomProps = {
  party: Party;
  initialItems: PartyItem[];
  initialMembers: PartyMember[];
  initialMessages: PartyMessage[];
};

const isMenuCategory = (value: string): value is MenuCategory =>
  MENU_CATEGORIES.includes(value as MenuCategory);

const normalizeCategory = (category?: string | null): string => {
  if (category === "Горячее блюдо") return "Горячее";
  if (category?.trim()) return category.trim();
  return "Закуски";
};

const getChatPhotoUrl = (text: string) =>
  text.startsWith(CHAT_PHOTO_MESSAGE_PREFIX) ? text.slice(CHAT_PHOTO_MESSAGE_PREFIX.length).trim() : null;

const getChatPhotoDisplaySrc = (url: string) => {
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  return `/api/party/chat-photo/image?url=${encodeURIComponent(url)}`;
};

const sortPartyMessages = (items: PartyMessage[]) =>
  [...items].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return aTime - bTime;
  });

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; error_description?: unknown };
    if (typeof candidate.message === "string" && candidate.message) return candidate.message;
    if (typeof candidate.error_description === "string" && candidate.error_description) {
      return candidate.error_description;
    }
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const isAbortError = (error: unknown) =>
  error instanceof DOMException ? error.name === "AbortError" : error instanceof Error && error.name === "AbortError";

const copyTextToClipboard = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Падаем в DOM fallback для браузеров с ограниченным Clipboard API.
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textArea);
  }
};

const getMutationAlertMessage = (error: unknown) => {
  const message = getErrorMessage(error);

  if (message.includes("превышено время ожидания")) {
    return "Ошибка: превышено время ожидания. Проверьте интернет и попробуйте еще раз.";
  }

  return "Ошибка: " + message;
};

const normalizeName = (value?: string | null) => value?.trim().toLowerCase() ?? "";
const getGuestName = (guest: PartyMember) => (guest.user_name ?? guest.name ?? "").trim();
const getGuestIdentity = (guest: PartyMember) => guest.user_id?.trim() || `name:${normalizeName(getGuestName(guest))}`;

const getMessageAuthor = (message: PartyMessage) => (message.user_name ?? "").trim();
const getMessageIdentity = (message: PartyMessage) =>
  message.user_id?.trim() || `name:${normalizeName(getMessageAuthor(message))}`;
const getPartyParticipantStorageKey = (partyId: string) => `party_participant_${partyId}`;
const getPartyNameStorageKey = (partyId: string) => `party_name_${partyId}`;
const getPartyUserIdStorageKey = (partyId: string) => `party_user_id_${partyId}`;
const getPartyAdminStorageKey = (partyId: string) => `party_admin_${partyId}`;

// Тот же ключ, что и у создателя банкета (app/party/create/page.tsx) и у списка
// «мои банкеты» (app/parties/page.tsx). Список банкетов для анонима читается
// ТОЛЬКО из этого ключа, поэтому приглашённый гость обязан записать сюда id
// банкета — иначе после ухода со страницы банкет пропадает из его списка
// (участие при этом на сервере есть — party_members создаётся при join).
const GUEST_PARTIES_STORAGE_KEY = "smartcook_guest_parties";
const AI_CONFIG_TAGS = ["Веган", "Без глютена", "Острое", "Без орехов", "Кето", "Без лактозы", "ПП"] as const;
const AI_CONFIG_CATEGORY_OPTIONS = ["Закуски", "Салаты", "Горячее", "Гарниры", "Напитки", "Десерты"] as const;
const DEFAULT_AI_CONFIG_CATEGORIES = ["Закуски", "Горячее", "Напитки"];

const getDefaultAiConfig = (room: Party): AiConfig => ({
  promptTitle: room.title,
  promptDescription: (room.theme ?? room.description ?? "").trim(),
  categories: [...DEFAULT_AI_CONFIG_CATEGORIES],
  tags: [],
  budget: "",
  mustHave: "",
  mustNotHave: "",
});

const generateSafeUserId = () => {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

const getSafeLocalStorage = () => {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const safeStorageGetItem = (key: string) => {
  try {
    return getSafeLocalStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const safeStorageSetItem = (key: string, value: string) => {
  try {
    getSafeLocalStorage()?.setItem(key, value);
  } catch {
    // Safari private mode and quota issues must not break the join flow.
  }
};

const safeStorageRemoveItem = (key: string) => {
  try {
    getSafeLocalStorage()?.removeItem(key);
  } catch {
    // Ignore storage failures to keep UI responsive.
  }
};

// Запоминаем банкет в списке «мои банкеты» этого устройства/браузера — дедуп,
// тот же формат, что и saveGuestPartyId у создателя. Вызывается при успешном
// join (см. completeJoin), чтобы приглашённый гость видел банкет в своём
// списке при следующих заходах с этого же устройства.
const rememberPartyInHub = (partyId: string) => {
  try {
    const parsed = JSON.parse(safeStorageGetItem(GUEST_PARTIES_STORAGE_KEY) || "[]");
    const currentIds = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
    if (currentIds.includes(partyId)) return;
    safeStorageSetItem(GUEST_PARTIES_STORAGE_KEY, JSON.stringify([...new Set([...currentIds, partyId])]));
  } catch {
    safeStorageSetItem(GUEST_PARTIES_STORAGE_KEY, JSON.stringify([partyId]));
  }
};

const withTimeout = async <T,>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> => {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label}: превышено время ожидания (${Math.ceil(timeoutMs / 1000)} сек)`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
};

const readStoredParticipant = (partyId: string): StoredPartyParticipant | null => {
  if (typeof window === "undefined") return null;

  const rawParticipant = safeStorageGetItem(getPartyParticipantStorageKey(partyId));
  if (rawParticipant) {
    try {
      const parsed = JSON.parse(rawParticipant) as Partial<StoredPartyParticipant>;
      if (parsed.userId?.trim() && parsed.name?.trim()) {
        return { userId: parsed.userId.trim(), name: parsed.name.trim() };
      }
    } catch {
      // Игнорируем поврежденный localStorage и пробуем legacy-ключи.
    }
  }

  const name = safeStorageGetItem(getPartyNameStorageKey(partyId))?.trim();
  const userId = safeStorageGetItem(getPartyUserIdStorageKey(partyId))?.trim();

  if (name && userId) {
    return { userId, name };
  }

  return null;
};

const writeStoredParticipant = (partyId: string, participant: StoredPartyParticipant | null) => {
  if (typeof window === "undefined") return;

  if (!participant) {
    safeStorageRemoveItem(getPartyParticipantStorageKey(partyId));
    safeStorageRemoveItem(getPartyNameStorageKey(partyId));
    safeStorageRemoveItem(getPartyUserIdStorageKey(partyId));
    return;
  }

  safeStorageSetItem(getPartyParticipantStorageKey(partyId), JSON.stringify(participant));
  safeStorageSetItem(getPartyNameStorageKey(partyId), participant.name);
  safeStorageSetItem(getPartyUserIdStorageKey(partyId), participant.userId);
};

const formatTime = (value?: string | null) => {
  if (!value) return "";

  return new Date(value).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function getGuestDeclension(count: number) {
  const n = Math.abs(count) % 100;
  const n1 = count % 10;

  if (n > 10 && n < 20) return "гостей";
  if (n1 > 1 && n1 < 5) return "гостя";
  if (n1 === 1) return "гость";
  return "гостей";
}

const getParticipantDeclension = (count: number) => {
  const n = Math.abs(count) % 100;
  const n1 = count % 10;

  if (n > 10 && n < 20) return "участников";
  if (n1 > 1 && n1 < 5) return "участника";
  if (n1 === 1) return "участник";
  return "участников";
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

const formatMenuIngredient = (ingredient: MenuIngredient) =>
  [ingredient.name, ingredient.amount, ingredient.unit].filter((part) => part !== undefined && part !== null && part !== "").join(" ");

const getMenuItemDescription = (item: PartyItem) => {
  const description = item.description?.trim();
  if (description) return description;

  const ingredients = parseIngredients(item.ingredients)
    .map(formatMenuIngredient)
    .filter(Boolean);

  return ingredients.length > 0 ? ingredients.join(", ") : "Участники смогут оценить это блюдо и обсудить детали в чате.";
};

const toggleVotesForUser = (votes: string[] | null | undefined, userMarkers: string[], userId: string) => {
  const currentVotes = votes ?? [];
  const hasCurrentVote = currentVotes.some((vote) => userMarkers.includes(vote));
  const votesWithoutCurrentUser = currentVotes.filter((vote) => !userMarkers.includes(vote));

  return hasCurrentVote ? votesWithoutCurrentUser : [...votesWithoutCurrentUser, userId];
};

export default function ClientRoom({
  party,
  initialItems,
  initialMembers,
  initialMessages,
}: ClientRoomProps) {
  const router = useRouter();
  const legacyStoredName =
    typeof window === "undefined" ? "" : safeStorageGetItem(getPartyNameStorageKey(party.id))?.trim() ?? "";
  const storedParticipant = readStoredParticipant(party.id);
  const storedName = storedParticipant?.name ?? legacyStoredName;
  const storedUserId = storedParticipant?.userId ?? null;
  const storedParticipantIsConfirmed = Boolean(
    storedUserId && initialMembers.some((guest) => getGuestIdentity(guest) === storedUserId),
  );

  const [currentUser, setCurrentUser] = useState<string | null>(storedParticipantIsConfirmed ? storedName || null : null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(
    storedParticipantIsConfirmed ? storedUserId : null,
  );
  const [showJoinModal, setShowJoinModal] = useState(!storedParticipantIsConfirmed);
  const [inputName, setInputName] = useState(storedName);
  const [activeTab, setActiveTab] = useState<"menu" | "chat">("menu");
  const [showPaywall, setShowPaywall] = useState(false);
  const [isActivatingTelegramAccess, setIsActivatingTelegramAccess] = useState(false);
  const [hasOpenedTelegramChannel, setHasOpenedTelegramChannel] = useState(false);
  const [currentParty, setCurrentParty] = useState(party);
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [isObserver, setIsObserver] = useState(false);
  const [joinLimitReached, setJoinLimitReached] = useState(false);
  const [pendingJoinName, setPendingJoinName] = useState("");
  const [isNotifyingOrganizer, setIsNotifyingOrganizer] = useState(false);
  const [hasNotifiedOrganizer, setHasNotifiedOrganizer] = useState(false);
  const [notifyOrganizerError, setNotifyOrganizerError] = useState("");
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [roomTitleInput, setRoomTitleInput] = useState(party.title);
  const [roomDescriptionInput, setRoomDescriptionInput] = useState((party.description ?? party.theme ?? "").trim());
  const [isSavingRoomSettings, setIsSavingRoomSettings] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [authLoading, setAuthLoading] = useState(false);
  const [showWelcomeOnboarding, setShowWelcomeOnboarding] = useState(false);
  const [expandedChatPhoto, setExpandedChatPhoto] = useState<string | null>(null);

  const [guests, setGuests] = useState<PartyMember[]>(initialMembers ?? []);
  const [messages, setMessages] = useState<PartyMessage[]>(initialMessages ?? []);
  const [menuItems, setMenuItems] = useState<PartyItem[]>(initialItems ?? []);
  const [showAddDishModal, setShowAddDishModal] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [showAiConfigurator, setShowAiConfigurator] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiConfig>(() => getDefaultAiConfig(party));
  const [customAiCategoryInput, setCustomAiCategoryInput] = useState("");
  const [customAiTagInput, setCustomAiTagInput] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [newDishName, setNewDishName] = useState("");
  const [newDishCategory, setNewDishCategory] = useState("Закуски");
  const [isJoining, setIsJoining] = useState(false);
  const [isAddingDish, setIsAddingDish] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [votingItemId, setVotingItemId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const menuItemsRef = useRef<PartyItem[]>(initialItems ?? []);
  const roomChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const roomChannelReadyRef = useRef(false);
  const lastPaywallAlertToastRef = useRef<{ guestName: string; shownAt: number } | null>(null);
  const CATEGORIES = MENU_CATEGORIES;
  const roomHostId = currentParty.host_id?.trim() || null;
  const currentViewerId = currentUserId?.trim() || null;
  const isHost = Boolean(currentViewerId && roomHostId && currentViewerId === roomHostId);
  const generationInProgress = isGenerating || Boolean(currentParty.is_generating);

  // Отправка аналитики
  const trackEvent = async (eventType: string) => {
    try {
      await withTimeout(
        supabase.from("analytics_events").insert([
          {
            party_id: party.id,
            user_name: currentUser || "anonymous",
            event_type: eventType,
          },
        ]),
        SUPABASE_TIMEOUT_MS,
        "Не удалось отправить аналитику",
      );
    } catch (e) {
      console.error("Analytics error", e);
    }
  };

  const getAuthenticatedParticipantId = useCallback(() => authUser?.id?.trim() || null, [authUser]);

  const refreshMenuItems = useCallback(async () => {
    const { data } = await supabase.from("party_items").select("*").eq("party_id", party.id);
    const nextItems = (data as PartyItem[] | null) ?? [];
    menuItemsRef.current = nextItems;
    setMenuItems(nextItems);
    return nextItems;
  }, [party.id]);

  const getRoomDescription = useCallback(
    (room: Party) => (room.description ?? room.theme ?? "").trim(),
    [],
  );

  const runWriteMutation = useCallback(
    async ({
      setLoading,
      mutate,
      rollback,
    }: {
      setLoading: (value: boolean) => void;
      mutate: () => Promise<void>;
      rollback?: () => void;
    }) => {
      setLoading(true);

      try {
        await mutate();
      } catch (error) {
        console.error(error);
        rollback?.();
        window.alert(getMutationAlertMessage(error));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const resizeMessageInput = useCallback((input: HTMLTextAreaElement) => {
    input.style.height = "auto";
    const nextHeight = Math.min(input.scrollHeight, 120);
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > 120 ? "auto" : "hidden";
  }, []);

  const showHostPaywallAlert = useCallback(
    (guestName: string) => {
      if (!isHost) return;

      const normalizedGuestName = guestName.trim() || "Гость";
      const lastAlert = lastPaywallAlertToastRef.current;
      const now = Date.now();

      if (lastAlert?.guestName === normalizedGuestName && now - lastAlert.shownAt < 3000) return;
      lastPaywallAlertToastRef.current = { guestName: normalizedGuestName, shownAt: now };

      toast(`Гость ${normalizedGuestName} не может войти (лимит мест). Откройте доступ через канал!`, {
        action: {
          label: "Открыть",
          onClick: () => setShowPaywall(true),
        },
      });
    },
    [isHost],
  );

  const completeJoin = useCallback(
    (name: string, userId: string, guestData?: PartyMember) => {
      writeStoredParticipant(party.id, { name, userId });
      // Гость стал участником — запоминаем банкет в списке этого устройства,
      // иначе он пропадёт из «моих банкетов» после ухода со страницы.
      rememberPartyInHub(party.id);
      setInputName(name);
      setCurrentUser(name);
      setCurrentUserId(userId);
      setIsObserver(false);
      setJoinLimitReached(false);
      setPendingJoinName("");
      setHasNotifiedOrganizer(false);
      setNotifyOrganizerError("");
      setShowJoinModal(false);
      setGuests((prev) =>
        prev.some((guest) => getGuestIdentity(guest) === userId)
          ? prev
          : [...prev, guestData ?? { party_id: party.id, user_id: userId, user_name: name }],
      );
    },
    [party.id],
  );

  const resetAddDishForm = useCallback(() => {
    setNewDishName("");
    setNewDishCategory("Закуски");
  }, []);

  const handleAddCustomDish = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!newDishName.trim() || !currentUserId || isAddingDish) return;

    const dishName = newDishName.trim();
    const previousItems = menuItemsRef.current;
    const optimisticId = `temp-${Date.now()}`;
    const optimisticItem: PartyItem = {
      id: optimisticId,
      party_id: party.id,
      name: dishName,
      category: newDishCategory,
      ingredients: [],
      votes: [currentUserId],
    };

    setIsAddingDish(true);
    menuItemsRef.current = [...previousItems, optimisticItem];
    setMenuItems(menuItemsRef.current);

    try {
      const result = await withTimeout(
        addPartyItemAction(party.id, dishName, newDishCategory, currentUserId),
        ADD_DISH_TIMEOUT_MS,
        "Не удалось добавить блюдо",
      );

      if (!result.success) {
        throw new Error(result.error || "База данных отклонила добавление блюда");
      }

      const nextItems = menuItemsRef.current.map((item) => (item.id === optimisticId ? result.item : item));
      menuItemsRef.current = nextItems;
      setMenuItems(nextItems);
      resetAddDishForm();
      setShowAddDishModal(false);
      toast.success("Блюдо добавлено");

      refreshMenuItems().catch((refreshError) => {
        console.warn("Menu refresh after manual dish add failed:", refreshError);
      });
    } catch (error) {
      console.error("Manual dish add failed:", error);
      toast.error(getErrorMessage(error));
      menuItemsRef.current = previousItems;
      setMenuItems(previousItems);
    } finally {
      setIsAddingDish(false);
    }
  };

  const handleCloseAddDishModal = () => {
    if (isAddingDish) return;
    setShowAddDishModal(false);
  };

  const toggleVote = async (itemId: string) => {
    if (!currentUserId || votingItemId === itemId) return;

    const currentUserMarkers = [currentUserId, currentUser].filter(Boolean) as string[];
    const latestItem = menuItemsRef.current.find((item) => item.id === itemId);
    if (!latestItem) return;

    const previousVotes = latestItem.votes ?? null;
    const nextVotes = toggleVotesForUser(previousVotes, currentUserMarkers, currentUserId);

    const optimisticItems = menuItemsRef.current.map((item) =>
      item.id === itemId ? { ...item, votes: nextVotes } : item,
    );
    menuItemsRef.current = optimisticItems;
    setMenuItems(optimisticItems);

    await runWriteMutation({
      setLoading: (loading) => setVotingItemId(loading ? itemId : null),
      mutate: async () => {
        const result = await withTimeout(
          togglePartyItemVoteAction(party.id, itemId, currentUserId, currentUser),
          SUPABASE_TIMEOUT_MS,
          "Не удалось обновить голос",
        );
        if (!result.success) throw new Error(result.error);

        const updatedItem = result.item as PartyItem;
        menuItemsRef.current = menuItemsRef.current.map((item) => (item.id === itemId ? updatedItem : item));
        setMenuItems((prev) => prev.map((item) => (item.id === itemId ? updatedItem : item)));
      },
      rollback: () => {
        const rollbackItem = (item: PartyItem) => {
          if (item.id !== itemId) return item;

          const itemStillHasOptimisticVotes = JSON.stringify(item.votes ?? null) === JSON.stringify(nextVotes);
          return itemStillHasOptimisticVotes ? { ...item, votes: previousVotes } : item;
        };

        menuItemsRef.current = menuItemsRef.current.map(rollbackItem);
        setMenuItems((prev) => prev.map(rollbackItem));
      },
    });
  };

  useEffect(() => {
    let isCancelled = false;

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isCancelled) setAuthUser(session?.user || null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user || null);
    });

    return () => {
      isCancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (showJoinModal || !currentUserId) return;
    if (safeStorageGetItem(getOnboardingStorageKey(party.id)) === "true") return;

    setShowWelcomeOnboarding(true);
  }, [currentUserId, party.id, showJoinModal]);

  useEffect(() => {
    if (!storedUserId || !storedName) return;
    if (initialMembers.some((guest) => getGuestIdentity(guest) === storedUserId)) return;

    let isCancelled = false;

    void joinPartyAction(party.id, storedName, storedUserId)
      .then((result) => {
        if (isCancelled) return;

        if (result.success) {
          setCurrentParty((prev) => ({ ...prev, is_paid: result.isPaid }));
          completeJoin(storedName, result.userId, result.guestData);
          return;
        }

        if (result.error === "PAYWALL_REACHED") {
          writeStoredParticipant(party.id, null);
          setCurrentUser(null);
          setCurrentUserId(null);
          setGuests(initialMembers);
          setCurrentParty((prev) => ({ ...prev, is_paid: false }));
          setInputName(storedName);
          setPendingJoinName(storedName);
          setJoinLimitReached(true);
          setShowJoinModal(true);
          setShowPaywall(false);
          setNotifyOrganizerError("");
          return;
        }

        console.error("Stored participant restore failed:", result.error);
      })
      .catch((error) => {
        if (!isCancelled) {
          console.error("Stored participant restore failed:", error);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [completeJoin, initialMembers, party.id, storedName, storedUserId]);

  useEffect(() => {
    menuItemsRef.current = menuItems;
  }, [menuItems]);

  useEffect(() => {
    const channel = supabase
      .channel(`room:${party.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "party_messages",
          filter: `party_id=eq.${party.id}`,
        },
        (payload) => {
          const next = payload.new as PartyMessage;

          if (next.text.includes(PAYWALL_ALERT_MESSAGE_MARKER)) {
            showHostPaywallAlert(getMessageAuthor(next));
          }

          setMessages((prev) => {
            const existingIndex = prev.findIndex((message) => message.id && message.id === next.id);
            if (existingIndex >= 0) {
              return sortPartyMessages(
                prev.map((message, index) =>
                  index === existingIndex ? { ...next, local_photo_url: message.local_photo_url } : message,
                ),
              );
            }
            return sortPartyMessages([...prev, next]);
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
            prev.some((guest) => getGuestIdentity(guest) === getGuestIdentity(nextGuest)) ? prev : [...prev, nextGuest],
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "party_items",
          filter: `party_id=eq.${party.id}`,
        },
        (payload) => {
          const nextItem = payload.new as PartyItem;

          setMenuItems((prev) => {
            const existingIndex = prev.findIndex((item) => item.id === nextItem.id);
            if (existingIndex >= 0) {
              const nextItems = prev.map((item, index) => (index === existingIndex ? nextItem : item));
              menuItemsRef.current = nextItems;
              return nextItems;
            }

            const optimisticIndex = prev.findIndex(
              (item) =>
                item.id.startsWith("temp-") &&
                item.name === nextItem.name &&
                normalizeCategory(item.category) === normalizeCategory(nextItem.category),
            );

            if (optimisticIndex >= 0) {
              const nextItems = prev.map((item, index) => (index === optimisticIndex ? nextItem : item));
              menuItemsRef.current = nextItems;
              return nextItems;
            }

            const nextItems = [...prev, nextItem];
            menuItemsRef.current = nextItems;
            return nextItems;
          });

          setIsGenerating(false);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "party_items",
          filter: `party_id=eq.${party.id}`,
        },
        (payload) => {
          const nextItem = payload.new as PartyItem;
          setMenuItems((prev) => {
            const nextItems = prev.map((item) => (item.id === nextItem.id ? nextItem : item));
            menuItemsRef.current = nextItems;
            return nextItems;
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "party_items",
          filter: `party_id=eq.${party.id}`,
        },
        (payload) => {
          const deletedItem = payload.old as Partial<PartyItem>;
          setMenuItems((prev) => {
            const nextItems = prev.filter((item) => item.id !== deletedItem.id);
            menuItemsRef.current = nextItems;
            return nextItems;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "parties", filter: `id=eq.${party.id}` },
        (payload) => {
          setCurrentParty(() => payload.new as Party);
        },
      )
      .on("broadcast", { event: "paywall_alert" }, (payload) => {
        if (!isHost) return;

        const guestName =
          typeof payload.payload?.guestName === "string" && payload.payload.guestName.trim()
            ? payload.payload.guestName.trim()
            : "Гость";

        showHostPaywallAlert(guestName);
      })
      .subscribe((status) => {
        roomChannelReadyRef.current = status === "SUBSCRIBED";
      });
    roomChannelRef.current = channel;

    return () => {
      roomChannelRef.current = null;
      roomChannelReadyRef.current = false;
      void supabase.removeChannel(channel);
    };
  }, [isHost, party.id, showHostPaywallAlert]);

  useEffect(() => {
    if (!currentParty.is_paid) return;
    setShowPaywall(false);
    setJoinLimitReached(false);
  }, [currentParty.is_paid]);

  useEffect(() => {
    if (isSavingRoomSettings) return;
    setRoomTitleInput(currentParty.title);
    setRoomDescriptionInput(getRoomDescription(currentParty));
  }, [currentParty, getRoomDescription, isSavingRoomSettings]);

  useEffect(() => {
    const hostCandidateId = authUser?.id?.trim() || currentUserId?.trim();
    if (!hostCandidateId || currentParty.host_id) return;
    if (safeStorageGetItem(getPartyAdminStorageKey(party.id)) !== "true") return;

    setCurrentParty((prev) => ({ ...prev, host_id: hostCandidateId }));
    void bindPartyHostAction(party.id, hostCandidateId);
  }, [authUser, currentParty.host_id, currentUserId, party.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTab]);

  useEffect(() => {
    if (messageInputRef.current) {
      resizeMessageInput(messageInputRef.current);
    }
  }, [newMessage, resizeMessageInput]);

  useEffect(() => {
    if (!generationInProgress) return;

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
  }, [generationInProgress, party.id, refreshMenuItems]);

  const groupedItems = useMemo(
    () => {
      const categories = [
        ...MENU_CATEGORIES,
        ...menuItems
          .map((item) => normalizeCategory(item.category))
          .filter((category) => !isMenuCategory(category)),
      ].filter((category, index, list) => list.indexOf(category) === index);

      return categories.map((category) => ({
        category,
        items: menuItems.filter((item) => normalizeCategory(item.category) === category),
      }));
    },
    [menuItems],
  );

  const visibleGuests = useMemo(() => {
    const seen = new Set<string>();

    return guests
      .filter((guest) => {
        const identity = getGuestIdentity(guest);
        if (!identity || seen.has(identity)) return false;
        seen.add(identity);
        return Boolean(getGuestName(guest));
      })
      .sort((a, b) => getGuestName(a).localeCompare(getGuestName(b), "ru"));
  }, [guests]);

  const currentParticipantIdentity = currentUserId || (currentUser ? `name:${normalizeName(currentUser)}` : null);
  const roomDescription = getRoomDescription(currentParty);
  const roomParticipantsLabel = `${visibleGuests.length} ${getParticipantDeclension(visibleGuests.length)}`;
  const currentVoteMarkers = useMemo(
    () => [currentUserId, currentUser].filter(Boolean) as string[],
    [currentUserId, currentUser],
  );
  const hasCurrentUserVoted = useCallback(
    (votes?: string[] | null) => (votes ?? []).some((vote) => currentVoteMarkers.includes(vote)),
    [currentVoteMarkers],
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
    if (!inputName.trim() || isJoining) return;

    const trimmedName = inputName.trim();
    const previousParticipant = readStoredParticipant(party.id);
    const previousInputName = inputName;
    const previousCurrentUser = currentUser;
    const previousCurrentUserId = currentUserId;
    const previousGuests = guests;
    const previousIsObserver = isObserver;
    const previousJoinLimitReached = joinLimitReached;
    const previousPendingJoinName = pendingJoinName;
    const previousHasNotifiedOrganizer = hasNotifiedOrganizer;
    const previousShowJoinModal = showJoinModal;

    setIsJoining(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = getAuthenticatedParticipantId() || session?.user?.id?.trim() || generateSafeUserId();
      if (session?.user && !authUser) setAuthUser(session.user);
      const result = await withTimeout(
        joinPartyAction(party.id, trimmedName, userId),
        SUPABASE_TIMEOUT_MS,
        "Не удалось завершить вход",
      );

      if (!result.success) {
        if (result.error === "PAYWALL_REACHED") {
          setCurrentParty((prev) => ({ ...prev, is_paid: false }));
          setPendingJoinName(trimmedName);
          setJoinLimitReached(true);
          setShowJoinModal(true);
          setShowPaywall(false);
          setHasNotifiedOrganizer(false);
          setNotifyOrganizerError("");
          return;
        }

        throw new Error("error" in result ? result.error : "Не удалось завершить вход");
      }

      setCurrentParty((prev) => ({ ...prev, is_paid: result.isPaid }));
      completeJoin(trimmedName, result.userId, result.guestData);
    } catch (e) {
      console.error(e);
      writeStoredParticipant(party.id, previousParticipant);
      setInputName(previousInputName);
      setCurrentUser(previousCurrentUser);
      setCurrentUserId(previousCurrentUserId);
      setGuests(previousGuests);
      setIsObserver(previousIsObserver);
      setJoinLimitReached(previousJoinLimitReached);
      setPendingJoinName(previousPendingJoinName);
      setHasNotifiedOrganizer(previousHasNotifiedOrganizer);
      setShowJoinModal(previousShowJoinModal);
      window.alert(getMutationAlertMessage(e));
    } finally {
      setIsJoining(false);
    }
  };

  const handleOpenTelegramChannel = () => {
    setHasOpenedTelegramChannel(true);
    void trackEvent("telegram_channel_opened");
    window.open(TELEGRAM_CHANNEL_URL, "_blank", "noopener,noreferrer");
  };

  const handleActivateTelegramAccess = async () => {
    if (isActivatingTelegramAccess) return;

    if (!hasOpenedTelegramChannel) {
      handleOpenTelegramChannel();
      toast.message("Подпишитесь на канал и вернитесь сюда, чтобы открыть доступ.");
      return;
    }

    const previousParticipant = readStoredParticipant(party.id);
    const previousInputName = inputName;
    const previousCurrentUser = currentUser;
    const previousCurrentUserId = currentUserId;
    const previousGuests = guests;
    const previousIsObserver = isObserver;
    const previousJoinLimitReached = joinLimitReached;
    const previousPendingJoinName = pendingJoinName;
    const previousHasNotifiedOrganizer = hasNotifiedOrganizer;
    const previousShowJoinModal = showJoinModal;

    setIsActivatingTelegramAccess(true);

    try {
      const subscriptionResult = await withTimeout(
        activatePartyPassAction(currentParty.id),
        SUPABASE_TIMEOUT_MS,
        "Не удалось открыть доступ",
      );
      if (!subscriptionResult.success) throw new Error(subscriptionResult.error);

      if (inputName.trim() && !currentUser) {
        const name = inputName.trim();
        const { data: { session } } = await supabase.auth.getSession();
        const userId = getAuthenticatedParticipantId() || session?.user?.id?.trim() || generateSafeUserId();
        if (session?.user && !authUser) setAuthUser(session.user);

        const joinResult = await withTimeout(
          joinPartyAction(party.id, name, userId),
          SUPABASE_TIMEOUT_MS,
          "Не удалось завершить вход после подписки",
        );

        if (!joinResult.success) {
          throw new Error(joinResult.error === "PAYWALL_REACHED" ? "Доступ еще не активирован" : joinResult.error);
        }

        completeJoin(name, joinResult.userId, joinResult.guestData);
      }

      setCurrentParty((prev) => ({ ...prev, is_paid: true }));
      void trackEvent("telegram_subscription_access_success");
      setShowPaywall(false);
      toast.success("Доступ открыт. Спасибо за подписку!");
    } catch (error) {
      console.error(error);
      writeStoredParticipant(party.id, previousParticipant);
      setInputName(previousInputName);
      setCurrentUser(previousCurrentUser);
      setCurrentUserId(previousCurrentUserId);
      setGuests(previousGuests);
      setIsObserver(previousIsObserver);
      setJoinLimitReached(previousJoinLimitReached);
      setPendingJoinName(previousPendingJoinName);
      setHasNotifiedOrganizer(previousHasNotifiedOrganizer);
      setShowJoinModal(previousShowJoinModal);
      window.alert(getMutationAlertMessage(error));
    } finally {
      setIsActivatingTelegramAccess(false);
    }
  };

  const handleCloseWelcomeOnboarding = () => {
    safeStorageSetItem(getOnboardingStorageKey(party.id), "true");
    setShowWelcomeOnboarding(false);
  };

  const handleAuth = async () => {
    if (!authUsername.trim() || authPassword.length < 6) {
      toast.error("Введите логин и пароль (мин. 6 символов)");
      return;
    }

    const safeUsername = authUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (safeUsername.length < 4) {
      toast.error("Логин: только a-z, 0-9, _ (мин. 4 символа)");
      return;
    }

    setAuthLoading(true);
    const dummyEmail = `${safeUsername}@smartcook.app`;

    try {
      const authResult =
        authMode === "register"
          ? await supabase.auth.signUp({
              email: dummyEmail,
              password: authPassword,
              options: { data: { full_name: authUsername.trim(), username: safeUsername } },
            })
          : await supabase.auth.signInWithPassword({ email: dummyEmail, password: authPassword });

      if (authResult.error) {
        if (authResult.error.message.includes("already registered") || authResult.error.message.includes("User already exists")) {
          toast.error("Этот Username уже занят! Выберите другой или войдите.");
          return;
        }

        if (authResult.error.message.includes("Invalid login credentials")) {
          toast.error("Неверный Username или пароль!");
          return;
        }

        throw authResult.error;
      }

      const nextAuthUser = authResult.data.user;
      if (!nextAuthUser?.id) throw new Error("Не удалось получить пользователя после входа");

      setAuthUser(nextAuthUser);
      setIsAuthModalOpen(false);
      toast.success("Комната сохранена в аккаунте");

      if (currentUser?.trim()) {
        const joinResult = await withTimeout(
          joinPartyAction(party.id, currentUser.trim(), nextAuthUser.id),
          SUPABASE_TIMEOUT_MS,
          "Не удалось обновить участника после входа",
        );

        if (joinResult.success) {
          completeJoin(currentUser.trim(), joinResult.userId, joinResult.guestData);
        }
      }

      if (safeStorageGetItem(getPartyAdminStorageKey(party.id)) === "true") {
        const bindResult = await bindPartyHostAction(party.id, nextAuthUser.id);
        if (!bindResult.success) throw new Error(bindResult.error);
        setCurrentParty((prev) => ({ ...prev, host_id: nextAuthUser.id }));
      }

      // Прочие банкеты/участия с этого устройства — тоже привязать к аккаунту.
      await claimGuestPartiesToAccount();
    } catch (error) {
      console.error(error);
      toast.error(getMutationAlertMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleNotifyOrganizer = async () => {
    if (isNotifyingOrganizer || hasNotifiedOrganizer) return;

    setIsNotifyingOrganizer(true);
    setNotifyOrganizerError("");

    try {
      const guestName = pendingJoinName || inputName.trim() || "Гость";
      const result = await withTimeout(
        sendPaywallChatAlertAction(party.id, guestName),
        SUPABASE_TIMEOUT_MS,
        "Не удалось отправить сообщение в чат",
      );

      if (!result.success) throw new Error(result.error);
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      setHasNotifiedOrganizer(true);
    } catch (error) {
      console.error(error);
      setNotifyOrganizerError(
        "Не удалось отправить сообщение в чат. Проверьте интернет и попробуйте ещё раз.",
      );
    } finally {
      setIsNotifyingOrganizer(false);
    }
  };

  const handleCancelJoinLimit = () => {
    writeStoredParticipant(party.id, null);
    setCurrentUser(null);
    setCurrentUserId(null);
    setIsObserver(false);
    setInputName("");
    setJoinLimitReached(false);
    setPendingJoinName("");
    setHasNotifiedOrganizer(false);
    setNotifyOrganizerError("");
    setShowPaywall(false);
    setShowJoinModal(true);
  };

  const sendMessage = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser || !currentUserId || isSendingMessage) return;

    const text = newMessage.trim();
    setNewMessage("");

    await runWriteMutation({
      setLoading: setIsSendingMessage,
      mutate: async () => {
        const { error } = await withTimeout(
          supabase
            .from("party_messages")
            .insert([{ party_id: party.id, user_id: currentUserId, user_name: currentUser, text }]),
          SUPABASE_TIMEOUT_MS,
          "Не удалось отправить сообщение",
        );

        if (error) throw error;
      },
      rollback: () => {
        setNewMessage(text);
      },
    });
  };

  const sendChatPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || isSendingMessage) return;
    if (!currentUser || !currentUserId) {
      toast.error("Сначала укажите ваше имя");
      return;
    }

    // HEIC с камеры Android часто приходит с пустым/неверным mime — его нельзя
    // отсеять по file.type, иначе валидное фото отклоняется. Пропускаем всё, что
    // image/* ИЛИ распознано как HEIC по имени (декод/сжатие сделает preparePhoto).
    if (!file.type.startsWith("image/") && !isHeic(file)) {
      toast.error("Можно отправлять только фото");
      return;
    }

    if (file.size > CHAT_PHOTO_MAX_BYTES) {
      toast.error("Фото слишком большое. Максимум 8 МБ");
      return;
    }

    await runWriteMutation({
      setLoading: setIsSendingMessage,
      mutate: async () => {
        // Прогоняем через общий пайплайн (декод HEIC на сервере + сжатие/ресайз +
        // очистка EXIF) ДО отправки — раньше в чат уходил сырой файл, из-за чего
        // HEIC с Android падал 422 на libheif, а гео из EXIF утекало (#3).
        let prepared: File;
        try {
          prepared = await preparePhoto(
            file,
            { maxSizeMB: 2, maxWidthOrHeight: 1920, useWebWorker: true },
            `chat_${Date.now()}.jpg`,
          );
        } catch (error) {
          void reportPhotoError("banquet-chat-photo", file, error);
          throw new Error("Не удалось обработать фото");
        }

        const localPhotoUrl = URL.createObjectURL(prepared);
        const formData = new FormData();
        formData.append("partyId", party.id);
        formData.append("userId", currentUserId);
        formData.append("userName", currentUser);
        formData.append("file", prepared);

        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), CHAT_PHOTO_UPLOAD_TIMEOUT_MS);

        try {
          const response = await fetch("/api/party/chat-photo", {
            method: "POST",
            body: formData,
            signal: controller.signal,
          });
          const result = (await response.json().catch(() => null)) as {
            error?: string;
            message?: PartyMessage;
          } | null;

          if (!response.ok) {
            throw new Error(result?.error || "Не удалось отправить фото");
          }

          if (!result?.message) {
            throw new Error("Фото сохранено, но сервер не вернул сообщение");
          }

          const sentMessage: PartyMessage = { ...result.message, local_photo_url: localPhotoUrl };
          setMessages((prev) => {
            const existingIndex = prev.findIndex((message) => message.id && message.id === sentMessage.id);
            if (existingIndex >= 0) {
              return sortPartyMessages(
                prev.map((message, index) =>
                  index === existingIndex ? { ...sentMessage, local_photo_url: message.local_photo_url ?? localPhotoUrl } : message,
                ),
              );
            }
            return sortPartyMessages([...prev, sentMessage]);
          });
          window.setTimeout(() => URL.revokeObjectURL(localPhotoUrl), 120000);
        } catch (error) {
          URL.revokeObjectURL(localPhotoUrl);
          // Логируем тихую ветку загрузки: таймаут — отдельным шагом *-timeout,
          // остальное — banquet-chat-photo. Раньше сбой уходил только в тост.
          void reportPhotoError(
            isAbortError(error) ? "banquet-chat-photo-timeout" : "banquet-chat-photo",
            prepared,
            error,
          );
          if (isAbortError(error)) {
            throw new Error("Не удалось отправить фото: превышено время ожидания (30 сек)");
          }
          throw error;
        } finally {
          window.clearTimeout(timeoutId);
        }
      },
    });
  };

  const handleMessageInputChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(event.target.value);
    resizeMessageInput(event.target);
  };

  const handleMessageInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    if (!newMessage.trim() || !currentUserId || isSendingMessage) return;

    event.currentTarget.form?.requestSubmit();
  };

  const updateRoomSettings = async () => {
    if (!isHost || isSavingRoomSettings) return;

    const nextTitle = roomTitleInput.trim();
    const nextDescription = roomDescriptionInput.trim();

    if (!nextTitle) {
      window.alert("Название банкета не может быть пустым.");
      return;
    }

    const previousParty = currentParty;
    const nextParty = {
      ...currentParty,
      title: nextTitle,
      description: nextDescription || null,
      theme: nextDescription || null,
    };

    setCurrentParty(nextParty);

    await runWriteMutation({
      setLoading: setIsSavingRoomSettings,
      mutate: async () => {
        if (!roomHostId) {
          throw new Error("Только организатор может менять настройки банкета");
        }

        const result = await updatePartyRoomSettingsAction(currentParty.id, roomHostId, nextTitle, nextDescription);

        if (!result.success) {
          throw new Error(result.error || "Не удалось сохранить настройки комнаты");
        }
      },
      rollback: () => {
        setCurrentParty(previousParty);
        setRoomTitleInput(previousParty.title);
        setRoomDescriptionInput(getRoomDescription(previousParty));
      },
    });
  };

  const handleShare = async () => {
    reachGoal("share_banquet_invite");
    const shareData = {
      title: currentParty.title,
      text: `Присоединяйся к банкету «${currentParty.title}»`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (isAbortError(error)) return;
      }
    }

    try {
      await copyTextToClipboard(shareData.url);
      toast.success("Ссылка скопирована");
    } catch {
      const copied = await copyTextToClipboard(shareData.url).catch(() => false);
      if (copied) {
        toast.success("Ссылка скопирована");
      } else {
        window.alert("Не удалось скопировать ссылку. Скопируйте адрес из строки браузера.");
      }
    }
  };

  const startGenerateMenu = async (config: AiConfig) => {
    if (generationInProgress) return;

    let timeoutId: number | undefined;

    try {
      setShowAiConfigurator(false);
      menuItemsRef.current = [];
      setMenuItems([]);
      setIsGenerating(true);
      setCurrentParty((prev) => ({ ...prev, is_generating: true }));
      const controller = new AbortController();
      timeoutId = window.setTimeout(() => controller.abort(), GENERATE_MENU_TIMEOUT_MS);
      const normalizedConfig: AiConfig = {
        promptTitle: config.promptTitle.trim(),
        promptDescription: config.promptDescription.trim(),
        categories: config.categories.map((category) => category.trim()).filter(Boolean),
        tags: config.tags,
        budget: config.budget.trim(),
        mustHave: config.mustHave.trim(),
        mustNotHave: config.mustNotHave.trim(),
      };

      const { data: { session: aiSession } } = await supabase.auth.getSession();
      const res = await fetch('/api/party/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(aiSession?.access_token ? { Authorization: `Bearer ${aiSession.access_token}` } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({ 
          roomId: party.id,
          title: normalizedConfig.promptTitle,
          description: normalizedConfig.promptDescription,
          categories: normalizedConfig.categories,
          tags: normalizedConfig.tags,
          budget: normalizedConfig.budget,
          mustHave: normalizedConfig.mustHave,
          mustNotHave: normalizedConfig.mustNotHave,
          guestCount: currentParty.guest_count || 4,
        })
      });
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
      
      const response = await res.json().catch(() => null);
      if (!res.ok || !response?.success) {
        if (res.status === 504) {
          toast.error("Время ожидания истекло или сервер перегружен.");
          await refreshMenuItems();
          return;
        }

        toast.error(response?.error || `Ошибка сервера (${res.status}). Сервер перегружен, попробуйте еще раз.`);
        await refreshMenuItems();
        return;
      }

      await refreshMenuItems();
      void trackEvent("ai_menu_generated_success");
    } catch (error: unknown) {
      console.error("AI menu generation failed:", error);
      await refreshMenuItems();
      toast.error(isAbortError(error) ? "Время ожидания истекло или сервер перегружен." : getErrorMessage(error));
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
      setIsGenerating(false);
      setCurrentParty((prev) => ({ ...prev, is_generating: false }));
    }
  };

  const handleGenerateMenu = () => {
    if (generationInProgress) return;

    if (menuItemsRef.current.length > 0) {
      setShowRegenerateConfirm(true);
      return;
    }

    setShowAiConfigurator(true);
  };

  const handleConfirmRegenerateMenu = () => {
    setShowRegenerateConfirm(false);
    setShowAiConfigurator(true);
  };

  const handleStartConfiguredGeneration = () => {
    if (!aiConfig.promptTitle.trim() || aiConfig.categories.length === 0 || generationInProgress) return;
    void startGenerateMenu(aiConfig);
  };

  const toggleAiConfigCategory = (category: string) => {
    setAiConfig((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((item) => item !== category)
        : [...prev.categories, category],
    }));
  };

  const handleAddCustomAiConfigCategory = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    const nextCategory = customAiCategoryInput.trim();
    if (!nextCategory) return;

    setAiConfig((prev) => ({
      ...prev,
      categories: prev.categories.includes(nextCategory) ? prev.categories : [...prev.categories, nextCategory],
    }));
    setCustomAiCategoryInput("");
  };

  const toggleAiConfigTag = (tag: string) => {
    setAiConfig((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((item) => item !== tag) : [...prev.tags, tag],
    }));
  };

  const handleAddCustomAiConfigTag = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    const nextTag = customAiTagInput.trim();
    if (!nextTag) return;

    setAiConfig((prev) => ({
      ...prev,
      tags: prev.tags.includes(nextTag) ? prev.tags : [...prev.tags, nextTag],
    }));
    setCustomAiTagInput("");
  };

  const handleResetAiConfig = () => {
    setAiConfig(getDefaultAiConfig(currentParty));
    setCustomAiCategoryInput("");
    setCustomAiTagInput("");
    setIsResetModalOpen(false);
  };

  const renderMenuPanel = () => {
    const hasMenuItems = menuItems.length > 0;
    const nonEmptyGroups = groupedItems.filter(({ items }) => items.length > 0);

    return (
      <section className="space-y-5 px-4 pb-32 pt-4">
        {generationInProgress && (
          <div className="animate-in fade-in slide-in-from-top-4 rounded-3xl border border-white/70 bg-white/80 p-5 text-center shadow-sm backdrop-blur duration-500">
            <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-zinc-500" />
            <h3 className="mb-1 text-lg font-semibold text-gray-900">Меню уже готовится</h3>
            <p className="mb-4 text-sm leading-6 text-gray-500">
              Нейросеть подбирает лучшие блюда. Пока вы ждете, пригласите друзей — они смогут добавлять свои идеи.
            </p>
            <button
              type="button"
              onClick={handleShare}
              className="w-full rounded-2xl border border-gray-200 bg-white px-6 py-3 font-medium text-black shadow-sm transition-colors hover:bg-gray-50"
            >
              Поделиться ссылкой
            </button>
          </div>
        )}

        {!hasMenuItems ? (
          <div className="flex min-h-[calc(100dvh-220px)] items-center justify-center">
            <div className="w-full rounded-[32px] border border-white/70 bg-white/85 p-6 text-center shadow-sm backdrop-blur">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 shadow-inner">
                <UtensilsCrossed className="h-9 w-9" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">Стол пока пуст</h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-gray-500">
                Сгенерируйте идеальное меню с помощью ИИ или добавьте любимые блюда вручную.
              </p>
              <div className="mt-7 space-y-3">
                <button
                  type="button"
                  onClick={handleGenerateMenu}
                  disabled={generationInProgress}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-zinc-900 to-black px-5 py-4 font-bold text-white shadow-xl shadow-black/15 transition hover:scale-[1.01] hover:shadow-black/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generationInProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {generationInProgress ? "Шеф-повар думает..." : "Сгенерировать меню ✨"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddDishModal(true)}
                  disabled={!currentUserId || isAddingDish}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-4 font-semibold text-gray-900 shadow-sm transition hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isAddingDish ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Добавить вручную
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3 rounded-3xl border border-white/70 bg-white/80 p-3 shadow-sm backdrop-blur sm:grid-cols-2">
              <button
                type="button"
                onClick={handleGenerateMenu}
                disabled={generationInProgress}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generationInProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generationInProgress ? "Готовим..." : "Сгенерировать ИИ"}
              </button>
              <button
                type="button"
                onClick={() => setShowAddDishModal(true)}
                disabled={!currentUserId || isAddingDish}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 font-semibold text-gray-900 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAddingDish ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Добавить вручную
              </button>
            </div>

            {nonEmptyGroups.map(({ category, items }) => (
              <section key={category}>
                <h2 className="mt-6 mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">{category}</h2>
                <div className="space-y-3">
                  {items.map((item) => {
                    const isLiked = hasCurrentUserVoted(item.votes);

                    return (
                      <article
                        key={item.id ?? `${category}-${item.name}`}
                        className="rounded-2xl border border-gray-50 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-gray-900">{item.name}</h3>
                            <p className="mt-1 line-clamp-2 text-sm leading-6 text-gray-500">
                              {getMenuItemDescription(item)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleVote(item.id)}
                            disabled={!currentUserId || votingItemId === item.id}
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
                              isLiked ? "bg-red-50 text-red-500" : "bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            }`}
                            aria-label={isLiked ? "Убрать лайк" : "Поставить лайк"}
                          >
                            <Heart className={`h-4 w-4 ${isLiked ? "fill-current" : ""}`} />
                            <span>{item.votes?.length || 0}</span>
                            {votingItemId === item.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        )}

        {hasMenuItems && (
          <>
            <button
              type="button"
              onClick={() => {
                if (currentParty.is_paid) {
                  setShowShoppingList(true);
                  void trackEvent("shopping_list_opened");
                } else {
                  setShowPaywall(true);
                  void trackEvent("telegram_access_view_from_cart");
                }
              }}
              className="w-full bg-white text-black font-medium p-4 rounded-3xl flex items-center justify-center gap-2 shadow-sm border border-black/5 active:scale-95 transition-transform"
            >
              <span>🛒</span> {currentParty.is_paid ? "Показать список покупок" : "Открыть список покупок через канал"}
            </button>

            <div className="mt-6 border-t border-zinc-100 pt-6">
              {/* Единый механизм этапа 6: /api/report-error → error_reports,
                  автоконтекст (url/UA/display_mode/viewport) собирается кодом. */}
              <ReportError
                trigger={(open) => (
                  <button
                    type="button"
                    onClick={open}
                    className="flex w-full items-center justify-center gap-2 rounded-3xl bg-zinc-50 p-4 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100"
                  >
                    💬 Сообщить о проблеме
                  </button>
                )}
              />
            </div>
          </>
        )}
    </section>
    );
  };

  const renderChatPanel = () => (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-white">
      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto overscroll-contain p-4">
        {messages.length === 0 ? (
          <div className="flex min-h-full items-center justify-center text-center text-sm text-zinc-400">
            Пока сообщений нет
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => {
              const author = getMessageAuthor(message);
              const isOwn = currentParticipantIdentity ? getMessageIdentity(message) === currentParticipantIdentity : false;
              const chatPhotoUrl = getChatPhotoUrl(message.text);
              const chatPhotoDisplayUrl = message.local_photo_url ?? chatPhotoUrl;
              const chatPhotoSrc = chatPhotoDisplayUrl ? getChatPhotoDisplaySrc(chatPhotoDisplayUrl) : null;

              return (
                <div
                  key={message.id ?? `${message.created_at}-${index}`}
                  className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                >
                  <div className={`flex max-w-[85%] flex-col ${isOwn ? "items-end" : "items-start"}`}>
                    <span className="mb-1 px-1 text-xs text-zinc-400">{isOwn ? "Вы" : author || "Гость"}</span>
                    <div
                      className={`rounded-[24px] ${
                        chatPhotoDisplayUrl ? "w-64 max-w-[70vw] overflow-hidden bg-zinc-100 p-1 text-zinc-500" : "px-4 py-3"
                      } ${!chatPhotoDisplayUrl && isOwn ? "bg-black text-white" : "bg-zinc-100 text-black"
                      }`}
                    >
                      {chatPhotoDisplayUrl && chatPhotoSrc ? (
                        <button
                          type="button"
                          onClick={() => setExpandedChatPhoto(chatPhotoSrc)}
                          className="block w-full cursor-zoom-in text-left"
                          aria-label="Открыть фото"
                        >
                          <img
                            src={chatPhotoSrc}
                            alt="Фото из чата"
                            loading="eager"
                            decoding="sync"
                            className="aspect-[4/3] w-full rounded-[20px] object-cover"
                          />
                        </button>
                      ) : (
                        <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.text}</p>
                      )}
                      <div className={`mt-2 text-[11px] ${isOwn ? "text-zinc-300" : "text-zinc-400"}`}>
                        {formatTime(message.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="sticky bottom-0 z-10 mt-auto shrink-0 border-t border-zinc-100 bg-white/95 p-4 backdrop-blur-xl">
        <div className="flex items-end gap-3">
          <input
            ref={chatAttachmentInputRef}
            type="file"
            id="chat-attachment"
            accept="image/*"
            className="hidden"
            disabled={!currentUserId}
            onChange={sendChatPhoto}
          />
          <button
            type="button"
            onClick={() => chatAttachmentInputRef.current?.click()}
            disabled={!currentUserId || isSendingMessage}
            className={`inline-flex h-12 w-10 shrink-0 items-center justify-center text-gray-400 transition-colors hover:text-gray-600 ${
              !currentUserId || isSendingMessage ? "cursor-not-allowed opacity-50" : ""
            }`}
            aria-disabled={!currentUserId}
            aria-label="Прикрепить файл"
          >
            {isSendingMessage ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
          </button>
          <textarea
            ref={messageInputRef}
            rows={1}
            value={newMessage}
            onChange={handleMessageInputChange}
            onKeyDown={handleMessageInputKeyDown}
            placeholder={
              currentUser
                ? "Написать сообщение..."
                : isObserver
                  ? "Режим наблюдателя: чат доступен после подписки на канал"
                  : "Сначала укажите ваше имя"
            }
            disabled={!currentUserId}
            className="max-h-[120px] min-h-12 flex-1 resize-none overflow-hidden rounded-2xl bg-zinc-100 px-4 py-3 text-sm leading-6 text-black outline-none transition focus:bg-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-400"
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || !currentUserId || isSendingMessage}
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSendingMessage ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizonal className="h-4 w-4" />
            )}
          </button>
        </div>
      </form>
    </section>
  );

  console.log("DEBUG ROLE:", {
    currentUserId: currentViewerId,
    roomHostId,
    isHost: currentViewerId === roomHostId,
  });

  return (
    <div className="flex h-[100dvh] overflow-hidden flex-col bg-[#F5F5F7] text-black">
      <header className="sticky top-0 z-40 shrink-0 border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => router.push("/parties")}
              className="inline-flex min-w-[76px] items-center gap-1 text-sm font-medium text-black transition hover:text-zinc-600"
            >
              <span aria-hidden="true">‹</span>
              Назад
            </button>

            <button
              type="button"
              onClick={() => setShowRoomInfo(true)}
              className="min-w-0 flex-1 cursor-pointer rounded-2xl px-2 py-1 text-center transition-opacity hover:bg-zinc-50 active:opacity-70"
              aria-label={`Открыть информацию о банкете: ${currentParty.title}, ${roomParticipantsLabel}`}
            >
              <h1 className="truncate text-lg font-bold leading-tight tracking-tight text-black">{currentParty.title}</h1>
              <p className="truncate text-xs font-medium leading-4 text-gray-500">{roomParticipantsLabel}</p>
            </button>

            {/* Компактный доступ к «Сообщить об ошибке» в комнате (полного
                футера здесь нет, задача D). Открывает ту же единую форму. */}
            <ReportError
              trigger={(open) => (
                <button
                  type="button"
                  onClick={open}
                  aria-label="Сообщить об ошибке"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700"
                >
                  <Bug className="h-4 w-4" />
                </button>
              )}
            />

            <button
              type="button"
              onClick={handleShare}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              <Share2 className="h-4 w-4" />
              <span>Позвать</span>
            </button>
          </div>
        </div>
      </header>

      <main
        className={`mx-auto min-h-0 flex-1 w-full max-w-3xl ${
          activeTab === "chat" ? "flex flex-col overflow-hidden" : "overflow-y-auto pt-4 pb-28"
        }`}
      >
        {activeTab === "menu" ? (
          <>
            {!authUser && (
              <div className="px-4">
                <BanquetAccountBanner
                  variant={isHost ? "creator" : "guest"}
                  onSignup={() => {
                    setAuthMode("register");
                    setIsAuthModalOpen(true);
                  }}
                />
              </div>
            )}
            {isObserver && (
              <div className="px-4">
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm">
                  <p className="text-sm font-semibold tracking-tight text-black">Режим наблюдателя</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">
                    Вы можете смотреть меню и чат. Голосование и сообщения откроются после подписки на канал.
                  </p>
                </div>
              </div>
            )}
            {renderMenuPanel()}
          </>
        ) : (
          renderChatPanel()
        )}
      </main>

      <nav className="z-40 w-full shrink-0 border-t border-gray-200 bg-white/90 backdrop-blur-lg">
        <div className="mx-auto grid max-w-3xl grid-cols-2 px-6 pb-safe pt-2">
          <button
            type="button"
            onClick={() => setActiveTab("menu")}
            className={`flex flex-col items-center justify-center gap-1 rounded-2xl py-2 text-xs font-semibold transition ${
              activeTab === "menu" ? "text-black" : "text-gray-400"
            }`}
          >
            <UtensilsCrossed className="h-5 w-5" />
            <span>Меню</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`flex flex-col items-center justify-center gap-1 rounded-2xl py-2 text-xs font-semibold transition ${
              activeTab === "chat" ? "text-black" : "text-gray-400"
            }`}
          >
            <MessageCircle className="h-5 w-5" />
            <span>Чат</span>
          </button>
        </div>
      </nav>

      <FullScreenImage imageUrl={expandedChatPhoto} onClose={() => setExpandedChatPhoto(null)} />

      {showWelcomeOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/40">
          <div className="max-h-[85dvh] w-full max-w-md animate-in zoom-in-95 overflow-y-auto rounded-3xl border border-white/60 bg-white p-6 shadow-2xl">
            <div className="mb-6 text-center">
              <div className="mb-3 text-5xl">🍽️</div>
              <h2 className="text-3xl font-black tracking-tight text-black">Добро пожаловать в банкет!</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-500">Вот как выжать максимум из комнаты.</p>
            </div>

            <div className="space-y-3">
              {[
                {
                  icon: "✨",
                  title: "Магия ИИ",
                  text: "Нажми «Сгенерировать меню», расскажи про аллергии, и нейросеть накроет на стол.",
                },
                {
                  icon: "👯",
                  title: "Зови друзей",
                  text: "Отправьте ссылку родным и гостям — они смогут отмечать любимые блюда и добавлять свои.",
                },
                {
                  icon: "✍️",
                  title: "Ручной контроль",
                  text: "ИИ — это круто, но мамин рецепт оливье никто не отменял. Добавляй свои блюда вручную!",
                },
              ].map((item) => (
                <div key={item.title} className="flex gap-3 rounded-3xl bg-zinc-50 p-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-black">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-zinc-500">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="sticky bottom-0 bg-white pt-4">
              <button
                type="button"
                onClick={handleCloseWelcomeOnboarding}
                className="w-full rounded-2xl bg-gradient-to-br from-zinc-900 to-black px-5 py-4 text-base font-bold text-white shadow-lg shadow-black/20 transition active:scale-[0.99]"
              >
                Понял-принял, погнали! 🚀
              </button>
            </div>
          </div>
        </div>
      )}

      {showRoomInfo && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-md sm:items-center">
          <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-black/5 bg-white p-6 shadow-2xl sm:rounded-3xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">О банкете</p>
                <h2 className="truncate text-2xl font-semibold tracking-tight text-black">{currentParty.title}</h2>
                {roomDescription && <p className="mt-2 text-sm leading-6 text-zinc-500">{roomDescription}</p>}
              </div>
              <button
                type="button"
                onClick={() => setShowRoomInfo(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-black"
                aria-label="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">Участники</h3>
              {visibleGuests.length > 0 ? (
                <div className="space-y-2">
                  {visibleGuests.map((guest) => {
                    const guestName = getGuestName(guest);

                    return (
                      <div key={getGuestIdentity(guest)} className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-zinc-700 shadow-sm">
                          {guestName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold text-black">{guestName}</span>
                            {guest.user_id?.trim() === roomHostId && (
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                👑 Организатор
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500">Пока никто не присоединился.</div>
              )}
            </section>

            {isHost && (
              <section className="mt-6 border-t border-zinc-100 pt-5">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Настройки комнаты
                </h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={roomTitleInput}
                    onChange={(event) => setRoomTitleInput(event.target.value)}
                    placeholder="Название банкета"
                    className="w-full rounded-2xl bg-zinc-100 px-4 py-3 text-base text-black outline-none transition focus:bg-zinc-200"
                  />
                  <textarea
                    value={roomDescriptionInput}
                    onChange={(event) => setRoomDescriptionInput(event.target.value)}
                    placeholder="Описание банкета"
                    rows={4}
                    className="w-full resize-none rounded-2xl bg-zinc-100 px-4 py-3 text-base text-black outline-none transition focus:bg-zinc-200"
                  />
                  <button
                    type="button"
                    onClick={updateRoomSettings}
                    disabled={!roomTitleInput.trim() || isSavingRoomSettings}
                    aria-busy={isSavingRoomSettings}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 text-base font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSavingRoomSettings ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Сохраняем...
                      </>
                    ) : (
                      "Сохранить изменения"
                    )}
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-8 shadow-sm">
            {joinLimitReached ? (
              <div className="space-y-5">
                <div className="rounded-[28px] border border-zinc-100 bg-gradient-to-b from-white to-zinc-50 p-5 text-center shadow-sm">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-black text-3xl shadow-xl shadow-black/15">
                    🥂
                  </div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-400">
                    Бесплатный лимит
                  </p>
                  <h2 className="text-3xl font-semibold tracking-tight text-black">Мест больше нет</h2>
                  <p className="mt-3 text-sm leading-6 text-zinc-500">
                    Чтобы открыть вход, подпишитесь на Telegram-канал {TELEGRAM_CHANNEL_NAME}. После
                    подтверждения безлимит гостей, чат и голосование станут доступны всем участникам банкета.
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleOpenTelegramChannel}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 text-base font-semibold text-white shadow-xl shadow-black/15 transition hover:bg-zinc-900 active:scale-[0.99]"
                  >
                    Открыть канал {TELEGRAM_CHANNEL_NAME}
                  </button>
                  <button
                    type="button"
                    onClick={handleActivateTelegramAccess}
                    disabled={isActivatingTelegramAccess}
                    aria-busy={isActivatingTelegramAccess}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-black/5 bg-zinc-100 px-5 py-4 text-base font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isActivatingTelegramAccess ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Открываем доступ...
                      </>
                    ) : (
                      "Я подписался, открыть доступ"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleNotifyOrganizer}
                    disabled={isNotifyingOrganizer || hasNotifiedOrganizer}
                    aria-busy={isNotifyingOrganizer}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-base font-medium text-black ring-1 ring-black/5 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {hasNotifiedOrganizer ? (
                      "Уведомление отправлено ✅"
                    ) : isNotifyingOrganizer ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Отправляем...
                      </>
                    ) : (
                      "Уведомить организатора"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelJoinLimit}
                    className="w-full rounded-2xl border border-black/5 bg-white px-5 py-4 text-base font-medium text-black transition hover:bg-zinc-50"
                  >
                    Назад к вводу имени
                  </button>
                </div>

                {hasNotifiedOrganizer && (
                  <p className="text-center text-sm leading-6 text-zinc-500">
                    Сообщение отправлено в общий чат. Участники увидят, что вам нужен доступ через канал.
                  </p>
                )}
                {notifyOrganizerError && (
                  <p className="rounded-2xl bg-red-50 px-4 py-3 text-center text-sm leading-6 text-red-600">
                    {notifyOrganizerError}
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
                      setNotifyOrganizerError("");
                    }}
                    placeholder="Введите ваше имя"
                    className="w-full rounded-2xl bg-zinc-100 px-5 py-4 text-base text-black outline-none transition focus:bg-zinc-200"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!inputName.trim() || isJoining}
                    aria-busy={isJoining}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-200 px-5 py-4 text-base font-medium text-black transition hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isJoining ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Подключаем...
                      </>
                    ) : (
                      "Присоединиться"
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {showAddDishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <form
            onSubmit={handleAddCustomDish}
            className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200"
          >
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
                  type="button"
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
                type="button"
                onClick={handleCloseAddDishModal}
                disabled={isAddingDish}
                className="flex-1 bg-zinc-100 text-black font-medium p-4 rounded-xl hover:bg-zinc-200 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={!newDishName.trim() || isAddingDish}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-black p-4 font-medium text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAddingDish ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Добавляем...
                  </>
                ) : (
                  "Добавить"
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {showRegenerateConfirm && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="regenerate-menu-title"
          aria-describedby="regenerate-menu-description"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm animate-in zoom-in-95 rounded-3xl bg-white p-6 shadow-2xl duration-200">
            <h2 id="regenerate-menu-title" className="mb-2 text-xl font-bold text-black">Собрать меню заново?</h2>
            <p id="regenerate-menu-description" className="mb-6 text-sm leading-6 text-zinc-500">
              Блюда, добавленные вручную, останутся. Блюда от ИИ будут заменены новыми.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowRegenerateConfirm(false)}
                className="flex-1 rounded-xl bg-zinc-100 p-4 font-medium text-black transition-colors hover:bg-zinc-200"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmRegenerateMenu}
                disabled={generationInProgress}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-black p-4 font-medium text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generationInProgress ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Создаем...
                  </>
                ) : (
                  "Пересобрать меню"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAiConfigurator && (
        <div className="fixed inset-0 z-50 h-[100dvh] w-full overflow-y-auto bg-gray-50">
          <div className="flex min-h-[100dvh] w-full flex-col">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-black/5 bg-white/90 px-5 py-4 backdrop-blur-md sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">ИИ-КОНФИГУРАТОР</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-black">Настройки генерации меню</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(true)}
                  className="rounded-full px-3 py-2 text-sm font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
                >
                  Сбросить
                </button>
                <button
                  type="button"
                  onClick={() => setShowAiConfigurator(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-black"
                  aria-label="Закрыть настройки генерации меню"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mx-auto w-full max-w-2xl flex-1 space-y-5 px-5 py-5 sm:px-6">
              <section className="rounded-3xl border border-black/5 bg-white/70 p-4 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-base font-semibold text-black">База</h3>
                  <p className="mt-1 text-sm text-zinc-500">Обязательный минимум для точного меню.</p>
                </div>
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-zinc-700">Название</span>
                    <input
                      type="text"
                      value={aiConfig.promptTitle}
                      onChange={(event) => setAiConfig((prev) => ({ ...prev, promptTitle: event.target.value }))}
                      placeholder="Например: День рождения в итальянском стиле"
                      className="w-full rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3 text-base text-black outline-none transition focus:border-black focus:ring-4 focus:ring-black/10"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-zinc-700">Описание</span>
                    <textarea
                      value={aiConfig.promptDescription}
                      onChange={(event) =>
                        setAiConfig((prev) => ({ ...prev, promptDescription: event.target.value }))
                      }
                      placeholder="Опишите атмосферу, повод, формат подачи или вкусовые ожидания"
                      rows={4}
                      className="w-full resize-none rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3 text-base text-black outline-none transition focus:border-black focus:ring-4 focus:ring-black/10"
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-3xl border border-black/5 bg-white/70 p-4 shadow-sm">
                <h3 className="mb-3 text-base font-semibold text-black">Что в меню?</h3>
                <div className="flex flex-wrap gap-2">
                  {[
                    ...AI_CONFIG_CATEGORY_OPTIONS,
                    ...aiConfig.categories.filter(
                      (category) => !AI_CONFIG_CATEGORY_OPTIONS.includes(category as typeof AI_CONFIG_CATEGORY_OPTIONS[number]),
                    ),
                  ].map((category) => {
                    const isActive = aiConfig.categories.includes(category);

                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => toggleAiConfigCategory(category)}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 active:scale-95 ${
                          isActive
                            ? "border-black bg-black text-white shadow-lg shadow-black/10"
                            : "border-zinc-200 bg-white/80 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
                        }`}
                      >
                        {category}
                      </button>
                    );
                  })}
                  <form onSubmit={handleAddCustomAiConfigCategory} className="flex min-w-[190px] flex-1 items-center gap-2">
                    <input
                      type="text"
                      value={customAiCategoryInput}
                      onChange={(event) => setCustomAiCategoryInput(event.target.value)}
                      placeholder="Свой вариант..."
                      className="min-w-0 flex-1 rounded-full border border-zinc-200 bg-white/80 px-4 py-2 text-sm text-black outline-none transition focus:border-black focus:ring-4 focus:ring-black/10"
                    />
                    <button
                      type="submit"
                      disabled={!customAiCategoryInput.trim()}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-lg font-semibold leading-none text-white shadow-lg shadow-black/10 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Добавить свою категорию"
                    >
                      +
                    </button>
                  </form>
                </div>
                {aiConfig.categories.length === 0 && (
                  <p className="mt-3 text-sm text-red-500">Выберите хотя бы одну категорию, чтобы ИИ знал, что генерировать.</p>
                )}
              </section>

              <section className="rounded-3xl border border-black/5 bg-white/70 p-4 shadow-sm">
                <h3 className="mb-3 text-base font-semibold text-black">Особенности</h3>
                <div className="flex flex-wrap gap-2">
                  {[...AI_CONFIG_TAGS, ...aiConfig.tags.filter((tag) => !AI_CONFIG_TAGS.includes(tag as typeof AI_CONFIG_TAGS[number]))].map((tag) => {
                    const isActive = aiConfig.tags.includes(tag);

                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleAiConfigTag(tag)}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 active:scale-95 ${
                          isActive
                            ? "border-black bg-black text-white shadow-lg shadow-black/10"
                            : "border-zinc-200 bg-white/80 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                  <form onSubmit={handleAddCustomAiConfigTag} className="flex min-w-[190px] flex-1 items-center gap-2">
                    <input
                      type="text"
                      value={customAiTagInput}
                      onChange={(event) => setCustomAiTagInput(event.target.value)}
                      placeholder="Свой вариант..."
                      className="min-w-0 flex-1 rounded-full border border-zinc-200 bg-white/80 px-4 py-2 text-sm text-black outline-none transition focus:border-black focus:ring-4 focus:ring-black/10"
                    />
                    <button
                      type="submit"
                      disabled={!customAiTagInput.trim()}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-lg font-semibold leading-none text-white shadow-lg shadow-black/10 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Добавить свой вариант"
                    >
                      +
                    </button>
                  </form>
                </div>
              </section>

              <section className="rounded-3xl border border-black/5 bg-white/70 p-4 shadow-sm">
                <h3 className="mb-3 text-base font-semibold text-black">Жесткие фильтры</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-zinc-700">Обязательно добавить</span>
                    <input
                      type="text"
                      value={aiConfig.mustHave}
                      onChange={(event) => setAiConfig((prev) => ({ ...prev, mustHave: event.target.value }))}
                      placeholder="Например: рыба, сыр, ягоды"
                      className="w-full rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3 text-base text-black outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-zinc-700">Исключить</span>
                    <input
                      type="text"
                      value={aiConfig.mustNotHave}
                      onChange={(event) => setAiConfig((prev) => ({ ...prev, mustNotHave: event.target.value }))}
                      placeholder="Например: свинина, кинза"
                      className="w-full rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3 text-base text-black outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-500/15"
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-3xl border border-black/5 bg-white/70 p-4 shadow-sm">
                <label className="block">
                  <span className="mb-1.5 block text-base font-semibold text-black">Бюджет</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={aiConfig.budget}
                    onChange={(event) => setAiConfig((prev) => ({ ...prev, budget: event.target.value }))}
                    placeholder="Например: 5000 руб (необязательно)"
                    className="w-full rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3 text-base text-black outline-none transition focus:border-black focus:ring-4 focus:ring-black/10"
                  />
                </label>
              </section>
            </div>

            <div className="sticky bottom-0 border-t border-black/5 bg-white/90 px-5 py-4 backdrop-blur-md sm:px-6">
              <div className="mx-auto w-full max-w-2xl">
              <button
                type="button"
                onClick={handleStartConfiguredGeneration}
                disabled={!aiConfig.promptTitle.trim() || aiConfig.categories.length === 0 || generationInProgress}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-zinc-900 to-black py-4 text-base font-semibold text-white shadow-lg shadow-black/20 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {generationInProgress ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Запускаем...
                  </>
                ) : (
                  "Сгенерировать меню"
                )}
              </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isResetModalOpen && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="reset-ai-config-title"
          aria-describedby="reset-ai-config-description"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-md"
        >
          <div className="w-full max-w-sm animate-in zoom-in-95 rounded-3xl border border-white/50 bg-white p-6 shadow-2xl duration-200">
            <h2 id="reset-ai-config-title" className="mb-2 text-xl font-semibold tracking-tight text-black">
              Сбросить настройки?
            </h2>
            <p id="reset-ai-config-description" className="mb-6 text-sm leading-6 text-zinc-500">
              Все введенные предпочтения, фильтры и бюджет будут удалены. Вы уверены?
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="flex-1 rounded-xl bg-zinc-100 p-4 font-medium text-black transition-colors hover:bg-zinc-200"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleResetAiConfig}
                className="flex-1 rounded-xl bg-red-600 p-4 font-medium text-white shadow-lg shadow-red-600/20 transition hover:bg-red-700 active:scale-95"
              >
                Сбросить
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
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-md transition-all sm:items-center sm:p-4">
          <div className="w-full animate-in slide-in-from-bottom-full rounded-t-[32px] border border-white/60 bg-white p-6 shadow-2xl duration-300 sm:max-w-md sm:rounded-[32px] sm:slide-in-from-bottom-0 sm:zoom-in-95">
            <div className="mb-5 rounded-[28px] border border-zinc-100 bg-gradient-to-b from-white via-zinc-50 to-white p-5 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-black text-3xl shadow-xl shadow-black/15">
                📣
              </div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-400">Доступ через Telegram</p>
              <h2 className="text-3xl font-semibold tracking-tight text-black">Подпишитесь на {TELEGRAM_CHANNEL_NAME}</h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-zinc-500">
                Подписка на канал помогает проекту расти, а вам открывает ИИ-меню,
                список покупок и безлимит гостей для всего банкета.
              </p>
            </div>

            <div className="mb-6 grid gap-2">
              <div className="flex items-center gap-3 rounded-2xl bg-zinc-50 px-4 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">✓</span>
                <span className="text-sm font-medium text-zinc-800">ИИ-генерация меню под ваш банкет</span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-zinc-50 px-4 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">✓</span>
                <span className="text-sm font-medium text-zinc-800">Умный список покупок</span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-zinc-50 px-4 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">✓</span>
                <span className="text-sm font-medium text-zinc-800">Безлимит гостей, сообщений и голосов</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenTelegramChannel}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-black p-4 text-base font-semibold text-white shadow-xl shadow-black/15 transition-all hover:bg-zinc-900 active:scale-[0.99]"
            >
              Открыть канал {TELEGRAM_CHANNEL_NAME}
            </button>

            <button
              type="button"
              onClick={handleActivateTelegramAccess}
              disabled={isActivatingTelegramAccess}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 p-4 text-base font-semibold text-black transition-all hover:bg-zinc-200 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isActivatingTelegramAccess ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Открываем доступ...
                </>
              ) : (
                "Я подписался, открыть доступ"
              )}
            </button>

            {!hasOpenedTelegramChannel && (
              <p className="mt-3 text-center text-xs leading-5 text-zinc-400">
                Сначала откройте канал и подпишитесь, затем вернитесь в банкет.
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                setShowPaywall(false);
                void trackEvent("telegram_access_cancelled");
              }}
              className="mt-3 w-full p-3 text-sm font-medium text-zinc-400 transition-colors hover:text-black"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        authMode={authMode}
        setAuthMode={setAuthMode}
        authUsername={authUsername}
        setAuthUsername={setAuthUsername}
        authPassword={authPassword}
        setAuthPassword={setAuthPassword}
        authLoading={authLoading}
        handleAuth={handleAuth}
      />
    </div>
  );
}
