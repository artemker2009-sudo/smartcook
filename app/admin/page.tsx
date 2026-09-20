"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Eraser,
  Shield,
  Sparkles,
  Wrench,
} from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";
import {
  IDEA_ALLERGENS,
  IDEA_COOK_METHODS,
  IDEA_IMAGE_ASPECTS,
  IDEA_MAIN_PRODUCTS,
  IDEA_MEALS,
  effectiveImageStatus,
  spentAtMostLabel,
  type IdeaRecipeAdmin,
} from "@/lib/ideaRecipes";

type AnalyticsEvent = {
  party_id?: string | null;
  user_name?: string | null;
  event_type?: string | null;
  created_at?: string | null;
};

type PartyRecord = {
  id?: string | null;
  created_at?: string | null;
  is_paid?: boolean | null;
  user_name?: string | null;
  name?: string | null;
  creator_name?: string | null;
  organizer_name?: string | null;
  created_by?: string | null;
  owner_name?: string | null;
  host_name?: string | null;
};

type DashboardStats = {
  parties: PartyRecord[];
  recentEvents: AnalyticsEvent[];
};

type ErrorReport = {
  id: string;
  created_at?: string | null;
  message?: string | null;
  contact?: string | null;
  url?: string | null;
  display_mode?: string | null;
  viewport?: string | null;
  app_version?: string | null;
  status?: string | null;
};

type ResetRequest = {
  id: string;
  created_at?: string | null;
  username: string;
  telegram: string;
  status?: string | null;
};

const EMPTY_STATS: DashboardStats = {
  parties: [],
  recentEvents: [],
};

type FeedPhoto = {
  id: string;
  created_at?: string | null;
  user_name?: string | null;
  recipe_title?: string | null;
  photo_url: string;
  is_public?: boolean | null;
  is_hidden?: boolean | null;
};

// Пост ленты сообщества в очереди на модерацию (status='pending'). Без user_ref.
type CommunityQueueItem = {
  id: string;
  created_at?: string | null;
  user_name?: string | null;
  recipe_title?: string | null;
  recipe_id?: number | null;
  photo_url: string;
  caption?: string | null;
  status?: string | null;
};

type NewsItem = {
  id: string;
  created_at?: string | null;
  date?: string | null;
  title: string;
  body: string;
  is_visible?: boolean | null;
};

type Article = {
  id: string;
  created_at?: string | null;
  published_at?: string | null;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  emoji_icon?: string | null;
  is_published?: boolean | null;
};

type Tip = {
  id: string;
  created_at?: string | null;
  published_at?: string | null;
  body: string;
  emoji_icon?: string | null;
  is_published?: boolean | null;
};

type ImageCandidate = { id: number; title: string; likes_count?: number | null; created_at?: string };
type ImageStatusValue = "none" | "generating" | "ready" | "failed";
type GalleryItem = {
  source: "recipe" | "dish";
  id: number;
  title: string;
  image_url: string | null;
  status: ImageStatusValue;
};

// Разбор textarea прогрева: одна строка = одно блюдо. Чистим перед нормализацией:
// убираем пустые строки и висячие запятые/точки-с-запятой («уха,» → «уха»), чтобы
// такая строка не порождала дубль к «уха» (и не засоряла название в кэше).
function parseWarmupDishes(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim().replace(/[\s,;]+$/, "").trim())
    .filter(Boolean);
}
type ImagesStatus = {
  // Уникальные нормализованные блюда с картинкой (обе системы: recipes + dish_cache).
  dishesWithImageCount: number;
  candidates: ImageCandidate[];
  gallery: GalleryItem[];
  costPerImageUsd: number;
  maxBatch: number;
};

type TabId = "management" | "analytics" | "purchases" | "news" | "articles" | "ideas" | "tips" | "feed" | "images" | "warmup" | "requests" | "errors" | "reports" | "suggestions";

// Что показать, когда сервер ответил 401. Админ-сессия живёт 12 часов
// (lib/adminAuth.ts), и вкладка, оставленная открытой на ночь, доживает до
// утра с мёртвой кукой. Без этого сообщения запись просто «не срабатывала»:
// роут отвечал 401, а интерфейс показывал общее «не удалось сохранить».
const ADMIN_SESSION_EXPIRED = "Сессия админки истекла — войдите заново.";

// Сколько картинок каталога генерим за один запуск батча. Столько же, сколько
// у картинок рецептов: защита от случайного слива бюджета одним кликом.
const MAX_IDEA_IMAGE_BATCH = 30;

// Состояние генерации картинок каталога — отдаёт /api/admin/ideas/images.
type IdeaImagesStatus = {
  model: string;
  quality: string;
  dailyLimit: number;
  generatedToday: number;
  remainingToday: number;
  costPerImageUsd: number;
  /** Оценка СВЕРХУ: счётчик считает резервы слотов, включая неудачные попытки. */
  spentAtMostTodayUsd: number;
};

// Отчёт импорта каталога. Структуру задаёт /api/admin/ideas (op=import).
type IdeaImportReport = {
  added: { slug: string; title: string }[];
  skipped: { slug: string; reason: string }[];
  warnings: string[];
};

// Предложения пользователей («что добавить, а что убрать»). Личность автора
// сюда не приходит вовсе — только тип и хвост идентификатора (см. роут).
type SuggestionStatus = "new" | "in_progress" | "done" | "rejected";
type SuggestionItem = {
  id: string;
  createdAt: string;
  kind: "add" | "remove" | "bug" | string;
  text: string;
  status: SuggestionStatus | string;
  adminNote: string | null;
  author: { kind: "user" | "guest"; short: string };
};

const SUGGESTION_STATUS_LABEL: Record<SuggestionStatus, string> = {
  new: "Новое",
  in_progress: "В работе",
  done: "Сделано",
  rejected: "Отклонено",
};

const SUGGESTION_KIND_BADGE: Record<string, { text: string; cls: string }> = {
  add: { text: "Добавить", cls: "bg-emerald-100 text-emerald-700 ring-emerald-200" },
  remove: { text: "Убрать", cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
  bug: { text: "🐞 Не работает", cls: "bg-red-100 text-red-700 ring-red-200" },
};

// Жалобы на посты ленты (вкладка «Жалобы»). Личность жалобщика сервер отдаёт
// обезличенно: тип + последние 4 символа идентификатора.
type ReportState = "open" | "hidden" | "dismissed" | "post_deleted";
type CommunityReport = {
  id: string;
  createdAt: string;
  reason: string | null;
  reporter: { kind: "user" | "guest"; short: string };
  state: ReportState;
  reportsOnPost: number;
  post: {
    id: string;
    title: string | null;
    author: string | null;
    photoUrl: string;
    recipeId: number | null;
    status: string;
  } | null;
};

const TABS = [
  { id: "management" as TabId, label: "⚙️ Управление", hint: "Статус сайта и техработы" },
  { id: "analytics" as TabId, label: "📊 Аналитика", hint: "Живые метрики и события" },
  { id: "purchases" as TabId, label: "💳 История покупок", hint: "Только оплаченные банкеты" },
  { id: "news" as TabId, label: "📰 Новости", hint: "Новости проекта на главной" },
  { id: "articles" as TabId, label: "📝 Заметки", hint: "Кухонные заметки на главной" },
  { id: "ideas" as TabId, label: "🍳 Каталог", hint: "Рецепты раздела «Идеи»" },
  { id: "tips" as TabId, label: "💡 Советы", hint: "Совет дня на главной" },
  { id: "feed" as TabId, label: "🍽️ Лента", hint: "Премодерация ленты + витрина" },
  { id: "images" as TabId, label: "🖼️ Картинки", hint: "ИИ-картинки блюд к рецептам" },
  { id: "warmup" as TabId, label: "🔥 Прогрев", hint: "Заранее наполнить кэш блюд" },
  { id: "requests" as TabId, label: "🔑 Заявки на доступ", hint: "Восстановление пароля" },
  { id: "errors" as TabId, label: "🐞 Ошибки", hint: "Баг-репорты пользователей" },
  { id: "reports" as TabId, label: "🚩 Жалобы", hint: "Жалобы на посты ленты" },
  { id: "suggestions" as TabId, label: "💡 Предложения", hint: "Что добавить, а что убрать" },
];

// Репорт со стенда разработки, а не от живого пользователя.
const isDevReport = (report: ErrorReport) => {
  const url = report.url ?? "";
  return url.includes("localhost") || url.includes("127.0.0.1");
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "Нет даты";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Нет даты";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const shortenPartyId = (value?: string | null) => {
  if (!value) {
    return "Нет ID";
  }

  return value.length > 10 ? `${value.slice(0, 8)}...` : value;
};

const getPartyCreatorName = (party: PartyRecord) => {
  const candidates = [
    party.creator_name,
    party.organizer_name,
    party.owner_name,
    party.host_name,
    party.user_name,
    party.name,
    party.created_by,
  ];

  return candidates.find((value) => value?.trim())?.trim() ?? null;
};

const getEventMeta = (eventType?: string | null) => {
  switch (eventType) {
    case "paywall_view_from_ai":
      return {
        label: "Открыл пейволл (ИИ)",
        className: "bg-amber-100 text-amber-700 ring-amber-200",
      };
    case "paywall_view_from_cart":
      return {
        label: "Открыл пейволл (список)",
        className: "bg-orange-100 text-orange-700 ring-orange-200",
      };
    case "paywall_payment_success":
      return {
        label: "Оплата успешна",
        className: "bg-green-100 text-green-700 ring-green-200",
      };
    case "shopping_list_opened":
      return {
        label: "Открыл список покупок",
        className: "bg-sky-100 text-sky-700 ring-sky-200",
      };
    case "ai_menu_generated_success":
      return {
        label: "Сгенерировал меню",
        className: "bg-violet-100 text-violet-700 ring-violet-200",
      };
    case "paywall_cancelled":
      return {
        label: "Закрыл пейволл",
        className: "bg-zinc-100 text-zinc-700 ring-zinc-200",
      };
    default:
      return {
        label: eventType ? eventType.replaceAll("_", " ") : "Неизвестное событие",
        className: "bg-zinc-100 text-zinc-700 ring-zinc-200",
      };
  }
};

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("management");
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  // Аварийные рубильники кэша (уровни B и C отката).
  const [cacheEpoch, setCacheEpoch] = useState<string | null>(null);
  const [purgeClientCache, setPurgeClientCache] = useState(false);
  const [isCacheBusy, setIsCacheBusy] = useState(false);
  const [cacheMessage, setCacheMessage] = useState("");
  const [cacheError, setCacheError] = useState("");
  // Жалобы на посты ленты (вкладка «Жалобы»). Грузятся лениво при открытии.
  const [suggestions, setSuggestions] = useState<SuggestionItem[] | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState("");
  const [suggestionsTableReady, setSuggestionsTableReady] = useState(true);
  const [suggestionsFilter, setSuggestionsFilter] = useState<SuggestionStatus | "all">("all");
  const [suggestionsNewCount, setSuggestionsNewCount] = useState(0);
  const [actingSuggestionId, setActingSuggestionId] = useState<string | null>(null);
  // Черновики заметок: заметка сохраняется по кнопке, а не на каждый символ.
  const [suggestionNoteDrafts, setSuggestionNoteDrafts] = useState<Record<string, string>>({});

  const [reports, setReports] = useState<CommunityReport[] | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState("");
  const [reportsStatusColumnReady, setReportsStatusColumnReady] = useState(true);
  const [actingReportId, setActingReportId] = useState<string | null>(null);
  // Заявки на восстановление доступа (вкладка «Заявки на доступ»).
  const [resetRequests, setResetRequests] = useState<ResetRequest[]>([]);
  const [issuingRequestId, setIssuingRequestId] = useState<string | null>(null);
  const [closingRequestId, setClosingRequestId] = useState<string | null>(null);
  const [requestsError, setRequestsError] = useState("");
  // Выданные коды держим в памяти страницы: показать их можно только сейчас,
  // в базе лежит лишь хеш.
  const [issuedCodes, setIssuedCodes] = useState<Record<string, string>>({});
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorReports, setErrorReports] = useState<ErrorReport[]>([]);
  const [errorsError, setErrorsError] = useState("");
  const [markingReportId, setMarkingReportId] = useState<string | null>(null);
  const [feedPhotos, setFeedPhotos] = useState<FeedPhoto[]>([]);
  const [hidingPhotoId, setHidingPhotoId] = useState<string | null>(null);
  const [communityQueue, setCommunityQueue] = useState<CommunityQueueItem[]>([]);
  const [moderatingId, setModeratingId] = useState<string | null>(null);
  // Раздел «Картинки»: статус, батч-генерация и перегенерация.
  const [imagesStatus, setImagesStatus] = useState<ImagesStatus | null>(null);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesError, setImagesError] = useState("");
  const [batchN, setBatchN] = useState(10);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchResult, setBatchResult] = useState<{ ok: number; failed: number } | null>(null);
  // Ключ перегенерируемой сейчас карточки галереи: `${source}:${id}` (null = ни одна).
  const [regenKey, setRegenKey] = useState<string | null>(null);
  // Галерея: клиентский поиск по названию и фильтр по наличию/ошибке картинки.
  const [gallerySearch, setGallerySearch] = useState("");
  const [galleryFilter, setGalleryFilter] = useState<"all" | "no-image" | "error">("all");
  // Раздел «Прогрев»: список блюд → наполнение кэша (рецепт + картинка).
  const WARMUP_MAX = 30;
  const [warmupText, setWarmupText] = useState("");
  const [warmupCostPerImage, setWarmupCostPerImage] = useState(0.02);
  const [warmupRunning, setWarmupRunning] = useState(false);
  const [warmupProgress, setWarmupProgress] = useState<{ done: number; total: number } | null>(null);
  const [warmupResult, setWarmupResult] = useState<{ ok: number; skipped: number; failed: number } | null>(null);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsEditingId, setNewsEditingId] = useState<string | null>(null); // null = форма создания
  const [newsTitle, setNewsTitle] = useState("");
  const [newsDate, setNewsDate] = useState("");
  const [newsBody, setNewsBody] = useState("");
  const [newsSaving, setNewsSaving] = useState(false);
  const [newsError, setNewsError] = useState("");
  const [newsBusyId, setNewsBusyId] = useState<string | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [articleEditingId, setArticleEditingId] = useState<string | null>(null); // null = форма создания
  const [articleTitle, setArticleTitle] = useState("");
  const [articleSlug, setArticleSlug] = useState("");
  const [articleExcerpt, setArticleExcerpt] = useState("");
  const [articleEmoji, setArticleEmoji] = useState("");
  const [articleBody, setArticleBody] = useState("");
  const [articleSaving, setArticleSaving] = useState(false);
  const [articleError, setArticleError] = useState("");
  const [articleBusyId, setArticleBusyId] = useState<string | null>(null);
  const [articlePreview, setArticlePreview] = useState(false);
  const [articleTopic, setArticleTopic] = useState("");
  const [articleGenerating, setArticleGenerating] = useState(false);
  // Ссылка на форму заметки — по ней её показывают при «Редактировать».
  const articleFormRef = useRef<HTMLFormElement>(null);
  // --- Каталог «Идеи» ---
  // Список грузится СВОИМ запросом к /api/admin/ideas, а не из общего
  // /api/admin/dashboard: каталог нужен только на своей вкладке, и тащить его
  // в каждую загрузку админки незачем.
  const [ideas, setIdeas] = useState<IdeaRecipeAdmin[]>([]);
  const [ideasMigrationMissing, setIdeasMigrationMissing] = useState(false);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideaError, setIdeaError] = useState("");
  const [ideaBusyId, setIdeaBusyId] = useState<string | null>(null);
  const [ideaSearch, setIdeaSearch] = useState("");
  const [ideaFilter, setIdeaFilter] = useState<"all" | "draft" | "published">("all");
  const [ideaImporting, setIdeaImporting] = useState(false);
  const [ideaReport, setIdeaReport] = useState<IdeaImportReport | null>(null);
  // Форма правки. Открывается только для существующего рецепта: создавать
  // руками нечего — рецепты приезжают файлом.
  const [ideaEditingId, setIdeaEditingId] = useState<string | null>(null);
  // Ссылка на форму правки — по ней её показывают (см. эффект ниже).
  const ideaFormRef = useRef<HTMLFormElement>(null);
  const [ideaImages, setIdeaImages] = useState<IdeaImagesStatus | null>(null);
  const [ideaImageBusyId, setIdeaImageBusyId] = useState<string | null>(null);
  const [ideaBatch, setIdeaBatch] = useState<{ done: number; total: number; failed: number } | null>(
    null,
  );
  const [ideaForm, setIdeaForm] = useState({
    slug: "",
    title: "",
    description: "",
    servings: "2",
    cooking_time_minutes: "30",
    meals: [] as string[],
    main_product: IDEA_MAIN_PRODUCTS[0] as string,
    cook_method: "" as string,
    tags: "",
    allergens: [] as string[],
    image_aspect: "square",
    sort_weight: "0",
    family: "",
    ingredients: "",
    steps: "",
  });
  const [tips, setTips] = useState<Tip[]>([]);
  const [tipEditingId, setTipEditingId] = useState<string | null>(null);
  const [tipBody, setTipBody] = useState("");
  const [tipEmoji, setTipEmoji] = useState("");
  const [tipSaving, setTipSaving] = useState(false);
  const [tipError, setTipError] = useState("");
  const [tipBusyId, setTipBusyId] = useState<string | null>(null);
  const [tipGenerating, setTipGenerating] = useState(false);

  const loadDashboard = async () => {
    setIsLoading(true);
    setIsAnalyticsLoading(true);
    setErrorMessage("");
    setAnalyticsError("");

    try {
      const response = await fetch("/api/admin/dashboard", { cache: "no-store" });

      if (response.status === 401) {
        setIsAuthenticated(false);
        return;
      }

      if (!response.ok) {
        throw new Error("Не удалось загрузить данные админки");
      }

      const data = await response.json();

      setIsMaintenance(Boolean(data.isMaintenance));
      setCacheEpoch((data.cacheEpoch as string | null) ?? null);
      setPurgeClientCache(Boolean(data.purgeClientCache));
      setStats({
        parties: (data.parties as PartyRecord[] | null) ?? [],
        recentEvents: (data.recentEvents as AnalyticsEvent[] | null) ?? [],
      });
      setErrorReports((data.errorReports as ErrorReport[] | null) ?? []);
      setResetRequests((data.resetRequests as ResetRequest[] | null) ?? []);
      setFeedPhotos((data.feedPhotos as FeedPhoto[] | null) ?? []);
      setCommunityQueue((data.communityQueue as CommunityQueueItem[] | null) ?? []);
      setNewsItems((data.news as NewsItem[] | null) ?? []);
      setArticles((data.articles as Article[] | null) ?? []);
      setTips((data.tips as Tip[] | null) ?? []);
      setIsAuthenticated(true);
    } catch (error) {
      console.error("Ошибка загрузки админки", error);
      setErrorMessage("Не удалось загрузить статус режима обслуживания.");
      setAnalyticsError("Не удалось загрузить аналитику.");
      setErrorsError("Не удалось загрузить баг-репорты.");
    } finally {
      setIsLoading(false);
      setIsAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      await loadDashboard();
      setIsCheckingSession(false);
    };

    void checkSession();
  }, []);

  // Раздел «Картинки» грузим лениво — при первом открытии вкладки. Данные тяжелее
  // дашборда (кандидаты + список с картинками) и нужны только здесь.
  useEffect(() => {
    if (isAuthenticated && activeTab === "images" && imagesStatus === null && !imagesLoading) {
      void loadImages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeTab]);

  // Раздел «Предложения» грузим лениво и перезагружаем при смене фильтра.
  useEffect(() => {
    if (isAuthenticated && activeTab === "suggestions") {
      void loadSuggestions(suggestionsFilter);
    }
  }, [isAuthenticated, activeTab, suggestionsFilter]);

  // Раздел «Каталог» грузим лениво — при первом открытии вкладки. В общий
  // /api/admin/dashboard каталог не тащим: он нужен только здесь.
  useEffect(() => {
    if (isAuthenticated && activeTab === "ideas" && ideas.length === 0 && !ideasLoading && !ideaError) {
      void loadIdeas();
      void loadIdeaImagesStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeTab]);

  // Раздел «Жалобы» грузим лениво — при первом открытии вкладки.
  useEffect(() => {
    if (isAuthenticated && activeTab === "reports" && reports === null && !reportsLoading) {
      void loadReports();
    }
  }, [isAuthenticated, activeTab, reports, reportsLoading]);

  // Раздел «Прогрев»: подтягиваем цену за картинку (для оценки стоимости прогона).
  useEffect(() => {
    if (!isAuthenticated || activeTab !== "warmup") return;
    void (async () => {
      try {
        const res = await fetch("/api/admin/warmup", { cache: "no-store" });
        if (res.status === 401) { setIsAuthenticated(false); return; }
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data?.costPerImageUsd === "number") setWarmupCostPerImage(data.costPerImageUsd);
      } catch { /* цена по умолчанию 0.02 */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeTab]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoggingIn(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setErrorMessage(response.status === 429 ? "Слишком много попыток. Попробуйте позже." : "Неверный пароль.");
        return;
      }

      setPassword("");
      await loadDashboard();
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Выдать по заявке новый КОД восстановления (пароль не трогаем — человек
  // задаст его сам). Код показываем один раз здесь, чтобы ты переслал его
  // пользователю в Telegram.
  const handleIssueRecoveryCode = async (id: string) => {
    setRequestsError("");
    setIssuingRequestId(id);

    try {
      const response = await fetch("/api/admin/reset-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "issue", id }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        setRequestsError(payload?.error || "Не удалось выдать код.");
        return;
      }

      setIssuedCodes((current) => ({ ...current, [id]: payload.recoveryCode as string }));
    } catch (error) {
      console.error("Ошибка выдачи кода", error);
      setRequestsError("Не удалось выдать код.");
    } finally {
      setIssuingRequestId(null);
    }
  };

  const handleCloseRequest = async (id: string) => {
    setClosingRequestId(id);

    try {
      const response = await fetch("/api/admin/reset-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "done", id }),
      });

      if (!response.ok) throw new Error("Не удалось закрыть заявку");

      setResetRequests((current) =>
        current.map((r) => (r.id === id ? { ...r, status: "done" } : r)),
      );
    } catch (error) {
      console.error("Ошибка закрытия заявки", error);
      setRequestsError("Не удалось закрыть заявку.");
    } finally {
      setClosingRequestId(null);
    }
  };

  const handleToggleMaintenance = async () => {
    const nextValue = !isMaintenance;

    setIsUpdating(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isMaintenance: nextValue }),
      });

      if (!response.ok) {
        throw new Error("Не удалось обновить режим обслуживания");
      }

      setIsMaintenance(nextValue);
    } catch (error) {
      console.error("Ошибка обновления режима обслуживания", error);
      setErrorMessage("Не удалось обновить режим обслуживания.");
    } finally {
      setIsUpdating(false);
    }
  };

  // УРОВЕНЬ B. Новая метка поколения кэша: каждый клиент, увидев её, выбросит
  // кэши сервис-воркера и перерегистрирует его. Списки покупок и прочий
  // localStorage при этом НЕ ТРОГАЮТСЯ — см. components/CacheKillSwitch.tsx.
  const handleBumpCacheEpoch = async () => {
    setIsCacheBusy(true);
    setCacheError("");
    setCacheMessage("");

    try {
      const response = await fetch("/api/admin/cache-purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bump" }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Не удалось сбросить кэш");

      setCacheEpoch((data?.cacheEpoch as string | null) ?? null);
      setCacheMessage("Метка обновлена. Люди получат чистый кэш при следующем заходе (до минуты на раздачу).");
    } catch (error) {
      console.error("Ошибка сброса кэша", error);
      setCacheError(error instanceof Error ? error.message : "Не удалось сбросить кэш.");
    } finally {
      setIsCacheBusy(false);
    }
  };

  // УРОВЕНЬ C. Тумблер: пока включён, proxy.ts отдаёт Clear-Site-Data: "cache".
  // Выключить обязан человек, когда авария закрыта.
  const handleTogglePurgeClientCache = async () => {
    const nextValue = !purgeClientCache;

    setIsCacheBusy(true);
    setCacheError("");
    setCacheMessage("");

    try {
      const response = await fetch("/api/admin/cache-purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purgeClientCache: nextValue }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Не удалось переключить чистку HTTP-кэша");

      setPurgeClientCache(nextValue);
      setCacheMessage(
        nextValue
          ? "Заголовок включён. Не забудьте выключить его, когда авария закроется."
          : "Заголовок выключен.",
      );
    } catch (error) {
      console.error("Ошибка переключения чистки HTTP-кэша", error);
      setCacheError(error instanceof Error ? error.message : "Не удалось переключить чистку HTTP-кэша.");
    } finally {
      setIsCacheBusy(false);
    }
  };

  const handleDeleteParty = async () => {
    if (!deleteConfirmId) return;

    setIsDeleting(true);

    try {
      const response = await fetch("/api/admin/parties", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteConfirmId }),
      });

      if (!response.ok) {
        throw new Error("Не удалось удалить банкет");
      }

      setStats((currentStats) => ({
        parties: currentStats.parties.filter((party) => party.id !== deleteConfirmId),
        recentEvents: currentStats.recentEvents.filter((event) => event.party_id !== deleteConfirmId),
      }));
      setOpenMenuId(null);
    } catch (error) {
      console.error("Ошибка при удалении", error);
    } finally {
      setIsDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  const handleMarkReportViewed = async (id: string) => {
    setMarkingReportId(id);

    try {
      const response = await fetch("/api/admin/error-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        throw new Error("Не удалось обновить статус репорта");
      }

      setErrorReports((current) =>
        current.map((report) => (report.id === id ? { ...report, status: "viewed" } : report)),
      );
    } catch (error) {
      console.error("Ошибка при обновлении репорта", error);
    } finally {
      setMarkingReportId(null);
    }
  };

  // --- Вкладка «Предложения» ----------------------------------------------
  // Фильтр по статусу уезжает на сервер (а не режется на клиенте): при
  // нескольких сотнях записей выборка должна сужаться в БД, иначе лимит в 300
  // строк съедается «Сделано» и новые предложения просто не доедут до экрана.
  const loadSuggestions = async (filter: SuggestionStatus | "all") => {
    setSuggestionsLoading(true);
    setSuggestionsError("");
    try {
      const query = filter === "all" ? "" : `?status=${filter}`;
      const response = await fetch(`/api/admin/suggestions${query}`, { cache: "no-store" });
      if (response.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      if (!response.ok) throw new Error("Не удалось загрузить предложения");
      const data = await response.json();
      setSuggestions(Array.isArray(data?.items) ? (data.items as SuggestionItem[]) : []);
      setSuggestionsNewCount(typeof data?.newCount === "number" ? data.newCount : 0);
      setSuggestionsTableReady(data?.tableReady !== false);
    } catch (error) {
      console.error("Ошибка при загрузке предложений", error);
      setSuggestionsError("Не удалось загрузить предложения");
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const handleSuggestionPatch = async (
    id: string,
    patch: { status?: SuggestionStatus; adminNote?: string },
  ) => {
    setActingSuggestionId(id);
    setSuggestionsError("");
    try {
      const response = await fetch("/api/admin/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (response.status === 409) {
        const data = await response.json().catch(() => null);
        setSuggestionsError(data?.error || "Нужна миграция supabase_suggestions.sql");
        return;
      }
      if (!response.ok) throw new Error("Не удалось обновить предложение");

      setSuggestions((current) =>
        (current ?? []).map((item) =>
          item.id === id
            ? {
                ...item,
                status: patch.status ?? item.status,
                adminNote:
                  patch.adminNote !== undefined ? patch.adminNote || null : item.adminNote,
              }
            : item,
        ),
      );
      // Бейдж «новых» ведём здесь же: перезагружать список ради одной цифры
      // незачем, а расхождение с фильтром «Новые» человек заметит сразу.
      if (patch.status !== undefined) {
        const before = suggestions?.find((item) => item.id === id)?.status;
        if (before === "new" && patch.status !== "new") {
          setSuggestionsNewCount((n) => Math.max(0, n - 1));
        } else if (before !== "new" && patch.status === "new") {
          setSuggestionsNewCount((n) => n + 1);
        }
      }
    } catch (error) {
      console.error("Ошибка при обновлении предложения", error);
      setSuggestionsError("Не удалось обновить предложение");
    } finally {
      setActingSuggestionId(null);
    }
  };

  // --- Вкладка «Жалобы» ---------------------------------------------------
  const loadReports = async () => {
    setReportsLoading(true);
    setReportsError("");
    try {
      const response = await fetch("/api/admin/reports", { cache: "no-store" });
      if (response.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      if (!response.ok) throw new Error("Не удалось загрузить жалобы");
      const data = await response.json();
      setReports(Array.isArray(data?.items) ? (data.items as CommunityReport[]) : []);
      setReportsStatusColumnReady(data?.statusColumnReady !== false);
    } catch (error) {
      console.error("Ошибка при загрузке жалоб", error);
      setReportsError("Не удалось загрузить жалобы");
      setReports([]);
    } finally {
      setReportsLoading(false);
    }
  };

  // Скрыть пост по жалобе. Тот же механизм, что в «Ленте»: статус меняет только
  // service_role через /api/admin/feed-moderate (у community_posts нет
  // UPDATE-политики для клиента, самоскрытие/самоодобрение невозможно).
  const handleHideReportedPost = async (reportId: string, postId: string) => {
    setActingReportId(reportId);
    try {
      const response = await fetch("/api/admin/feed-moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: postId, action: "reject" }),
      });
      if (!response.ok) throw new Error("Не удалось скрыть пост");
      // Скрытым становится пост — значит все жалобы на него закрываются.
      setReports((current) =>
        (current ?? []).map((r) =>
          r.post?.id === postId && r.state === "open"
            ? { ...r, state: "hidden", post: { ...r.post, status: "rejected" } }
            : r,
        ),
      );
    } catch (error) {
      console.error("Ошибка при скрытии поста", error);
      setReportsError("Не удалось скрыть пост");
    } finally {
      setActingReportId(null);
    }
  };

  const handleDismissReport = async (reportId: string) => {
    setActingReportId(reportId);
    try {
      const response = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reportId, dismissed: true }),
      });
      if (response.status === 409) {
        const data = await response.json().catch(() => null);
        setReportsError(data?.error || "Нужна миграция для статусов жалоб");
        return;
      }
      if (!response.ok) throw new Error("Не удалось отклонить жалобу");
      setReports((current) =>
        (current ?? []).map((r) => (r.id === reportId ? { ...r, state: "dismissed" } : r)),
      );
    } catch (error) {
      console.error("Ошибка при отклонении жалобы", error);
      setReportsError("Не удалось отклонить жалобу");
    } finally {
      setActingReportId(null);
    }
  };

  const handleToggleFeedPhotoHidden = async (id: string, hidden: boolean) => {
    setHidingPhotoId(id);
    try {
      const response = await fetch("/api/admin/feed-hide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, hidden }),
      });
      if (!response.ok) {
        throw new Error("Не удалось обновить фото");
      }
      setFeedPhotos((current) =>
        current.map((photo) => (photo.id === id ? { ...photo, is_hidden: hidden } : photo)),
      );
    } catch (error) {
      console.error("Ошибка при модерации ленты", error);
    } finally {
      setHidingPhotoId(null);
    }
  };

  // Модерация ленты сообщества: одобрить/отклонить пост из очереди (path «а»).
  // Тот же статус в БД меняет и Telegram-путь; после решения убираем из очереди.
  const handleModerateCommunity = async (id: string, action: "approve" | "reject") => {
    setModeratingId(id);
    try {
      const response = await fetch("/api/admin/feed-moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!response.ok) throw new Error("Не удалось обновить пост");
      setCommunityQueue((current) => current.filter((post) => post.id !== id));
    } catch (error) {
      console.error("Ошибка при модерации ленты сообщества", error);
    } finally {
      setModeratingId(null);
    }
  };

  const loadImages = async () => {
    setImagesLoading(true);
    setImagesError("");
    try {
      const response = await fetch("/api/admin/images", { cache: "no-store" });
      if (response.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      if (!response.ok) throw new Error("Не удалось загрузить статус картинок");
      const data = (await response.json()) as ImagesStatus;
      setImagesStatus(data);
    } catch (error) {
      console.error("Ошибка загрузки раздела «Картинки»", error);
      setImagesError("Не удалось загрузить статус картинок.");
    } finally {
      setImagesLoading(false);
    }
  };

  // Одна генерация = один POST. Возвращает ok/false, роут не падает при ошибке
  // генерации (пишет в error_reports), поэтому здесь ждём JSON-результат.
  const generateOne = async (recipeId: number, force: boolean): Promise<boolean> => {
    try {
      const response = await fetch("/api/admin/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId, force }),
      });
      if (!response.ok) return false;
      const data = await response.json();
      return Boolean(data?.ok);
    } catch {
      return false;
    }
  };

  // Батч: берём топ-N кандидатов (уже отсортированы сервером: популярные → новые)
  // и гоняем ПОСЛЕДОВАТЕЛЬНО, показывая прогресс. Один упавший рецепт не рушит
  // батч. По завершении — перечитываем статус.
  const runBatch = async () => {
    if (!imagesStatus || batchRunning) return;
    const ids = imagesStatus.candidates.slice(0, batchN).map((c) => c.id);
    if (ids.length === 0) return;
    setBatchRunning(true);
    setBatchResult(null);
    setBatchProgress({ done: 0, total: ids.length });
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < ids.length; i++) {
      const success = await generateOne(ids[i], false);
      if (success) ok += 1;
      else failed += 1;
      setBatchProgress({ done: i + 1, total: ids.length });
    }
    setBatchResult({ ok, failed });
    setBatchRunning(false);
    await loadImages();
  };

  // Перегенерация одной карточки галереи. Работает для обоих источников:
  // recipe → generateRecipeImage(force), dish → generateDishCacheImage(force).
  // Оба уважают суточный лимит IMAGE_DAILY_LIMIT (стоп-кран на сервере).
  const regenerateItem = async (item: GalleryItem) => {
    const key = `${item.source}:${item.id}`;
    if (regenKey !== null) return;
    if (!window.confirm(`Перегенерировать картинку для «${item.title || "без названия"}»?`)) return;
    setRegenKey(key);
    try {
      await fetch("/api/admin/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: item.source, id: item.id, force: true }),
      });
      await loadImages();
    } finally {
      setRegenKey(null);
    }
  };

  // Прогрев кэша: одно блюдо = один POST (роут делает рецепт + картинку, не
  // падает при ошибке). Клиент гонит список ПОСЛЕДОВАТЕЛЬНО, показывая прогресс.
  const warmupOne = async (dish: string): Promise<"ok" | "skipped" | "error"> => {
    try {
      const res = await fetch("/api/admin/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dish }),
      });
      if (!res.ok) return "error";
      const data = await res.json();
      if (data?.status === "ok") return "ok";
      if (data?.status === "skipped") return "skipped";
      return "error";
    } catch {
      return "error";
    }
  };

  const runWarmup = async () => {
    if (warmupRunning) return;
    const dishes = parseWarmupDishes(warmupText).slice(0, WARMUP_MAX);
    if (dishes.length === 0) return;
    setWarmupRunning(true);
    setWarmupResult(null);
    setWarmupProgress({ done: 0, total: dishes.length });
    let ok = 0, skipped = 0, failed = 0;
    for (let i = 0; i < dishes.length; i++) {
      const r = await warmupOne(dishes[i]);
      if (r === "ok") ok += 1;
      else if (r === "skipped") skipped += 1;
      else failed += 1;
      setWarmupProgress({ done: i + 1, total: dishes.length });
    }
    setWarmupResult({ ok, skipped, failed });
    setWarmupRunning(false);
  };

  const resetNewsForm = () => {
    setNewsEditingId(null);
    setNewsTitle("");
    setNewsDate("");
    setNewsBody("");
    setNewsError("");
  };

  const startEditNews = (item: NewsItem) => {
    setNewsEditingId(item.id);
    setNewsTitle(item.title ?? "");
    setNewsDate(item.date ?? "");
    setNewsBody(item.body ?? "");
    setNewsError("");
  };

  const handleSaveNews = async (event: FormEvent) => {
    event.preventDefault();
    if (!newsTitle.trim() || !newsBody.trim()) {
      setNewsError("Заголовок и текст обязательны");
      return;
    }
    setNewsSaving(true);
    setNewsError("");
    try {
      const response = await fetch("/api/admin/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: newsEditingId ? "update" : "create",
          id: newsEditingId ?? undefined,
          title: newsTitle,
          date: newsDate,
          body: newsBody,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Не удалось сохранить новость");
      await loadDashboard();
      resetNewsForm();
    } catch (error) {
      setNewsError(error instanceof Error ? error.message : "Не удалось сохранить новость");
    } finally {
      setNewsSaving(false);
    }
  };

  const handleNewsVisibility = async (id: string, visible: boolean) => {
    setNewsBusyId(id);
    try {
      const response = await fetch("/api/admin/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "setVisible", id, visible }),
      });
      if (!response.ok) throw new Error("Не удалось обновить");
      setNewsItems((current) => current.map((n) => (n.id === id ? { ...n, is_visible: visible } : n)));
    } catch (error) {
      console.error("Ошибка видимости новости", error);
    } finally {
      setNewsBusyId(null);
    }
  };

  const handleDeleteNews = async (id: string) => {
    if (!confirm("Удалить новость безвозвратно?")) return;
    setNewsBusyId(id);
    try {
      const response = await fetch("/api/admin/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "delete", id }),
      });
      if (!response.ok) throw new Error("Не удалось удалить");
      setNewsItems((current) => current.filter((n) => n.id !== id));
      if (newsEditingId === id) resetNewsForm();
    } catch (error) {
      console.error("Ошибка удаления новости", error);
    } finally {
      setNewsBusyId(null);
    }
  };

  // --- Кухонные заметки (articles) ---
  const resetArticleForm = () => {
    setArticleEditingId(null);
    setArticleTitle("");
    setArticleSlug("");
    setArticleExcerpt("");
    setArticleEmoji("");
    setArticleBody("");
    setArticleError("");
    setArticlePreview(false);
  };

  const startEditArticle = (item: Article) => {
    setArticleEditingId(item.id);
    setArticleTitle(item.title ?? "");
    setArticleSlug(item.slug ?? "");
    setArticleExcerpt(item.excerpt ?? "");
    setArticleEmoji(item.emoji_icon ?? "");
    setArticleBody(item.body ?? "");
    setArticleError("");
    setArticlePreview(false);
    // Тот же дефект, что был в «Каталоге», просто здесь его не замечали: окно
    // в админке не прокручивается (корень h-screen + overflow-hidden), поэтому
    // window.scrollTo не делал ничего, и форма правки открывалась вне
    // видимой части списка. Форма заметок смонтирована всегда, так что
    // отдельного эффекта, в отличие от «Каталога», не нужно.
    articleFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleGenerateDraft = async () => {
    if (!articleTopic.trim()) {
      setArticleError("Укажите тему для черновика");
      return;
    }
    setArticleGenerating(true);
    setArticleError("");
    try {
      const response = await fetch("/api/admin/articles/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: articleTopic }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Не удалось сгенерировать черновик");
      await loadDashboard();
      setArticleTopic("");
      // Черновик создан НЕопубликованным — сразу открываем на редактирование/вычитку.
      if (data?.article) startEditArticle(data.article as Article);
    } catch (error) {
      setArticleError(error instanceof Error ? error.message : "Не удалось сгенерировать черновик");
    } finally {
      setArticleGenerating(false);
    }
  };

  const handleSaveArticle = async (event: FormEvent) => {
    event.preventDefault();
    if (!articleTitle.trim() || !articleExcerpt.trim() || !articleBody.trim()) {
      setArticleError("Заголовок, краткое описание и текст обязательны");
      return;
    }
    setArticleSaving(true);
    setArticleError("");
    try {
      const response = await fetch("/api/admin/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: articleEditingId ? "update" : "create",
          id: articleEditingId ?? undefined,
          title: articleTitle,
          slug: articleSlug,
          excerpt: articleExcerpt,
          emoji_icon: articleEmoji,
          body: articleBody,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Не удалось сохранить заметку");
      await loadDashboard();
      resetArticleForm();
    } catch (error) {
      setArticleError(error instanceof Error ? error.message : "Не удалось сохранить заметку");
    } finally {
      setArticleSaving(false);
    }
  };

  const handleArticlePublished = async (id: string, published: boolean) => {
    setArticleBusyId(id);
    try {
      const response = await fetch("/api/admin/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "setPublished", id, published }),
      });
      if (!response.ok) throw new Error("Не удалось обновить статус");
      setArticles((current) => current.map((a) => (a.id === id ? { ...a, is_published: published } : a)));
    } catch (error) {
      console.error("Ошибка публикации заметки", error);
    } finally {
      setArticleBusyId(null);
    }
  };

  const handleDeleteArticle = async (id: string) => {
    if (!confirm("Удалить заметку безвозвратно?")) return;
    setArticleBusyId(id);
    try {
      const response = await fetch("/api/admin/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "delete", id }),
      });
      if (!response.ok) throw new Error("Не удалось удалить");
      setArticles((current) => current.filter((a) => a.id !== id));
      if (articleEditingId === id) resetArticleForm();
    } catch (error) {
      console.error("Ошибка удаления заметки", error);
    } finally {
      setArticleBusyId(null);
    }
  };

  // --- Каталог «Идеи» ---

  /**
   * Сервер сказал «не авторизован». Возвращаем на экран входа И называем
   * причину: иначе человек видит форму пароля вместо своей работы и не
   * понимает, что произошло.
   */
  const handleAdminUnauthorized = () => {
    setErrorMessage(ADMIN_SESSION_EXPIRED);
    setIsAuthenticated(false);
  };

  const loadIdeas = async () => {
    setIdeasLoading(true);
    setIdeaError("");
    try {
      const response = await fetch("/api/admin/ideas", { cache: "no-store" });
      if (response.status === 401) {
        handleAdminUnauthorized();
        return;
      }
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Не удалось загрузить каталог");
      setIdeas((data?.recipes as IdeaRecipeAdmin[] | null) ?? []);
      setIdeasMigrationMissing(Boolean(data?.migrationMissing));
    } catch (error) {
      setIdeaError(error instanceof Error ? error.message : "Не удалось загрузить каталог");
    } finally {
      setIdeasLoading(false);
    }
  };

  const resetIdeaForm = () => {
    setIdeaEditingId(null);
    setIdeaError("");
  };

  // Ингредиенты правятся текстом «название | количество» построчно, а не
  // двадцатью парами полей: вычитка идёт глазами по всему списку сразу, и
  // форма из сорока инпутов для этого непригодна.
  const ingredientsToText = (list: { name: string; amount: string }[]) =>
    list.map((i) => `${i.name} | ${i.amount}`).join("\n");

  const textToIngredients = (text: string) =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, ...rest] = line.split("|");
        return { name: (name || "").trim(), amount: rest.join("|").trim() };
      });

  const startEditIdea = (item: IdeaRecipeAdmin) => {
    setIdeaEditingId(item.id);
    setIdeaError("");
    setIdeaForm({
      slug: item.slug,
      title: item.title,
      description: item.description,
      servings: String(item.servings),
      cooking_time_minutes: String(item.cooking_time_minutes),
      meals: item.meals ?? [],
      main_product: item.main_product,
      cook_method: item.cook_method ?? "",
      tags: (item.tags ?? []).join(", "),
      allergens: item.allergens ?? [],
      image_aspect: item.image_aspect || "square",
      sort_weight: String(item.sort_weight ?? 0),
      family: item.family ?? "",
      ingredients: ingredientsToText(item.ingredients ?? []),
      steps: (item.steps ?? []).join("\n"),
    });
    // Показать форму — задача эффекта ниже: в этот момент её ещё нет в DOM,
    // она появляется только вместе с ideaEditingId.
  };

  /**
   * Показать форму правки, когда она смонтировалась.
   *
   * СКРОЛЛИМ ЭЛЕМЕНТ, А НЕ ОКНО. Корень админки — `h-screen overflow-hidden`,
   * прокручивается не документ, а `<main className="overflow-y-auto">`.
   * Поэтому window.scrollTo здесь не делает РОВНО НИЧЕГО (проверено замером:
   * main.scrollTop не меняется). Из-за этого форма открывалась выше текущего
   * положения списка, человек не видел никакой реакции — и кнопка
   * «Редактировать» выглядела мёртвой на всех блюдах сразу.
   *
   * scrollIntoView не зависит от того, какой предок прокручивается, поэтому
   * переживёт и следующую перестройку вёрстки админки.
   */
  useEffect(() => {
    if (!ideaEditingId) return;
    ideaFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [ideaEditingId]);

  const toggleIdeaMeal = (meal: string) => {
    setIdeaForm((f) => ({
      ...f,
      meals: f.meals.includes(meal) ? f.meals.filter((m) => m !== meal) : [...f.meals, meal],
    }));
  };

  const toggleIdeaAllergen = (allergen: string) => {
    setIdeaForm((f) => ({
      ...f,
      allergens: f.allergens.includes(allergen)
        ? f.allergens.filter((a) => a !== allergen)
        : [...f.allergens, allergen],
    }));
  };

  const handleSaveIdea = async (event: FormEvent) => {
    event.preventDefault();
    if (!ideaEditingId) return;
    setIdeaBusyId(ideaEditingId);
    setIdeaError("");
    try {
      const response = await fetch("/api/admin/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "update",
          id: ideaEditingId,
          // Собираем ровно тот объект, который принимает импорт: проверяет их
          // один и тот же код на сервере.
          recipe: {
            slug: ideaForm.slug,
            title: ideaForm.title,
            description: ideaForm.description,
            servings: Number(ideaForm.servings),
            cooking_time_minutes: Number(ideaForm.cooking_time_minutes),
            meals: ideaForm.meals,
            main_product: ideaForm.main_product,
            cook_method: ideaForm.cook_method || null,
            tags: ideaForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
            allergens: ideaForm.allergens,
            image_aspect: ideaForm.image_aspect,
            sort_weight: Number(ideaForm.sort_weight),
            family: ideaForm.family || null,
            ingredients: textToIngredients(ideaForm.ingredients),
            steps: ideaForm.steps.split("\n").map((s) => s.trim()).filter(Boolean),
          },
        }),
      });
      if (response.status === 401) {
        handleAdminUnauthorized();
        return;
      }
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Не удалось сохранить рецепт");
      await loadIdeas();
      resetIdeaForm();
    } catch (error) {
      setIdeaError(error instanceof Error ? error.message : "Не удалось сохранить рецепт");
    } finally {
      setIdeaBusyId(null);
    }
  };

  const handleIdeaPublished = async (id: string, published: boolean) => {
    setIdeaBusyId(id);
    setIdeaError("");
    try {
      const response = await fetch("/api/admin/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "setPublished", id, published }),
      });
      if (response.status === 401) {
        handleAdminUnauthorized();
        return;
      }
      if (!response.ok) throw new Error("Не удалось обновить статус");
      await loadIdeas();
    } catch (error) {
      setIdeaError(error instanceof Error ? error.message : "Не удалось обновить статус");
    } finally {
      setIdeaBusyId(null);
    }
  };

  const handleDeleteIdea = async (id: string, title: string) => {
    if (!confirm(`Удалить «${title}» из каталога безвозвратно?`)) return;
    setIdeaBusyId(id);
    setIdeaError("");
    try {
      const response = await fetch("/api/admin/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "delete", id }),
      });
      if (response.status === 401) {
        handleAdminUnauthorized();
        return;
      }
      if (!response.ok) throw new Error("Не удалось удалить");
      setIdeas((current) => current.filter((r) => r.id !== id));
      if (ideaEditingId === id) resetIdeaForm();
    } catch (error) {
      setIdeaError(error instanceof Error ? error.message : "Не удалось удалить");
    } finally {
      setIdeaBusyId(null);
    }
  };

  const handleImportIdeas = async (file: File) => {
    setIdeaImporting(true);
    setIdeaError("");
    setIdeaReport(null);
    try {
      // Читаем файл на клиенте и шлём текстом: сервер сам считает размер в
      // байтах и разбирает JSON, чтобы ошибку разбора показать отдельно от
      // ошибок проверки рецептов.
      const text = await file.text();
      const response = await fetch("/api/admin/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "import", file: text }),
      });
      if (response.status === 401) {
        handleAdminUnauthorized();
        return;
      }
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Не удалось импортировать файл");
      setIdeaReport({
        added: data?.added ?? [],
        skipped: data?.skipped ?? [],
        warnings: data?.warnings ?? [],
      });
      await loadIdeas();
    } catch (error) {
      setIdeaError(error instanceof Error ? error.message : "Не удалось импортировать файл");
    } finally {
      setIdeaImporting(false);
    }
  };

  // --- Картинки каталога ---

  const loadIdeaImagesStatus = async () => {
    try {
      const response = await fetch("/api/admin/ideas/images", { cache: "no-store" });
      if (response.status === 401) {
        handleAdminUnauthorized();
        return;
      }
      if (!response.ok) return;
      setIdeaImages((await response.json()) as IdeaImagesStatus);
    } catch {
      // Счётчик — справочная величина: его недоступность не должна мешать
      // работать с каталогом.
    }
  };

  /**
   * Генерация одной картинки. Возвращает true при успехе — на этом батч ниже
   * считает «сделано», а на 429 (суточный лимит) останавливается целиком.
   */
  const generateIdeaImage = async (id: string, force: boolean): Promise<"ok" | "fail" | "limit"> => {
    try {
      const response = await fetch("/api/admin/ideas/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, force }),
      });
      if (response.status === 401) {
        handleAdminUnauthorized();
        return "fail";
      }
      if (response.status === 429) {
        const data = await response.json().catch(() => null);
        setIdeaError(data?.error || "Суточный лимит генераций исчерпан");
        return "limit";
      }
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setIdeaError(data?.error || "Не удалось сгенерировать картинку");
        return "fail";
      }
      return "ok";
    } catch (error) {
      setIdeaError(error instanceof Error ? error.message : "Не удалось сгенерировать картинку");
      return "fail";
    }
  };

  const handleIdeaImage = async (item: IdeaRecipeAdmin, force: boolean) => {
    // Перегенерация — это деньги: спрашиваем и называем цену.
    if (force) {
      const price = ideaImages ? ` Примерно $${ideaImages.costPerImageUsd.toFixed(3)}.` : "";
      if (!confirm(`Перерисовать картинку для «${item.title}»?${price}`)) return;
    }
    setIdeaImageBusyId(item.id);
    setIdeaError("");
    try {
      await generateIdeaImage(item.id, force);
      await loadIdeas();
      await loadIdeaImagesStatus();
    } finally {
      setIdeaImageBusyId(null);
    }
  };

  /**
   * Батч по рецептам без картинки — ПОСЛЕДОВАТЕЛЬНО, по одной за запрос.
   *
   * Параллелить нельзя: одна генерация занимает около минуты и стоит денег,
   * а суточный лимит резервируется атомарно в базе. Последовательный проход
   * позволяет остановиться на первом же отказе лимита, не заплатив за хвост.
   */
  const handleGenerateAllMissing = async () => {
    const pending = ideas.filter(
      (item) => effectiveImageStatus(item.image_status, item.updated_at) !== "ready",
    );
    const batch = pending.slice(0, MAX_IDEA_IMAGE_BATCH);
    if (batch.length === 0) return;

    const price = ideaImages
      ? ` Примерно $${(batch.length * ideaImages.costPerImageUsd).toFixed(2)}.`
      : "";
    const tail =
      pending.length > batch.length
        ? `\n\nБез картинки всего ${pending.length}; за один запуск берём не больше ${MAX_IDEA_IMAGE_BATCH}.`
        : "";
    if (!confirm(`Сгенерировать картинки для ${batch.length} рецептов?${price}${tail}`)) return;

    setIdeaError("");
    setIdeaBatch({ done: 0, total: batch.length, failed: 0 });
    let failed = 0;
    for (let i = 0; i < batch.length; i++) {
      const outcome = await generateIdeaImage(batch[i].id, false);
      if (outcome === "limit") {
        setIdeaBatch({ done: i, total: batch.length, failed });
        break;
      }
      if (outcome === "fail") failed += 1;
      setIdeaBatch({ done: i + 1, total: batch.length, failed });
    }
    await loadIdeas();
    await loadIdeaImagesStatus();
    // Итог остаётся на экране: человек должен увидеть, сколько не вышло.
    setTimeout(() => setIdeaBatch(null), 10000);
  };

  // Отчёт целиком текстом — чтобы отправить директору на исправление файла,
  // а не пересказывать руками.
  const ideaReportAsText = (report: IdeaImportReport) =>
    [
      `Добавлено: ${report.added.length}`,
      ...report.added.map((a) => `  + ${a.title} (${a.slug})`),
      `Пропущено: ${report.skipped.length}`,
      ...report.skipped.map((s) => `  - ${s.slug}: ${s.reason}`),
      ...(report.warnings.length ? ["Предупреждения:", ...report.warnings.map((w) => `  ! ${w}`)] : []),
    ].join("\n");

  // --- Советы (tips) ---
  const resetTipForm = () => {
    setTipEditingId(null);
    setTipBody("");
    setTipEmoji("");
    setTipError("");
  };

  const startEditTip = (item: Tip) => {
    setTipEditingId(item.id);
    setTipBody(item.body ?? "");
    setTipEmoji(item.emoji_icon ?? "");
    setTipError("");
  };

  const handleGenerateTips = async () => {
    setTipGenerating(true);
    setTipError("");
    try {
      const response = await fetch("/api/admin/tips/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 20 }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Не удалось сгенерировать советы");
      await loadDashboard();
    } catch (error) {
      setTipError(error instanceof Error ? error.message : "Не удалось сгенерировать советы");
    } finally {
      setTipGenerating(false);
    }
  };

  const handleSaveTip = async (event: FormEvent) => {
    event.preventDefault();
    if (!tipBody.trim()) {
      setTipError("Текст совета обязателен");
      return;
    }
    setTipSaving(true);
    setTipError("");
    try {
      const response = await fetch("/api/admin/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: tipEditingId ? "update" : "create",
          id: tipEditingId ?? undefined,
          body: tipBody,
          emoji_icon: tipEmoji,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Не удалось сохранить совет");
      await loadDashboard();
      resetTipForm();
    } catch (error) {
      setTipError(error instanceof Error ? error.message : "Не удалось сохранить совет");
    } finally {
      setTipSaving(false);
    }
  };

  const handleTipPublished = async (id: string, published: boolean) => {
    setTipBusyId(id);
    try {
      const response = await fetch("/api/admin/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "setPublished", id, published }),
      });
      if (!response.ok) throw new Error("Не удалось обновить статус");
      setTips((current) => current.map((t) => (t.id === id ? { ...t, is_published: published } : t)));
    } catch (error) {
      console.error("Ошибка публикации совета", error);
    } finally {
      setTipBusyId(null);
    }
  };

  const handleDeleteTip = async (id: string) => {
    if (!confirm("Удалить совет безвозвратно?")) return;
    setTipBusyId(id);
    try {
      const response = await fetch("/api/admin/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "delete", id }),
      });
      if (!response.ok) throw new Error("Не удалось удалить");
      setTips((current) => current.filter((t) => t.id !== id));
      if (tipEditingId === id) resetTipForm();
    } catch (error) {
      console.error("Ошибка удаления совета", error);
    } finally {
      setTipBusyId(null);
    }
  };

  const publishedTipsCount = tips.filter((t) => t.is_published).length;

  const totalParties = stats.parties.length;
  const paidParties = stats.parties.filter((party) => Boolean(party.is_paid)).length;
  const paymentConversion = totalParties > 0 ? Math.round((paidParties / totalParties) * 100) : 0;
  const paidPartyHistory = stats.parties
    .filter((party) => Boolean(party.is_paid))
    .sort((left, right) => {
      const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
      const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;

      return rightTime - leftTime;
    });
  const activeTabMeta = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

  // «Пропущенное»: сколько необработанного висит на вкладке. Считаем по тем же
  // статусам, что показывает сама вкладка, — цифра в меню и список не разъедутся.
  const newResetRequestsCount = resetRequests.filter((r) => (r.status ?? "new") === "new").length;
  // Репорты с localhost — это наши же прогоны при разработке (в т.ч. намеренная
  // проверка телеметрии подставными файлами). Они не должны раздувать бейдж:
  // иначе счётчик «пропущенного» шумит, и за ним теряется живой баг от
  // пользователя — ровно так и вышло с репортом про регистр логина.
  const newErrorReportsCount = errorReports.filter(
    (r) => (r.status ?? "new") === "new" && !isDevReport(r),
  ).length;
  const tabBadges: Partial<Record<TabId, number>> = {
    feed: communityQueue.length,
    requests: newResetRequestsCount,
    errors: newErrorReportsCount,
    suggestions: suggestionsNewCount,
  };

  if (isCheckingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-10 text-zinc-900">
        <p className="text-sm text-zinc-500">Проверяем сессию...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-10 text-zinc-900">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-2xl border border-zinc-100 bg-white p-8 shadow-sm"
        >
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
              <Shield className="h-5 w-5 text-zinc-700" />
            </div>
            <div>
              <p className="text-sm tracking-[0.18em] text-zinc-500 uppercase">Admin</p>
              <h1 className="text-2xl font-semibold tracking-tight">Секретный вход</h1>
            </div>
          </div>

          <label className="mb-3 block text-sm font-medium text-zinc-600">
            Пароль разработчика
          </label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Введите пароль"
            disabled={isLoggingIn}
            className="w-full rounded-2xl border border-zinc-100 bg-zinc-50 px-5 py-4 text-base text-zinc-900 outline-none transition focus:border-transparent focus:bg-white focus:ring-2 focus:ring-black disabled:opacity-60"
          />

          {errorMessage ? (
            <p className="mt-3 text-sm tracking-tight text-red-500">{errorMessage}</p>
          ) : null}

          <button
            type="submit"
            disabled={isLoggingIn}
            className="mt-6 w-full rounded-2xl bg-black py-4 text-base font-medium text-white transition hover:bg-zinc-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoggingIn ? "Проверяем..." : "Войти"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-50 overflow-hidden text-zinc-900">
      <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-6 py-7">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Control Center</p>
              <h1 className="text-xl font-semibold tracking-tight">SmartCook Admin</h1>
            </div>
          </div>
        </div>

        {/* min-h-0 обязателен: без него flex-элемент не даёт себя сжать ниже
            контента, overflow-y-auto не срабатывает и список вкладок нельзя
            прокрутить на невысоком экране. */}
        <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-6">
          {TABS.map((tab) => {
            const badge = tabBadges[tab.id] ?? 0;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`w-full rounded-xl px-4 py-3 text-left transition ${
                  activeTab === tab.id
                    ? "bg-black text-white shadow-sm"
                    : "text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{tab.label}</div>
                  {badge > 0 ? (
                    <span
                      aria-label={`Новых: ${badge}`}
                      className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white"
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </div>
                <div
                  className={`mt-1 text-xs ${
                    activeTab === tab.id ? "text-zinc-300" : "text-zinc-400"
                  }`}
                >
                  {tab.hint}
                </div>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-zinc-200 px-6 py-5">
          <div className="rounded-2xl bg-zinc-100 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Текущая вкладка</p>
            <p className="mt-2 text-sm font-semibold text-zinc-900">{activeTabMeta.label}</p>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-10">
        <div className="mx-auto max-w-7xl">
          <header className="mb-8 rounded-3xl border border-zinc-200 bg-white px-6 py-6 shadow-sm lg:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-400">Admin Dashboard</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight lg:text-4xl">
                  Управление SmartCook
                </h2>
                <p className="mt-3 text-base leading-7 text-zinc-600">
                  Центр управления проектом. Контролируйте доступность сайта, следите за
                  финансовыми показателями и активностью пользователей.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:hidden">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-xl px-4 py-3 text-left transition ${
                      activeTab === tab.id
                        ? "bg-black text-white shadow-sm"
                        : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                    }`}
                  >
                    <div className="text-sm font-semibold">{tab.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </header>

          {activeTab === "management" ? (
            <section className="flex min-h-[calc(100vh-14rem)] flex-col items-center justify-center gap-6">
              <div
                className={`w-full max-w-4xl rounded-[2rem] p-8 shadow-sm lg:p-10 ${
                  isLoading
                    ? "border border-zinc-200 bg-white"
                    : isMaintenance
                      ? "border border-red-200 bg-red-50"
                      : "border border-green-200 bg-green-50"
                }`}
              >
                <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
                  <div>
                    <div
                      className={`inline-flex h-16 w-16 items-center justify-center rounded-2xl ${
                        isLoading
                          ? "bg-zinc-100 text-zinc-700"
                          : isMaintenance
                            ? "bg-red-100 text-red-600"
                            : "bg-green-100 text-green-600"
                      }`}
                    >
                      <Wrench className="h-7 w-7" />
                    </div>
                    <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Управление сайтом
                    </p>
                    <h3
                      className={`mt-4 text-3xl font-semibold tracking-tight lg:text-4xl ${
                        isLoading
                          ? "text-zinc-900"
                          : isMaintenance
                            ? "text-red-700"
                            : "text-green-700"
                      }`}
                    >
                      {isLoading
                        ? "Проверяем текущий статус сайта"
                        : isMaintenance
                          ? "🔴 Сайт закрыт на обслуживание"
                          : "🟢 Сайт работает в штатном режиме"}
                    </h3>
                    <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-700">
                      {isLoading
                        ? "Загружаем актуальный статус сайта."
                        : isMaintenance
                          ? "Пользователи сейчас не могут пользоваться сайтом. Когда работы завершатся, запустите его обратно одной кнопкой."
                          : "Все работает нормально. Если нужно провести технические работы, можно мгновенно остановить доступ для пользователей."}
                    </p>

                    {errorMessage ? (
                      <p className="mt-5 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm text-red-600">
                        {errorMessage}
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-[1.75rem] border border-white/70 bg-white/80 p-6 backdrop-blur">
                    <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                      <p className="text-sm font-semibold text-zinc-500">Текущий режим</p>
                      <div className="mt-4 flex items-center gap-3">
                        <span
                          className={`inline-flex h-3.5 w-3.5 rounded-full ${
                            isLoading
                              ? "bg-zinc-400"
                              : isMaintenance
                                ? "bg-red-500"
                                : "bg-green-500"
                          }`}
                        />
                        <span className="text-lg font-semibold text-zinc-900">
                          {isLoading
                            ? "Загружаем статус..."
                            : isMaintenance
                              ? "Сайт остановлен"
                              : "Сайт активен"}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={handleToggleMaintenance}
                        disabled={isLoading || isUpdating}
                        className={`mt-6 inline-flex w-full items-center justify-center rounded-2xl px-6 py-4 text-base font-semibold text-white transition ${
                          isMaintenance
                            ? "bg-green-600 hover:bg-green-500"
                            : "bg-red-600 hover:bg-red-500"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {isUpdating
                          ? "Сохраняем..."
                          : isMaintenance
                            ? "Запустить сайт"
                            : "Остановить сайт"}
                      </button>

                      <p className="mt-4 text-sm leading-6 text-zinc-500">
                        Изменение применяется сразу и влияет на доступность сайта для пользователей.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* АВАРИЙНЫЙ СБРОС КЭША. Два рубильника на случай, когда людям
                  уехала сломанная версия и они на ней застряли. Появились
                  после разбора аварии 5 сентября: тогда дотянуться до
                  застрявших клиентов было нечем. */}
              <div className="w-full max-w-4xl rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-sm lg:p-10">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700">
                  <Eraser className="h-7 w-7" />
                </div>
                <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Аварийный сброс кэша
                </p>
                <h3 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-900">
                  Если людям уехала сломанная версия
                </h3>
                <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-700">
                  Обычное обновление доезжает само, на следующий спокойный заход. Эти две кнопки нужны
                  только тогда, когда ждать нельзя. Ни одна из них{" "}
                  <span className="font-semibold">не удаляет данные людей</span>: списки покупок,
                  закрепления и вход в аккаунт остаются на месте.
                </p>

                {cacheError ? (
                  <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {cacheError}
                  </p>
                ) : null}
                {cacheMessage ? (
                  <p className="mt-5 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                    {cacheMessage}
                  </p>
                ) : null}

                <div className="mt-8 grid gap-5 lg:grid-cols-2">
                  {/* УРОВЕНЬ B — основной рубильник. */}
                  <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                    <p className="text-sm font-semibold text-zinc-500">Основной способ</p>
                    <h4 className="mt-2 text-lg font-semibold text-zinc-900">Сбросить кэш у всех</h4>
                    <p className="mt-3 text-sm leading-6 text-zinc-600">
                      Каждый телефон при следующем заходе выбросит кэш приложения и заберёт свежую
                      версию. Работает в браузере и в Android-приложении. В iOS-приложении кэша
                      приложения нет вовсе, поэтому там эта кнопка ничего не меняет.
                    </p>
                    <button
                      type="button"
                      onClick={handleBumpCacheEpoch}
                      disabled={isLoading || isCacheBusy}
                      className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-zinc-900 px-6 py-4 text-base font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCacheBusy ? "Сохраняем..." : "Сбросить кэш у всех"}
                    </button>
                    <p className="mt-4 text-xs leading-5 text-zinc-500">
                      {cacheEpoch
                        ? `Последний сброс: ${new Date(cacheEpoch).toLocaleString("ru-RU")}`
                        : "Сбросов ещё не было."}
                    </p>
                  </div>

                  {/* УРОВЕНЬ C — третья линия, слабее, но единственная для iOS. */}
                  <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                    <p className="text-sm font-semibold text-zinc-500">Если не помогло</p>
                    <h4 className="mt-2 text-lg font-semibold text-zinc-900">
                      Чистить кэш браузера
                    </h4>
                    <p className="mt-3 text-sm leading-6 text-zinc-600">
                      Просит сам браузер выбросить то, что он сохранил. Слабее первой кнопки, зато
                      это единственное, что действует в iOS-приложении. Пока включено — работает на
                      каждом заходе, поэтому выключите, когда всё почините.
                    </p>
                    <button
                      type="button"
                      onClick={handleTogglePurgeClientCache}
                      disabled={isLoading || isCacheBusy}
                      className={`mt-5 inline-flex w-full items-center justify-center rounded-2xl px-6 py-4 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        purgeClientCache
                          ? "bg-amber-500 text-white hover:bg-amber-400"
                          : "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50"
                      }`}
                    >
                      {isCacheBusy
                        ? "Сохраняем..."
                        : purgeClientCache
                          ? "Выключить"
                          : "Включить"}
                    </button>
                    <p className="mt-4 text-xs leading-5 text-zinc-500">
                      {purgeClientCache ? "🟡 Сейчас включено" : "Сейчас выключено"}
                    </p>
                  </div>
                </div>
              </div>

            </section>
          ) : null}

          {activeTab === "analytics" ? (
            <div className="space-y-8">
              <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <article className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-zinc-500">Всего банкетов</p>
                      <div className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950">
                        {isAnalyticsLoading ? "..." : totalParties}
                      </div>
                    </div>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                      <BarChart3 className="h-6 w-6" />
                    </div>
                  </div>
                  <p className="mt-5 text-sm leading-6 text-zinc-600">
                    Общее число созданных мероприятий.
                  </p>
                </article>

                <article className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-zinc-500">Оплачено</p>
                      <div className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950">
                        {isAnalyticsLoading ? "..." : paidParties}
                      </div>
                    </div>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-600">
                      <CircleDollarSign className="h-6 w-6" />
                    </div>
                  </div>
                  <p className="mt-5 text-sm leading-6 text-zinc-600">
                    Количество мероприятий с успешно оплаченной покупкой доступа.
                  </p>
                </article>

                <article className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-zinc-500">Конверсия</p>
                      <div className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950">
                        {isAnalyticsLoading ? "..." : `${paymentConversion}%`}
                      </div>
                    </div>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-100 text-purple-600">
                      <Activity className="h-6 w-6" />
                    </div>
                  </div>
                  <p className="mt-5 text-sm leading-6 text-zinc-600">
                    Доля успешно оплаченных доступов от общего числа созданных мероприятий.
                  </p>
                </article>
              </section>

              <section className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-zinc-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">Analytics Feed</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
                      Журнал активности пользователей
                    </h3>
                  </div>
                  <p className="text-sm text-zinc-500">Последние действия пользователей в сервисе.</p>
                </div>

                {analyticsError ? (
                  <p className="border-b border-zinc-200 px-6 py-4 text-sm text-red-500">{analyticsError}</p>
                ) : null}

                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-zinc-50/80">
                      <tr className="border-b border-zinc-200 text-left text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        <th className="px-6 py-4">Дата и время</th>
                        <th className="px-6 py-4">ID банкета</th>
                        <th className="px-6 py-4">Пользователь</th>
                        <th className="px-6 py-4">Событие</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {stats.recentEvents.length === 0 && !isAnalyticsLoading ? (
                        <tr className="border-b border-zinc-200 last:border-b-0">
                          <td colSpan={4} className="px-6 py-12 text-center text-sm text-zinc-500">
                            Событий пока нет.
                          </td>
                        </tr>
                      ) : null}

                      {isAnalyticsLoading && stats.recentEvents.length === 0 ? (
                        <tr className="border-b border-zinc-200 last:border-b-0">
                          <td colSpan={4} className="px-6 py-12 text-center text-sm text-zinc-500">
                            Загружаем аналитику...
                          </td>
                        </tr>
                      ) : null}

                      {stats.recentEvents.map((event, index) => {
                        const meta = getEventMeta(event.event_type);

                        return (
                          <tr
                            key={`${event.created_at ?? "event"}-${event.party_id ?? index}-${index}`}
                            className="border-b border-zinc-200 last:border-b-0"
                          >
                            <td className="whitespace-nowrap px-6 py-5 text-sm text-zinc-600">
                              {formatDateTime(event.created_at)}
                            </td>
                            <td className="whitespace-nowrap px-6 py-5 text-sm font-semibold text-zinc-900">
                              {shortenPartyId(event.party_id)}
                            </td>
                            <td className="whitespace-nowrap px-6 py-5 text-sm text-zinc-600">
                              {event.user_name?.trim() || "anonymous"}
                            </td>
                            <td className="px-6 py-5 text-sm text-zinc-900">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${meta.className}`}
                              >
                                {meta.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === "purchases" ? (
            <section className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-zinc-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">Purchase History</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
                    История покупок
                  </h3>
                </div>
                <p className="text-sm text-zinc-500">Список успешно оплаченных доступов.</p>
              </div>

              {analyticsError ? (
                <p className="border-b border-zinc-200 px-6 py-4 text-sm text-red-500">{analyticsError}</p>
              ) : null}

              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-zinc-50/80">
                    <tr className="border-b border-zinc-200 text-left text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      <th className="px-6 py-4">Дата создания</th>
                      <th className="px-6 py-4">ID банкета</th>
                      <th className="px-6 py-4">Имя создателя</th>
                      <th className="px-6 py-4">Статус</th>
                      <th className="text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {paidPartyHistory.length === 0 && !isAnalyticsLoading ? (
                      <tr className="border-b border-zinc-200 last:border-b-0">
                        <td colSpan={5} className="px-6 py-12 text-center text-sm text-zinc-500">
                          Оплаченных банкетов пока нет.
                        </td>
                      </tr>
                    ) : null}

                    {isAnalyticsLoading && paidPartyHistory.length === 0 ? (
                      <tr className="border-b border-zinc-200 last:border-b-0">
                        <td colSpan={5} className="px-6 py-12 text-center text-sm text-zinc-500">
                          Загружаем покупки...
                        </td>
                      </tr>
                    ) : null}

                    {paidPartyHistory.map((party, index) => (
                      <tr
                        key={`${party.id ?? "paid-party"}-${index}`}
                        className="border-b border-zinc-200 last:border-b-0"
                      >
                        <td className="whitespace-nowrap px-6 py-5 text-sm text-zinc-600">
                          {formatDateTime(party.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-5 text-sm font-semibold text-zinc-900">
                          {shortenPartyId(party.id)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-5 text-sm text-zinc-600">
                          {getPartyCreatorName(party) ?? "Не указано"}
                        </td>
                        <td className="px-6 py-5 text-sm text-zinc-900">
                          <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-200">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Оплачено
                          </span>
                        </td>
                        <td className="relative p-4 text-right">
                          <button
                            type="button"
                            onClick={() => setOpenMenuId(openMenuId === party.id ? null : party.id ?? null)}
                            className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-black"
                          >
                            •••
                          </button>

                          {openMenuId === party.id && party.id ? (
                            <div className="absolute right-8 top-10 z-10 w-32 overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-xl animate-in fade-in zoom-in-95 duration-100">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setDeleteConfirmId(party.id ?? null);
                                }}
                                className="w-full px-4 py-3 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                              >
                                Удалить
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeTab === "news" ? (
            <section className="space-y-4">
              <div className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-5 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">Контент</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">Новости проекта</h3>
                <p className="mt-2 text-sm text-zinc-500">
                  Показываются на Главной (видимые, свежие сверху). «Скрыть» убирает новость с сайта, не удаляя её.
                </p>
              </div>

              {/* Форма создания / редактирования */}
              <form onSubmit={handleSaveNews} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold text-zinc-900">
                  {newsEditingId ? "Редактирование новости" : "Новая новость"}
                </p>
                <input
                  value={newsTitle}
                  onChange={(e) => setNewsTitle(e.target.value)}
                  placeholder="Заголовок"
                  maxLength={200}
                  className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
                <input
                  value={newsDate}
                  onChange={(e) => setNewsDate(e.target.value)}
                  placeholder="Дата (например: Июль 2026)"
                  maxLength={50}
                  className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
                <textarea
                  value={newsBody}
                  onChange={(e) => setNewsBody(e.target.value)}
                  placeholder="Текст новости (1–2 предложения)"
                  maxLength={1000}
                  rows={3}
                  className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
                {newsError ? <p className="text-sm text-red-600">{newsError}</p> : null}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={newsSaving}
                    className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {newsSaving ? "Сохраняем..." : newsEditingId ? "Сохранить" : "Создать"}
                  </button>
                  {newsEditingId ? (
                    <button
                      type="button"
                      onClick={resetNewsForm}
                      className="rounded-full bg-zinc-100 px-5 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-200"
                    >
                      Отмена
                    </button>
                  ) : null}
                </div>
              </form>

              {/* Список новостей */}
              {newsItems.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500 shadow-sm">
                  Новостей пока нет.
                </div>
              ) : (
                newsItems.map((item) => {
                  const visible = item.is_visible !== false;
                  return (
                    <article
                      key={item.id}
                      className={`rounded-2xl border bg-white p-5 shadow-sm ${visible ? "border-zinc-200" : "border-amber-200 opacity-70"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-zinc-400">{item.date?.trim() || "—"}</p>
                          <p className="font-semibold text-zinc-900">{item.title}</p>
                          <p className="mt-1 text-sm text-zinc-500">{item.body}</p>
                        </div>
                        {!visible ? (
                          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                            Скрыто
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEditNews(item)}
                          className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-700"
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          onClick={() => handleNewsVisibility(item.id, !visible)}
                          disabled={newsBusyId === item.id}
                          className="rounded-full bg-zinc-100 px-4 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200 disabled:opacity-50"
                        >
                          {newsBusyId === item.id ? "..." : visible ? "Скрыть" : "Показать"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteNews(item.id)}
                          disabled={newsBusyId === item.id}
                          className="rounded-full bg-red-50 px-4 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                        >
                          Удалить
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          ) : null}

          {activeTab === "articles" ? (
            <section className="space-y-4">
              <div className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-5 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">Контент</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">Кухонные заметки</h3>
                <p className="mt-2 text-sm text-zinc-500">
                  Статьи на Главной. Подпись у всех — «Команда SmartCook». Публикуются
                  вручную после вычитки: новые (и черновики от ИИ) создаются скрытыми.
                </p>
              </div>

              {/* Генерация черновика */}
              <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50 p-6 shadow-sm">
                <p className="text-sm font-semibold text-violet-900">Сгенерировать черновик (ИИ)</p>
                <p className="text-xs text-violet-700">
                  Опишите тему — ИИ напишет черновик (живой заголовок, 3–5 разделов, 300–600 слов).
                  Черновик сохранится <b>неопубликованным</b>: вычитайте и опубликуйте вручную.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={articleTopic}
                    onChange={(e) => setArticleTopic(e.target.value)}
                    placeholder="Тема, напр.: как не пересолить суп"
                    maxLength={200}
                    disabled={articleGenerating}
                    className="flex-1 rounded-xl border border-violet-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-500 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateDraft}
                    disabled={articleGenerating}
                    className="rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
                  >
                    {articleGenerating ? "Пишем черновик..." : "Сгенерировать черновик"}
                  </button>
                </div>
              </div>

              {/* Форма создания / редактирования */}
              <form ref={articleFormRef} onSubmit={handleSaveArticle} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-zinc-900">
                    {articleEditingId ? "Редактирование заметки" : "Новая заметка"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setArticlePreview((v) => !v)}
                    className="rounded-full bg-zinc-100 px-4 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200"
                  >
                    {articlePreview ? "← Редактировать" : "Предпросмотр"}
                  </button>
                </div>

                {articlePreview ? (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-2xl">{articleEmoji || "📝"}</span>
                      <span className="text-xs font-medium text-zinc-500">Команда SmartCook</span>
                    </div>
                    <h2 className="text-xl font-bold text-zinc-900">{articleTitle || "Заголовок"}</h2>
                    <p className="mt-1 text-sm text-zinc-500">{articleExcerpt}</p>
                    <div
                      className="article-prose mt-4 text-sm text-zinc-800"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(articleBody) }}
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input
                        value={articleEmoji}
                        onChange={(e) => setArticleEmoji(e.target.value)}
                        placeholder="🍲"
                        maxLength={16}
                        className="w-20 rounded-xl border border-zinc-300 px-4 py-2.5 text-center text-lg outline-none focus:border-emerald-500"
                      />
                      <input
                        value={articleTitle}
                        onChange={(e) => setArticleTitle(e.target.value)}
                        placeholder="Заголовок"
                        maxLength={200}
                        className="flex-1 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                      />
                    </div>
                    <input
                      value={articleSlug}
                      onChange={(e) => setArticleSlug(e.target.value)}
                      placeholder="URL-адрес (slug) — оставьте пустым, сгенерируем из заголовка"
                      maxLength={200}
                      className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                    />
                    <textarea
                      value={articleExcerpt}
                      onChange={(e) => setArticleExcerpt(e.target.value)}
                      placeholder="Краткое описание (1–2 предложения — для карточки и ссылок)"
                      maxLength={400}
                      rows={2}
                      className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                    />
                    <textarea
                      value={articleBody}
                      onChange={(e) => setArticleBody(e.target.value)}
                      placeholder="Текст статьи (markdown: ## Подзаголовок, **жирный**, - списки)"
                      maxLength={20000}
                      rows={14}
                      className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 font-mono text-sm outline-none focus:border-emerald-500"
                    />
                  </>
                )}

                {articleError ? <p className="text-sm text-red-600">{articleError}</p> : null}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={articleSaving}
                    className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {articleSaving ? "Сохраняем..." : articleEditingId ? "Сохранить" : "Создать черновик"}
                  </button>
                  {articleEditingId ? (
                    <button
                      type="button"
                      onClick={resetArticleForm}
                      className="rounded-full bg-zinc-100 px-5 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-200"
                    >
                      Отмена
                    </button>
                  ) : null}
                </div>
              </form>

              {/* Список заметок */}
              {articles.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500 shadow-sm">
                  Заметок пока нет.
                </div>
              ) : (
                articles.map((item) => {
                  const published = item.is_published === true;
                  return (
                    <article
                      key={item.id}
                      className={`rounded-2xl border bg-white p-5 shadow-sm ${published ? "border-zinc-200" : "border-amber-200"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-zinc-400">/articles/{item.slug}</p>
                          <p className="font-semibold text-zinc-900">
                            <span className="mr-1">{item.emoji_icon || "📝"}</span>
                            {item.title}
                          </p>
                          <p className="mt-1 text-sm text-zinc-500">{item.excerpt}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                            published
                              ? "bg-green-100 text-green-700 ring-green-200"
                              : "bg-amber-100 text-amber-700 ring-amber-200"
                          }`}
                        >
                          {published ? "Опубликовано" : "Черновик"}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEditArticle(item)}
                          className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-700"
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArticlePublished(item.id, !published)}
                          disabled={articleBusyId === item.id}
                          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                            published
                              ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                              : "bg-emerald-600 text-white hover:bg-emerald-500"
                          }`}
                        >
                          {articleBusyId === item.id ? "..." : published ? "Снять с публикации" : "Опубликовать"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteArticle(item.id)}
                          disabled={articleBusyId === item.id}
                          className="rounded-full bg-red-50 px-4 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                        >
                          Удалить
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          ) : null}

          {activeTab === "ideas" ? (
            <section className="space-y-4">
              <div className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-5 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">Контент</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">Каталог «Идеи»</h3>
                <p className="mt-2 text-sm text-zinc-500">
                  Рецепты раздела «Идеи». Заливаются файлом, публикуются вручную после
                  вычитки: импорт создаёт только черновики и никогда не перезаписывает
                  то, что уже в каталоге. Опубликовать можно только рецепт с готовой
                  картинкой.
                </p>
              </div>

              {ideasMigrationMissing ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
                  Таблица каталога не найдена. Прогоните миграцию{" "}
                  <code className="rounded bg-amber-100 px-1">supabase_idea_recipes.sql</code> в
                  Supabase SQL Editor.
                </div>
              ) : null}

              {ideaError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {ideaError}
                </div>
              ) : null}

              {/* Импорт файла */}
              <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
                <p className="text-sm font-semibold text-emerald-900">Импорт JSON</p>
                <p className="text-xs text-emerald-800">
                  Формат — в <code className="rounded bg-emerald-100 px-1">docs/ideas-import-format.md</code>.
                  До 100 рецептов и 1 МБ за раз. Всё приезжает <b>черновиками</b>; рецепт с уже
                  существующим slug пропускается, а не перезаписывается.
                </p>
                <input
                  type="file"
                  accept="application/json,.json"
                  disabled={ideaImporting}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    // Сбрасываем значение: иначе повторный выбор ТОГО ЖЕ файла
                    // не вызовет onChange, и «импортировать ещё раз» молча не
                    // сработает.
                    e.target.value = "";
                    if (file) void handleImportIdeas(file);
                  }}
                  className="block w-full text-sm text-emerald-900 file:mr-3 file:rounded-full file:border-0 file:bg-emerald-600 file:px-5 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-emerald-500 disabled:opacity-50"
                />
                {ideaImporting ? <p className="text-xs text-emerald-700">Загружаем…</p> : null}
              </div>

              {/* Отчёт импорта */}
              {ideaReport ? (
                <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-zinc-900">Отчёт импорта</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void navigator.clipboard?.writeText(ideaReportAsText(ideaReport))}
                        className="rounded-full bg-zinc-100 px-4 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200"
                      >
                        Скопировать отчёт
                      </button>
                      <button
                        type="button"
                        onClick={() => setIdeaReport(null)}
                        className="rounded-full bg-zinc-100 px-4 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200"
                      >
                        Закрыть
                      </button>
                    </div>
                  </div>

                  <p className="text-sm text-emerald-700">Добавлено: {ideaReport.added.length}</p>
                  {ideaReport.added.length > 0 ? (
                    <ul className="space-y-0.5 text-xs text-zinc-600">
                      {ideaReport.added.map((a) => (
                        <li key={a.slug}>+ {a.title}</li>
                      ))}
                    </ul>
                  ) : null}

                  <p className="text-sm text-amber-700">Пропущено: {ideaReport.skipped.length}</p>
                  {ideaReport.skipped.length > 0 ? (
                    <ul className="space-y-0.5 text-xs text-zinc-600">
                      {ideaReport.skipped.map((s, i) => (
                        <li key={`${s.slug}-${i}`}>
                          <span className="font-mono text-zinc-500">{s.slug}</span> — {s.reason}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {ideaReport.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700">
                      {w}
                    </p>
                  ))}
                </div>
              ) : null}

              {/* Форма правки — только для выбранного рецепта */}
              {ideaEditingId ? (
                <form
                  ref={ideaFormRef}
                  onSubmit={handleSaveIdea}
                  className="space-y-3 rounded-2xl border border-zinc-300 bg-white p-6 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-zinc-900">Правка рецепта</p>
                    <button
                      type="button"
                      onClick={resetIdeaForm}
                      className="rounded-full bg-zinc-100 px-4 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200"
                    >
                      Закрыть
                    </button>
                  </div>

                  {/* Картинка блюда. Вычитка текста без картинки перед глазами
                      неполна: половина решения «годится ли рецепт в ленту» —
                      это как он выглядит. */}
                  {(() => {
                    const current = ideas.find((r) => r.id === ideaEditingId);
                    if (!current?.image_url) return null;
                    return (
                      <img
                        src={current.image_url}
                        alt=""
                        className="w-full max-w-[220px] rounded-xl border border-zinc-200 object-cover"
                      />
                    );
                  })()}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-medium text-zinc-600">
                      Название
                      <input
                        value={ideaForm.title}
                        onChange={(e) => setIdeaForm((f) => ({ ...f, title: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                      />
                    </label>
                    <label className="text-xs font-medium text-zinc-600">
                      slug (адрес /ideas/…)
                      <input
                        value={ideaForm.slug}
                        onChange={(e) => setIdeaForm((f) => ({ ...f, slug: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 font-mono text-sm outline-none focus:border-zinc-900"
                      />
                    </label>
                  </div>

                  <label className="block text-xs font-medium text-zinc-600">
                    Описание (карточка и превью ссылки)
                    <textarea
                      value={ideaForm.description}
                      onChange={(e) => setIdeaForm((f) => ({ ...f, description: e.target.value }))}
                      rows={2}
                      className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-4">
                    <label className="text-xs font-medium text-zinc-600">
                      Порций
                      <input
                        type="number"
                        value={ideaForm.servings}
                        onChange={(e) => setIdeaForm((f) => ({ ...f, servings: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                      />
                    </label>
                    <label className="text-xs font-medium text-zinc-600">
                      Минут
                      <input
                        type="number"
                        value={ideaForm.cooking_time_minutes}
                        onChange={(e) =>
                          setIdeaForm((f) => ({ ...f, cooking_time_minutes: e.target.value }))
                        }
                        className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                      />
                    </label>
                    <label className="text-xs font-medium text-zinc-600">
                      Главный продукт
                      <select
                        value={ideaForm.main_product}
                        onChange={(e) => setIdeaForm((f) => ({ ...f, main_product: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                      >
                        {IDEA_MAIN_PRODUCTS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-zinc-600">
                      Способ (не показывается)
                      <select
                        value={ideaForm.cook_method}
                        onChange={(e) => setIdeaForm((f) => ({ ...f, cook_method: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                      >
                        <option value="">не задан</option>
                        {IDEA_COOK_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="text-xs font-medium text-zinc-600">
                    Приёмы пищи
                    <div className="mt-1 flex flex-wrap gap-2">
                      {IDEA_MEALS.map((meal) => (
                        <button
                          key={meal}
                          type="button"
                          onClick={() => toggleIdeaMeal(meal)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                            ideaForm.meals.includes(meal)
                              ? "bg-zinc-900 text-white"
                              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                          }`}
                        >
                          {meal}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="text-xs font-medium text-zinc-600">
                    Аллергены (только из словаря)
                    <div className="mt-1 flex flex-wrap gap-2">
                      {IDEA_ALLERGENS.map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => toggleIdeaAllergen(a)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                            ideaForm.allergens.includes(a)
                              ? "bg-red-600 text-white"
                              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="block text-xs font-medium text-zinc-600">
                    Ингредиенты — по строке на продукт, «название | количество»
                    <textarea
                      value={ideaForm.ingredients}
                      onChange={(e) => setIdeaForm((f) => ({ ...f, ingredients: e.target.value }))}
                      rows={6}
                      className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 font-mono text-xs outline-none focus:border-zinc-900"
                    />
                  </label>

                  <label className="block text-xs font-medium text-zinc-600">
                    Шаги — по строке на шаг
                    <textarea
                      value={ideaForm.steps}
                      onChange={(e) => setIdeaForm((f) => ({ ...f, steps: e.target.value }))}
                      rows={6}
                      className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-medium text-zinc-600">
                      Теги (через запятую)
                      <input
                        value={ideaForm.tags}
                        onChange={(e) => setIdeaForm((f) => ({ ...f, tags: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                      />
                    </label>
                    <label className="text-xs font-medium text-zinc-600">
                      Семейство (варианты одного блюда)
                      <input
                        value={ideaForm.family}
                        onChange={(e) => setIdeaForm((f) => ({ ...f, family: e.target.value }))}
                        placeholder="syrniki"
                        className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 font-mono text-sm outline-none focus:border-zinc-900"
                      />
                    </label>
                    <label className="text-xs font-medium text-zinc-600">
                      Пропорции картинки
                      <select
                        value={ideaForm.image_aspect}
                        onChange={(e) => setIdeaForm((f) => ({ ...f, image_aspect: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                      >
                        {IDEA_IMAGE_ASPECTS.map((a) => (
                          <option key={a} value={a}>
                            {a === "square" ? "квадрат" : "вертикаль"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-zinc-600">
                      Вес в ленте (больше — выше)
                      <input
                        type="number"
                        value={ideaForm.sort_weight}
                        onChange={(e) => setIdeaForm((f) => ({ ...f, sort_weight: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                      />
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={!!ideaEditingId && ideaBusyId === ideaEditingId}
                    className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
                  >
                    {ideaBusyId === ideaEditingId ? "Сохраняем…" : "Сохранить"}
                  </button>
                </form>
              ) : null}

              {/* Картинки: счётчик и батч */}
              <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-zinc-600">
                  <p className="font-semibold text-zinc-900">Картинки блюд</p>
                  {ideaImages ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      Сегодня израсходовано слотов: {ideaImages.generatedToday} из{" "}
                      {ideaImages.dailyLimit}
                      {" · "}
                      {spentAtMostLabel(ideaImages.generatedToday, ideaImages.costPerImageUsd)}
                      {" · "}модель {ideaImages.model} / {ideaImages.quality}
                      {" · "}≈${ideaImages.costPerImageUsd.toFixed(3)} за картинку
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-zinc-400">Счётчик недоступен</p>
                  )}
                  {ideaBatch ? (
                    <p className="mt-1 text-xs font-semibold text-zinc-700">
                      Батч: {ideaBatch.done} из {ideaBatch.total}
                      {ideaBatch.failed > 0 ? ` · не вышло: ${ideaBatch.failed}` : ""}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleGenerateAllMissing}
                  disabled={ideaBatch !== null || ideaImageBusyId !== null}
                  className="shrink-0 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
                >
                  {ideaBatch ? "Рисуем…" : "Сгенерировать всем без картинки"}
                </button>
              </div>

              {/* Поиск и фильтр */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={ideaSearch}
                  onChange={(e) => setIdeaSearch(e.target.value)}
                  placeholder="Поиск по названию"
                  className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-zinc-900"
                />
                <div className="flex gap-2">
                  {([
                    ["all", "Все"],
                    ["draft", "Черновики"],
                    ["published", "Опубликованные"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setIdeaFilter(value)}
                      className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                        ideaFilter === value
                          ? "bg-zinc-900 text-white"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Список */}
              {ideasLoading ? (
                <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500 shadow-sm">
                  Загружаем каталог…
                </div>
              ) : (
                (() => {
                  const query = ideaSearch.trim().toLowerCase();
                  const visible = ideas.filter((item) => {
                    if (ideaFilter === "draft" && item.is_published) return false;
                    if (ideaFilter === "published" && !item.is_published) return false;
                    if (query && !item.title.toLowerCase().includes(query)) return false;
                    return true;
                  });

                  if (visible.length === 0) {
                    return (
                      <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500 shadow-sm">
                        {ideas.length === 0 ? "Каталог пуст — загрузите файл." : "Ничего не нашлось."}
                      </div>
                    );
                  }

                  return (
                    <>
                      <p className="text-xs text-zinc-400">
                        Показано {visible.length} из {ideas.length}
                      </p>
                      {visible.map((item) => {
                        const published = item.is_published === true;
                        // Статус с поправкой на зависшую генерацию — ровно тот
                        // же расчёт, что на сервере в гейте публикации.
                        const imageStatus = effectiveImageStatus(item.image_status, item.updated_at);
                        const hasImage = imageStatus === "ready" && !!item.image_url;
                        const drawing = imageStatus === "generating";
                        return (
                          <article
                            key={item.id}
                            className={`rounded-2xl border bg-white p-5 shadow-sm ${
                              published ? "border-zinc-200" : "border-amber-200"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              {/* Миниатюра: без неё список из восьмидесяти
                                  строк не даёт понять, у кого картинка уже
                                  есть, а у кого нет. */}
                              {item.image_url ? (
                                <img
                                  src={item.image_url}
                                  alt=""
                                  className="h-16 w-16 shrink-0 rounded-xl border border-zinc-200 object-cover"
                                />
                              ) : (
                                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-zinc-300 text-[10px] text-zinc-400">
                                  нет фото
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-zinc-400">/ideas/{item.slug}</p>
                                <p className="font-semibold text-zinc-900">{item.title}</p>
                                <p className="mt-1 text-xs text-zinc-500">
                                  {item.cooking_time_minutes} мин · {(item.meals ?? []).join(", ")} ·{" "}
                                  {item.main_product}
                                  {(item.allergens ?? []).length > 0
                                    ? ` · аллергены: ${item.allergens.join(", ")}`
                                    : ""}
                                  {item.family ? ` · семейство: ${item.family}` : ""}
                                </p>
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                                    published
                                      ? "bg-green-100 text-green-700 ring-green-200"
                                      : "bg-amber-100 text-amber-700 ring-amber-200"
                                  }`}
                                >
                                  {published ? "Опубликовано" : "Черновик"}
                                </span>
                                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                                  {imageStatus === "ready"
                                    ? "картинка есть"
                                    : imageStatus === "generating"
                                      ? "картинка рисуется"
                                      : imageStatus === "failed"
                                        ? "картинка не вышла"
                                        : "без картинки"}
                                </span>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => startEditIdea(item)}
                                className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-700"
                              >
                                Редактировать
                              </button>
                              {/* Генерация картинки. Разные слова для разных
                                  случаев: «Перерисовать» — это деньги и
                                  подтверждение, «Сгенерировать» — нет. */}
                              <button
                                type="button"
                                onClick={() => handleIdeaImage(item, hasImage)}
                                disabled={ideaImageBusyId !== null || ideaBatch !== null || drawing}
                                className="rounded-full bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
                              >
                                {ideaImageBusyId === item.id
                                  ? "Рисуем…"
                                  : drawing
                                    ? "Рисуется…"
                                    : hasImage
                                      ? "Перерисовать"
                                      : "Сгенерировать"}
                              </button>
                              {/* Гейт публикации: кнопка неактивна без готовой
                                  картинки. Это подсказка, а не защита — то же
                                  правило проверяет сервер. */}
                              <button
                                type="button"
                                onClick={() => handleIdeaPublished(item.id, !published)}
                                disabled={ideaBusyId === item.id || (!published && !hasImage)}
                                title={
                                  !published && !hasImage
                                    ? "Сначала сгенерируйте картинку блюда"
                                    : undefined
                                }
                                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                                  published
                                    ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                                    : "bg-emerald-600 text-white hover:bg-emerald-500"
                                }`}
                              >
                                {ideaBusyId === item.id ? "..." : published ? "Снять с публикации" : "Опубликовать"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteIdea(item.id, item.title)}
                                disabled={ideaBusyId === item.id}
                                className="rounded-full bg-red-50 px-4 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                              >
                                Удалить
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </>
                  );
                })()
              )}
            </section>
          ) : null}

          {activeTab === "tips" ? (
            <section className="space-y-4">
              <div className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-5 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">Контент</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">Совет дня</h3>
                <p className="mt-2 text-sm text-zinc-500">
                  Короткие советы на Главной рядом с «Рецептом дня». Ротация по дате.
                  Публикуются вручную. Сейчас опубликовано: <b>{publishedTipsCount}</b>.
                </p>
              </div>

              {/* Генерация пачки черновиков */}
              <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50 p-6 shadow-sm">
                <p className="text-sm font-semibold text-violet-900">Сгенерировать 20 черновиков (ИИ)</p>
                <p className="text-xs text-violet-700">
                  ИИ напишет 20 коротких проверяемых советов. Все сохранятся <b>неопубликованными</b> —
                  вычитайте и опубликуйте нужные.
                </p>
                <button
                  type="button"
                  onClick={handleGenerateTips}
                  disabled={tipGenerating}
                  className="rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
                >
                  {tipGenerating ? "Генерируем..." : "Сгенерировать 20 черновиков"}
                </button>
                {tipError ? <p className="text-sm text-red-600">{tipError}</p> : null}
              </div>

              {/* Форма создания / редактирования */}
              <form onSubmit={handleSaveTip} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold text-zinc-900">
                  {tipEditingId ? "Редактирование совета" : "Новый совет"}
                </p>
                <div className="flex gap-2">
                  <input
                    value={tipEmoji}
                    onChange={(e) => setTipEmoji(e.target.value)}
                    placeholder="💡"
                    maxLength={16}
                    className="w-20 rounded-xl border border-zinc-300 px-4 py-2.5 text-center text-lg outline-none focus:border-emerald-500"
                  />
                  <textarea
                    value={tipBody}
                    onChange={(e) => setTipBody(e.target.value)}
                    placeholder="Текст совета (1–2 предложения)"
                    maxLength={400}
                    rows={2}
                    className="flex-1 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={tipSaving}
                    className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {tipSaving ? "Сохраняем..." : tipEditingId ? "Сохранить" : "Создать черновик"}
                  </button>
                  {tipEditingId ? (
                    <button
                      type="button"
                      onClick={resetTipForm}
                      className="rounded-full bg-zinc-100 px-5 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-200"
                    >
                      Отмена
                    </button>
                  ) : null}
                </div>
              </form>

              {/* Список советов */}
              {tips.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500 shadow-sm">
                  Советов пока нет.
                </div>
              ) : (
                tips.map((item) => {
                  const published = item.is_published === true;
                  return (
                    <article
                      key={item.id}
                      className={`rounded-2xl border bg-white p-4 shadow-sm ${published ? "border-zinc-200" : "border-amber-200"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-sm text-zinc-800">
                          <span className="mr-1">{item.emoji_icon || "💡"}</span>
                          {item.body}
                        </p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                            published
                              ? "bg-green-100 text-green-700 ring-green-200"
                              : "bg-amber-100 text-amber-700 ring-amber-200"
                          }`}
                        >
                          {published ? "Опубликовано" : "Черновик"}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEditTip(item)}
                          className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-700"
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTipPublished(item.id, !published)}
                          disabled={tipBusyId === item.id}
                          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                            published
                              ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                              : "bg-emerald-600 text-white hover:bg-emerald-500"
                          }`}
                        >
                          {tipBusyId === item.id ? "..." : published ? "Снять с публикации" : "Опубликовать"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTip(item.id)}
                          disabled={tipBusyId === item.id}
                          className="rounded-full bg-red-50 px-4 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                        >
                          Удалить
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          ) : null}

          {activeTab === "feed" ? (
            <section className="space-y-4">
              <div className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-5 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">Премодерация</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
                  Лента сообщества — на модерации ({communityQueue.length})
                </h3>
                <p className="mt-2 text-sm text-zinc-500">
                  Новые посты пользователей. «Одобрить» — пост появляется в ленте; «Отклонить» — остаётся скрытым.
                  То же решение можно принять из Telegram.
                </p>
              </div>

              {communityQueue.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-8 text-center text-sm text-zinc-500 shadow-sm">
                  Постов на модерации нет.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {communityQueue.map((post) => (
                    <article key={post.id} className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={post.photo_url} alt={post.recipe_title || "Блюдо"} className="aspect-square w-full object-cover" />
                      <div className="space-y-1 p-3">
                        <p className="truncate text-sm font-semibold text-zinc-900">{post.recipe_title || "Блюдо"}</p>
                        {post.caption ? <p className="line-clamp-2 text-xs text-zinc-600">{post.caption}</p> : null}
                        <p className="truncate text-xs text-zinc-500">{post.user_name || "Гость"}</p>
                        <p className="text-xs text-zinc-400">{formatDateTime(post.created_at)}</p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleModerateCommunity(post.id, "approve")}
                            disabled={moderatingId === post.id}
                            className="flex-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                          >
                            {moderatingId === post.id ? "..." : "Одобрить"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleModerateCommunity(post.id, "reject")}
                            disabled={moderatingId === post.id}
                            className="flex-1 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                          >
                            {moderatingId === post.id ? "..." : "Отклонить"}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <div className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-5 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">Модерация</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">Витрина «Приготовили сегодня»</h3>
                <p className="mt-2 text-sm text-zinc-500">
                  Фото из витрины на главной. «Скрыть» убирает фото из ленты (is_hidden), «Вернуть» — показывает снова.
                </p>
              </div>

              {feedPhotos.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500 shadow-sm">
                  Фото в ленте пока нет.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {feedPhotos.map((photo) => (
                    <article
                      key={photo.id}
                      className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
                        photo.is_hidden ? "border-red-200 opacity-60" : "border-zinc-200"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.photo_url} alt={photo.recipe_title || "Блюдо"} className="aspect-square w-full object-cover" />
                      <div className="space-y-1 p-3">
                        <p className="truncate text-sm font-semibold text-zinc-900">{photo.recipe_title || "Блюдо"}</p>
                        <p className="truncate text-xs text-zinc-500">{photo.user_name || "Гость"}</p>
                        <p className="text-xs text-zinc-400">{formatDateTime(photo.created_at)}</p>
                        {photo.is_hidden ? (
                          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">
                            Скрыто
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleToggleFeedPhotoHidden(photo.id, !photo.is_hidden)}
                          disabled={hidingPhotoId === photo.id}
                          className={`mt-2 w-full rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                            photo.is_hidden
                              ? "bg-zinc-900 text-white hover:bg-zinc-700"
                              : "bg-red-600 text-white hover:bg-red-500"
                          }`}
                        >
                          {hidingPhotoId === photo.id ? "Сохраняем..." : photo.is_hidden ? "Вернуть" : "Скрыть"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {activeTab === "requests" ? (
            <section className="space-y-4">
              <div className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-5 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">Доступ</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
                  Заявки на восстановление доступа
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Человек забыл и пароль, и код восстановления. Нажми «Выдать код» — мы сгенерируем ему
                  новый код и покажем его здесь <strong>один раз</strong>. Скопируй код и пришли его
                  пользователю в Telegram. Пароль он задаст себе сам, введя код в форме «Забыли пароль»,
                  — мы пароли не придумываем и не пересылаем.
                </p>
              </div>

              {requestsError ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {requestsError}
                </p>
              ) : null}

              {resetRequests.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500 shadow-sm">
                  Заявок пока нет.
                </div>
              ) : null}

              {resetRequests.map((request) => {
                const isNew = (request.status ?? "new") === "new";
                const issuedCode = issuedCodes[request.id];

                return (
                  <article key={request.id} className="rounded-2xl bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1 text-sm text-zinc-500">
                        <p>
                          <span className="font-semibold text-zinc-900">Дата:</span>{" "}
                          {formatDateTime(request.created_at)}
                        </p>
                        <p>
                          <span className="font-semibold text-zinc-900">Логин:</span>{" "}
                          <span className="font-mono font-semibold text-zinc-900">{request.username}</span>
                        </p>
                        <p>
                          <span className="font-semibold text-zinc-900">Telegram:</span>{" "}
                          <span className="font-mono font-semibold text-zinc-900">{request.telegram}</span>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                            isNew
                              ? "bg-amber-100 text-amber-700 ring-amber-200"
                              : "bg-zinc-100 text-zinc-600 ring-zinc-200"
                          }`}
                        >
                          {isNew ? "Новая" : "Закрыта"}
                        </span>

                        <button
                          type="button"
                          onClick={() => void handleIssueRecoveryCode(request.id)}
                          disabled={issuingRequestId === request.id}
                          className="rounded-2xl bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {issuingRequestId === request.id
                            ? "Генерируем..."
                            : issuedCode
                              ? "Выдать код заново"
                              : "Выдать код"}
                        </button>

                        {isNew ? (
                          <button
                            type="button"
                            onClick={() => void handleCloseRequest(request.id)}
                            disabled={closingRequestId === request.id}
                            className="rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {closingRequestId === request.id ? "Закрываем..." : "Закрыть заявку"}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {issuedCode ? (
                      <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
                        <p className="font-semibold">Пришли этот код пользователю в Telegram:</p>
                        <p className="mt-3 font-mono text-xl font-bold tracking-widest text-green-900">
                          {issuedCode}
                        </p>
                        <p className="mt-3 leading-6 text-green-700">
                          Дальше он открывает «Войти → Забыли пароль», вводит свой логин, этот код и
                          придумывает новый пароль. Старый код этого пользователя больше не работает.
                          Код виден только сейчас — в базе хранится лишь его хеш.
                        </p>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          ) : null}

          {activeTab === "errors" ? (
            <section className="space-y-4">
              <div className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-5 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">Debug</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">Сообщения об ошибках</h3>
                <p className="mt-2 text-sm text-zinc-500">
                  Баг-репорты от пользователей с автоматически собранным техническим контекстом.
                </p>
              </div>

              {errorsError ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {errorsError}
                </p>
              ) : null}

              {errorReports.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500 shadow-sm">
                  Репортов пока нет.
                </div>
              ) : null}

              {errorReports.map((report) => {
                const isNew = (report.status ?? "new") === "new";
                const isDev = isDevReport(report);

                return (
                  <article
                    key={report.id}
                    className={`mb-4 rounded-2xl p-6 shadow-sm ${isDev ? "bg-zinc-100" : "bg-white"}`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1 text-sm text-zinc-500">
                        <p>
                          <span className="font-semibold text-zinc-900">Дата:</span> {formatDateTime(report.created_at)}
                        </p>
                        <p className="break-all">
                          <span className="font-semibold text-zinc-900">URL:</span> {report.url?.trim() || "—"}
                        </p>
                        <p>
                          <span className="font-semibold text-zinc-900">Режим:</span> {report.display_mode?.trim() || "—"}
                          {report.viewport?.trim() ? ` · ${report.viewport.trim()}` : ""}
                          {report.app_version?.trim() ? ` · v${report.app_version.trim()}` : ""}
                        </p>
                        <p>
                          <span className="font-semibold text-zinc-900">Контакт:</span> {report.contact?.trim() || "не указан"}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        {isDev ? (
                          <span
                            title="Репорт со стенда разработки (localhost), а не от пользователя. В счётчик не идёт."
                            className="inline-flex rounded-full bg-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-300"
                          >
                            DEV
                          </span>
                        ) : null}
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                            isNew
                              ? "bg-amber-100 text-amber-700 ring-amber-200"
                              : "bg-zinc-100 text-zinc-600 ring-zinc-200"
                          }`}
                        >
                          {isNew ? "Новый" : "Просмотрен"}
                        </span>
                        {isNew ? (
                          <button
                            type="button"
                            onClick={() => void handleMarkReportViewed(report.id)}
                            disabled={markingReportId === report.id}
                            className="rounded-2xl bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {markingReportId === report.id ? "Сохраняем..." : "Пометить просмотренным"}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <p className="mt-4 whitespace-pre-wrap text-base font-medium text-zinc-950">
                      {report.message?.trim() || "Текст репорта отсутствует."}
                    </p>
                  </article>
                );
              })}
            </section>
          ) : null}

          {activeTab === "suggestions" ? (
            <section className="space-y-4">
              <div className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-5 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">Обратная связь</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">Предложения пользователей</h3>
                <p className="mt-2 text-sm text-zinc-500">
                  Что добавить, что убрать и что не работает. Приходит с карточки на Главной
                  и из личного кабинета, копия дублируется в Telegram. Личность автора не
                  раскрывается — виден только тип (аккаунт/гость) и хвост идентификатора.
                </p>
              </div>

              {!suggestionsTableReady ? (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  Не прогнана миграция <span className="font-mono">supabase_suggestions.sql</span> —
                  таблица предложений ещё не создана.
                </p>
              ) : null}

              {suggestionsError ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {suggestionsError}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {([["all", "Все"], ["new", "Новые"], ["in_progress", "В работе"], ["done", "Сделано"], ["rejected", "Отклонённые"]] as const).map(
                  ([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSuggestionsFilter(value as SuggestionStatus | "all")}
                      className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                        suggestionsFilter === value
                          ? "bg-black text-white"
                          : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                      }`}
                    >
                      {label}
                      {value === "new" && suggestionsNewCount > 0 ? ` (${suggestionsNewCount})` : ""}
                    </button>
                  ),
                )}
              </div>

              {suggestionsLoading ? (
                <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500 shadow-sm">
                  Загружаем предложения...
                </div>
              ) : null}

              {!suggestionsLoading && suggestions !== null && suggestions.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500 shadow-sm">
                  {suggestionsFilter === "all" ? "Предложений пока нет." : "В этом статусе пусто."}
                </div>
              ) : null}

              {(suggestions ?? []).map((item) => {
                const kindBadge = SUGGESTION_KIND_BADGE[item.kind] ?? {
                  text: item.kind,
                  cls: "bg-zinc-100 text-zinc-600 ring-zinc-200",
                };
                const isActing = actingSuggestionId === item.id;
                const draft = suggestionNoteDrafts[item.id] ?? item.adminNote ?? "";
                const noteChanged = draft.trim() !== (item.adminNote ?? "").trim();

                return (
                  <article
                    key={item.id}
                    className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${kindBadge.cls}`}
                      >
                        {kindBadge.text}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
                        {SUGGESTION_STATUS_LABEL[item.status as SuggestionStatus] ?? item.status}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {new Date(item.createdAt).toLocaleString("ru-RU")}
                      </span>
                      <span className="text-xs text-zinc-400">
                        · {item.author.kind === "user" ? "аккаунт" : "гость"} …{item.author.short}
                      </span>
                    </div>

                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
                      {item.text}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {(["new", "in_progress", "done", "rejected"] as SuggestionStatus[]).map((status) => (
                        <button
                          key={status}
                          type="button"
                          disabled={isActing || item.status === status}
                          onClick={() => void handleSuggestionPatch(item.id, { status })}
                          className={`rounded-2xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${
                            item.status === status
                              ? "bg-zinc-100 text-zinc-400"
                              : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                          }`}
                        >
                          {SUGGESTION_STATUS_LABEL[status]}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4">
                      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                        Заметка
                      </label>
                      <textarea
                        value={draft}
                        rows={2}
                        placeholder="Для себя: что решили, куда положили в план…"
                        onChange={(e) =>
                          setSuggestionNoteDrafts((current) => ({ ...current, [item.id]: e.target.value }))
                        }
                        className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm text-zinc-800 outline-none focus:border-zinc-400"
                      />
                      <button
                        type="button"
                        disabled={isActing || !noteChanged}
                        onClick={() => void handleSuggestionPatch(item.id, { adminNote: draft })}
                        className="mt-2 rounded-2xl bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isActing ? "Сохраняем..." : "Сохранить заметку"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          ) : null}

          {activeTab === "reports" ? (
            <section className="space-y-4">
              <div className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-5 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">Модерация</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">Жалобы на посты ленты</h3>
                <p className="mt-2 text-sm text-zinc-500">
                  Жалобы пользователей на публикации в ленте сообщества. Открытые — сверху.
                  Пост скрывается автоматически после 3 жалоб; здесь можно скрыть раньше или
                  отклонить жалобу. Личность жалобщика не раскрывается.
                </p>
              </div>

              {!reportsStatusColumnReady ? (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  Не прогнана миграция <span className="font-mono">supabase_community_post_reports_status.sql</span> —
                  статус «отклонена» недоступен. Остальное работает.
                </p>
              ) : null}

              {reportsError ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {reportsError}
                </p>
              ) : null}

              {reportsLoading ? (
                <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500 shadow-sm">
                  Загружаем жалобы...
                </div>
              ) : null}

              {!reportsLoading && reports !== null && reports.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500 shadow-sm">
                  Жалоб пока нет.
                </div>
              ) : null}

              {(reports ?? []).map((report) => {
                const badge =
                  report.state === "open"
                    ? { text: "Открыта", cls: "bg-amber-100 text-amber-700 ring-amber-200" }
                    : report.state === "hidden"
                      ? { text: "Пост скрыт", cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" }
                      : report.state === "dismissed"
                        ? { text: "Отклонена", cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" }
                        : { text: "Пост удалён", cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" };
                const isActing = actingReportId === report.id;

                return (
                  <article key={report.id} className="mb-4 rounded-2xl bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 gap-4">
                        {report.post ? (
                          <img
                            src={report.post.photoUrl}
                            alt={report.post.title || "Блюдо"}
                            loading="lazy"
                            className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-zinc-200"
                          />
                        ) : (
                          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-2xl ring-1 ring-zinc-200">
                            🗑️
                          </div>
                        )}

                        <div className="min-w-0 space-y-1 text-sm text-zinc-500">
                          <p className="truncate text-base font-semibold text-zinc-950">
                            {report.post?.title || "Блюдо без названия"}
                          </p>
                          <p>
                            <span className="font-semibold text-zinc-900">Автор поста:</span>{" "}
                            {report.post?.author || "—"}
                          </p>
                          <p>
                            <span className="font-semibold text-zinc-900">Дата жалобы:</span>{" "}
                            {formatDateTime(report.createdAt)}
                          </p>
                          <p>
                            <span className="font-semibold text-zinc-900">Пожаловался:</span>{" "}
                            {report.reporter.kind === "user" ? "аккаунт" : "гость"} ····{report.reporter.short}
                          </p>
                          <p>
                            <span className="font-semibold text-zinc-900">Причина:</span>{" "}
                            {report.reason?.trim() || "не указана"}
                          </p>
                          <p>
                            <span className="font-semibold text-zinc-900">Жалоб на пост:</span>{" "}
                            {report.reportsOnPost}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${badge.cls}`}>
                          {badge.text}
                        </span>

                        <div className="flex flex-wrap gap-2">
                          {report.post ? (
                            <a
                              href={report.post.photoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                            >
                              Открыть пост
                            </a>
                          ) : null}
                          {report.post?.recipeId ? (
                            <a
                              href={`/recipe/${report.post.recipeId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                            >
                              К рецепту
                            </a>
                          ) : null}
                          {report.state === "open" && report.post ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleHideReportedPost(report.id, report.post!.id)}
                                disabled={isActing}
                                className="rounded-2xl bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isActing ? "Сохраняем..." : "Скрыть пост"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDismissReport(report.id)}
                                disabled={isActing}
                                className="rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Отклонить жалобу
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          ) : null}

          {activeTab === "images" ? (
            <section className="space-y-4">
              <div className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-5 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">AI</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">Картинки блюд</h3>
                <p className="mt-2 text-sm text-zinc-500">
                  Генерация ИИ-картинок к рецептам. Запуск только отсюда (контроль расходов).
                  Порядок: популярные → новые. Рецепт дня в список не входит (он эфемерный).
                </p>
              </div>

              {imagesError ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {imagesError}
                </p>
              ) : null}

              {imagesLoading && !imagesStatus ? (
                <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500 shadow-sm">
                  Загрузка…
                </div>
              ) : null}

              {imagesStatus ? (
                <>
                  <div className="rounded-2xl bg-white p-6 shadow-sm">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                      <div>
                        <p className="text-sm text-zinc-500">Блюд с картинкой</p>
                        <p className="text-3xl font-semibold tracking-tight text-zinc-950">
                          {imagesStatus.dishesWithImageCount}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void loadImages()}
                        disabled={imagesLoading || batchRunning}
                        className="rounded-2xl bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-200 disabled:opacity-50"
                      >
                        Обновить
                      </button>
                    </div>

                    <div className="mt-6 flex flex-wrap items-end gap-4 border-t border-zinc-100 pt-6">
                      <label className="flex flex-col gap-1 text-sm text-zinc-600">
                        Сколько сгенерировать (макс. {imagesStatus.maxBatch})
                        <input
                          type="number"
                          min={1}
                          max={imagesStatus.maxBatch}
                          value={batchN}
                          onChange={(e) => {
                            const v = Math.round(Number(e.target.value) || 0);
                            setBatchN(Math.min(imagesStatus.maxBatch, Math.max(1, v)));
                          }}
                          disabled={batchRunning}
                          className="w-28 rounded-xl border border-zinc-200 px-3 py-2 text-base text-zinc-900 disabled:opacity-50"
                        />
                      </label>
                      <div className="text-sm text-zinc-500">
                        Примерная стоимость запуска:{" "}
                        <span className="font-semibold text-zinc-900">
                          ~${(Math.min(batchN, imagesStatus.candidates.length) * imagesStatus.costPerImageUsd).toFixed(2)}
                        </span>
                        <span className="text-zinc-400">
                          {" "}
                          (~${imagesStatus.costPerImageUsd.toFixed(2)} за картинку)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void runBatch()}
                        disabled={batchRunning || imagesStatus.candidates.length === 0}
                        className="rounded-2xl bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {batchRunning
                          ? `Генерация… ${batchProgress?.done ?? 0}/${batchProgress?.total ?? 0}`
                          : `Сгенерировать для топ-${Math.min(batchN, imagesStatus.candidates.length)} без картинки`}
                      </button>
                    </div>

                    {batchResult ? (
                      <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-100">
                        Готово. Успешно: <span className="font-semibold">{batchResult.ok}</span>, ошибок:{" "}
                        <span className="font-semibold">{batchResult.failed}</span>
                        {batchResult.failed > 0 ? " (детали — во вкладке «Ошибки»)" : ""}.
                      </p>
                    ) : null}
                  </div>

                  {(() => {
                    const q = gallerySearch.trim().toLowerCase();
                    const items = imagesStatus.gallery.filter((it) => {
                      if (q && !it.title.toLowerCase().includes(q)) return false;
                      if (galleryFilter === "no-image") return !it.image_url;
                      if (galleryFilter === "error") return it.status === "failed";
                      return true;
                    });
                    const statusLabel: Record<ImageStatusValue, string> = {
                      ready: "готово",
                      generating: "генерится",
                      failed: "ошибка",
                      none: "нет картинки",
                    };
                    const statusClass: Record<ImageStatusValue, string> = {
                      ready: "bg-emerald-50 text-emerald-700",
                      generating: "bg-amber-50 text-amber-700",
                      failed: "bg-red-50 text-red-700",
                      none: "bg-zinc-100 text-zinc-500",
                    };
                    return (
                      <div className="rounded-2xl bg-white p-6 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h4 className="text-lg font-semibold text-zinc-950">
                            Галерея ИИ-картинок
                            <span className="ml-2 text-sm font-normal text-zinc-400">
                              рецепты + блюда из кэша ({items.length})
                            </span>
                          </h4>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              value={gallerySearch}
                              onChange={(e) => setGallerySearch(e.target.value)}
                              placeholder="Поиск по названию…"
                              className="w-52 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
                            />
                            <div className="inline-flex overflow-hidden rounded-xl border border-zinc-200">
                              {([
                                ["all", "Все"],
                                ["no-image", "Без картинки"],
                                ["error", "С ошибкой"],
                              ] as [typeof galleryFilter, string][]).map(([val, label]) => (
                                <button
                                  key={val}
                                  type="button"
                                  onClick={() => setGalleryFilter(val)}
                                  className={
                                    "px-3 py-2 text-sm font-medium transition " +
                                    (galleryFilter === val
                                      ? "bg-black text-white"
                                      : "bg-white text-zinc-600 hover:bg-zinc-100")
                                  }
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {items.length === 0 ? (
                          <p className="mt-4 text-sm text-zinc-500">Ничего не найдено под текущий фильтр/поиск.</p>
                        ) : (
                          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                            {items.map((it) => {
                              const key = `${it.source}:${it.id}`;
                              return (
                                <div key={key} className="overflow-hidden rounded-xl border border-zinc-200">
                                  {it.image_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={it.image_url}
                                      alt={it.title}
                                      loading="lazy"
                                      className="aspect-[16/10] w-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex aspect-[16/10] w-full items-center justify-center bg-zinc-50 text-xs text-zinc-400">
                                      {it.status === "generating" ? "генерится…" : "нет картинки"}
                                    </div>
                                  )}
                                  <div className="p-2">
                                    <p className="truncate text-xs text-zinc-700" title={it.title}>
                                      {it.title || "без названия"}
                                    </p>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                                        {it.source === "recipe" ? "рецепт" : "блюдо из кэша"}
                                      </span>
                                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass[it.status]}`}>
                                        {statusLabel[it.status]}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => void regenerateItem(it)}
                                      disabled={regenKey !== null || batchRunning}
                                      className="mt-2 w-full rounded-lg bg-zinc-100 px-2 py-1.5 text-xs font-medium text-zinc-800 transition hover:bg-zinc-200 disabled:opacity-50"
                                    >
                                      {regenKey === key ? "Генерация…" : "Перегенерировать"}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              ) : null}
            </section>
          ) : null}

          {activeTab === "warmup" ? (
            (() => {
              const dishCount = parseWarmupDishes(warmupText).length;
              const willRun = Math.min(dishCount, WARMUP_MAX);
              return (
                <section className="space-y-4">
                  <div className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-5 shadow-sm">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">Кэш</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">Прогрев кэша блюд</h3>
                    <p className="mt-2 text-sm text-zinc-500">
                      Список блюд по одному в строке (максимум {WARMUP_MAX} за запуск). Для каждого:
                      нормализуем запрос, и если блюда ещё нет в кэше — генерируем рецепт (вариант 1)
                      и картинку. Уже прогретые блюда пропускаются (бюджет не тратится).
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white p-6 shadow-sm">
                    <label className="flex flex-col gap-2 text-sm text-zinc-600">
                      Блюда (по одному в строке)
                      <textarea
                        value={warmupText}
                        onChange={(e) => setWarmupText(e.target.value)}
                        disabled={warmupRunning}
                        rows={10}
                        placeholder={"борщ\nпаста карбонара\nсырники\nплов"}
                        className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-base text-zinc-900 disabled:opacity-50"
                      />
                    </label>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                      <div className="text-sm text-zinc-500">
                        Будет обработано:{" "}
                        <span className="font-semibold text-zinc-900">{willRun}</span>
                        {dishCount > WARMUP_MAX ? (
                          <span className="text-amber-600"> (лишние {dishCount - WARMUP_MAX} обрежутся)</span>
                        ) : null}
                        {" · "}Примерная стоимость:{" "}
                        <span className="font-semibold text-zinc-900">
                          ~${(willRun * warmupCostPerImage).toFixed(2)}
                        </span>
                        <span className="text-zinc-400"> (~${warmupCostPerImage.toFixed(2)} за картинку)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void runWarmup()}
                        disabled={warmupRunning || willRun === 0}
                        className="rounded-2xl bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {warmupRunning
                          ? `Прогрев… ${warmupProgress?.done ?? 0}/${warmupProgress?.total ?? 0}`
                          : `Прогреть (${willRun})`}
                      </button>
                    </div>

                    {warmupResult ? (
                      <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-100">
                        Готово. Прогрето: <span className="font-semibold">{warmupResult.ok}</span>,
                        пропущено (уже в кэше): <span className="font-semibold">{warmupResult.skipped}</span>,
                        ошибок: <span className="font-semibold">{warmupResult.failed}</span>
                        {warmupResult.failed > 0 ? " (детали — во вкладке «Ошибки»)" : ""}.
                      </p>
                    ) : null}
                  </div>
                </section>
              );
            })()
          ) : null}

          {deleteConfirmId ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
              <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                <h3 className="mb-2 text-xl font-bold text-black">Удалить банкет?</h3>
                <p className="mb-6 text-sm text-zinc-500">
                  Это действие нельзя отменить. Банкет, а также вся его аналитика, меню и чат
                  будут удалены навсегда.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(null)}
                    className="flex-1 rounded-xl bg-zinc-100 p-3 font-medium text-black transition-colors hover:bg-zinc-200"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteParty}
                    disabled={isDeleting}
                    className="flex-1 rounded-xl bg-red-600 p-3 font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {isDeleting ? "Удаление..." : "Удалить"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
