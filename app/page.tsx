"use client";

import { useState, useEffect, useRef, ChangeEvent } from "react";
import { supabase } from "@/lib/supabase";
import { Menu, X, Flame, Search, CheckCircle, Sparkles, Globe, User, Store, PartyPopper, Settings, Code2, Clipboard } from "lucide-react";

import type { AnalysisData, RecipeData, DBRecipe, DailyRecipeType, HolidayType, DBComment } from "@/lib/types";
import { DEVELOPER_ID, scaleAmount, formatCooks, cleanText, formatTime, formatCalories, getCroppedImg } from "@/lib/utils";
import { shareOrCopy } from "@/lib/share";
import { reachGoal } from "@/lib/metrika";
import { claimGuestPartiesToAccount } from "@/lib/claimParties";
import { FEATURE_RESTAURANT_GAME } from "@/lib/features";
import { USERNAME_MIN, USERNAME_MAX, PASSWORD_MIN, normalizeUsername } from "@/components/modals/AuthModal";
import InstallPromptCard from "@/components/InstallPromptCard";

import Profile from "@/components/Profile";
import DailyRecipe from "@/components/DailyRecipe";
import Feed from "@/components/Feed";
import Game from "@/components/Game";
import About from "@/components/About";
import ServiceView from "@/components/ServiceView";

import FullScreenImage from "@/components/modals/FullScreenImage";
import CropperModal from "@/components/modals/CropperModal";
import CommentsModal from "@/components/modals/CommentsModal";
import AuthModal from "@/components/modals/AuthModal";
import EditProfileModal from "@/components/modals/EditProfileModal";
import PreferencesModal from "@/components/modals/PreferencesModal";

export default function Home() {
  const [activeView, setActiveView] = useState<'service' | 'about' | 'daily' | 'feed' | 'profile' | 'game'>('service');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [dailyRecipe, setDailyRecipe] = useState<DailyRecipeType | null>(null);
  const [dailyError, setDailyError] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<'photo' | 'text'>('photo');
  const [textQuery, setTextQuery] = useState(""); 
  const [cookingMode, setCookingMode] = useState<'strict' | 'extended'>('strict');
  
  const [allergies, setAllergies] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false);
  const [newAllergy, setNewAllergy] = useState("");
  const [newDislike, setNewDislike] = useState("");

  const [isProcessing, setIsProcessing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false); 
  const [analysisResult, setAnalysisResult] = useState<AnalysisData | null>(null);
  const [selectedDish, setSelectedDish] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<RecipeData | null>(null);
  
  const [feed, setFeed] = useState<DBRecipe[]>([]); 
  const [feedTab, setFeedTab] = useState<'photos' | 'recipes'>('photos');
  const [photosFeed, setPhotosFeed] = useState<any[]>([]);
  const [photosSort, setPhotosSort] = useState<'new' | 'top' | 'old'>('new');
  const [userLevels, setUserLevels] = useState<Record<string, number>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'favorites'>('all');
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const [fromFeed, setFromFeed] = useState<'recipes' | 'photos' | 'profile_history' | 'profile_favorites' | false>(false);
  const [isHistoryView, setIsHistoryView] = useState(false);
  const [isSharedView, setIsSharedView] = useState(false);
  const [currentHoliday, setCurrentHoliday] = useState<HolidayType | null>(null);
  const [dailyFavoriteId, setDailyFavoriteId] = useState<number | null>(null);
  const [servings, setServings] = useState<number | "">(1);

  const [user, setUser] = useState<any>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [userPhotoFile, setUserPhotoFile] = useState<File | null>(null);
  const [userPhotoPreview, setUserPhotoPreview] = useState<string | null>(null);
  const [userComment, setUserComment] = useState("");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [profileView, setProfileView] = useState<'main' | 'favorites' | 'photos' | 'history'>('main');
  const [userPhotos, setUserPhotos] = useState<any[]>([]);

  const [commentsModalPostId, setCommentsModalPostId] = useState<number | null>(null);
  const [postComments, setPostComments] = useState<DBComment[]>([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [replyingTo, setReplyingTo] = useState<{id: number, name: string} | null>(null);
  const [scrollToPostId, setScrollToPostId] = useState<number | null>(null);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isStandaloneUploadOpen, setIsStandaloneUploadOpen] = useState(false);
  const [standaloneTitle, setStandaloneTitle] = useState("");

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfileName, setEditProfileName] = useState("");
  const [editUsername, setEditUsername] = useState(""); 
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [isCropping, setIsCropping] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const [cooks, setCooks] = useState<number>(0);
  const [energy, setEnergy] = useState<number>(500);
  const [clickPower, setClickPower] = useState<number>(1);
  const [passiveIncome, setPassiveIncome] = useState<number>(0);
  const [restaurantLevel, setRestaurantLevel] = useState<number>(1);
  const [gameTab, setGameTab] = useState<'kitchen' | 'tasks' | 'shop' | 'leaderboard'>('kitchen');
  const [floatingClicks, setFloatingClicks] = useState<{id: number, x: number, y: number, val: number}[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  const [showInstallCard, setShowInstallCard] = useState(false);

  const [toast, setToast] = useState<{ message: string; icon?: React.ReactNode; type?: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, icon?: React.ReactNode, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, icon, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
  };

  // Прикрепляем токен сессии к AI-запросам, чтобы бэкенд мог считать лимит
  // генераций по аккаунту, а не только по IP.
  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  // Если сервер ответил 429 — лимит генераций исчерпан. Показываем дружелюбное
  // сообщение вместо технической ошибки и не даём коду идти в catch как "Ошибка: ...".
  const handleRateLimitedResponse = (response: Response, json: any): boolean => {
    if (response.status === 429) {
      showToast(json?.error || "Вы сгенерировали максимум на сегодня. Возвращайтесь завтра!", undefined, 'error');
      return true;
    }
    return false;
  };

  // === ВСЕ ВАЖНЫЕ ФУНКЦИИ ИГРЫ ===
  const getRestaurantCost = (lvl: number) => {
    // Новые цены от Артема: 1->2: 10k, 2->3: 50k, 3->4: 200k, 4->5: 600k, 5->6: 1.5m
    const costs = [0, 10000, 50000, 200000, 600000, 1500000];
    return costs[lvl] || 99999999;
  };

  // Множитель = Уровень ресторана
  const maxEnergy = restaurantLevel * 500;
  const actualClickPower = clickPower * restaurantLevel;
  const actualPassiveIncome = passiveIncome * restaurantLevel;

  const buyUpgrade = (type: string) => {
    if (type === 'spatula') {
      const cost = clickPower * 500;
      if (cooks >= cost) { setCooks(prev => prev - cost); setClickPower(prev => prev + 1); }
    } else if (type === 'souschef') {
      const cost = (passiveIncome + 1) * 2000;
      if (cooks >= cost) { setCooks(prev => prev - cost); setPassiveIncome(prev => prev + 1); }
    } else if (type === 'restaurant') {
      const cost = getRestaurantCost(restaurantLevel);
      if (cooks >= cost && restaurantLevel < 6) { 
        setCooks(prev => prev - cost); 
        setRestaurantLevel(prev => prev + 1); 
      }
    }
  };

  const handleCookClick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (energy > 0) {
      setCooks(prev => prev + actualClickPower); 
      setEnergy(prev => prev - 1);
      const rect = e.currentTarget.getBoundingClientRect();
      const id = Date.now() + Math.random();
      setFloatingClicks(prev => [...prev, { id, x: e.clientX - rect.left, y: e.clientY - rect.top, val: actualClickPower }]);
      setTimeout(() => { setFloatingClicks(prev => prev.filter(c => c.id !== id)); }, 800);
    }
  };

  const getUserBadges = (uid: string | undefined | null, level?: number, isDevOverride?: boolean) => {
    const isDev = isDevOverride !== undefined ? isDevOverride : uid === DEVELOPER_ID;
    const safeLevel = level || 1;
    const titles = ['Ларёк', 'Закусочная', 'Кафе', 'Ресторан', 'Мишленовский ресторан', 'Сеть ресторанов'];

    // Бэйдж уровня ресторана — игровой, скрыт за фиче-флагом (этап 4.2).
    const restBadge = FEATURE_RESTAURANT_GAME
      ? <span key="rest" style={{fontSize: 'var(--font-size-caption)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-full)', fontWeight: 'var(--font-weight-semibold)', display: 'inline-flex', alignItems: 'center', lineHeight: 1}}>{titles[Math.min(safeLevel - 1, 5)]}</span>
      : null;
    const devBadge = isDev ? <span key="dev" style={{fontSize: 'var(--font-size-caption)', background: 'var(--color-text)', color: 'white', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-full)', fontWeight: 'var(--font-weight-semibold)', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', lineHeight: 1}}><Code2 size={12} /> Разработчик</span> : null;

    return { isDev, devBadge, restBadge };
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      if (session?.user?.user_metadata) { setAllergies(session.user.user_metadata.allergies || []); setDislikes(session.user.user_metadata.dislikes || []); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user?.user_metadata) { setAllergies(session.user.user_metadata.allergies || []); setDislikes(session.user.user_metadata.dislikes || []); }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Профиль вкуса для анонимов: подтягиваем из localStorage на старте.
  // Если пользователь залогинен — метаданные аккаунта перезапишут это позже.
  useEffect(() => {
    try {
      const a = JSON.parse(localStorage.getItem("sc_allergies") || "[]");
      const d = JSON.parse(localStorage.getItem("sc_dislikes") || "[]");
      if (Array.isArray(a) && a.length) setAllergies(a);
      if (Array.isArray(d) && d.length) setDislikes(d);
    } catch {}
  }, []);

  useEffect(() => {
    let currentSessionId = localStorage.getItem("cook_user_id");
    if (user) {
      currentSessionId = user.id; localStorage.setItem("cook_user_id", user.id);
      setEditProfileName(user.user_metadata?.full_name || ""); 
      setEditAvatarPreview(user.user_metadata?.avatar_url || null);
      setEditUsername(user.user_metadata?.username || user.email?.split('@')[0] || ""); 
    } else if (!currentSessionId) {
      currentSessionId = "user_" + Math.random().toString(36).substr(2, 9); localStorage.setItem("cook_user_id", currentSessionId); 
    }
    setUserId(currentSessionId); if (currentSessionId) fetchMyRecipes(currentSessionId); 
  }, [user]);

  useEffect(() => {
    if (activeView === 'profile' && user) {
      supabase.from('feed_posts').select('*, recipes(title)').eq('user_id', user.id).order('created_at', { ascending: false }).then(({data, error}) => { if (!error && data) setUserPhotos(data); });
    }
  }, [activeView, user]);

  const loadDailyRecipe = () => {
    setDailyError(false);
    fetch('/api/daily').then(res => res.json()).then(json => {
        const data = json.data || json.recipe || json;
        if (data && data.title && !data.error && !json.error) setDailyRecipe(data); else setDailyError(true);
      }).catch(() => setDailyError(true));
  };

  useEffect(() => {
    loadDailyRecipe();
    const d = new Date(); const key = `${d.getDate()}.${d.getMonth() + 1}`;
    const holidays: Record<string, HolidayType> = {
      "14.2": { title: "С Днем святого Валентина! 💖", text: "Пусть ваша жизнь будет наполнена любовью, а ужины — романтикой.", gradient: "linear-gradient(135deg, #ec4899 0%, #be185d 100%)", icon: "💘" },
      "8.3": { title: "С 8 Марта! 💐", text: "Красоты, нежности и вдохновения! Пусть сегодня готовит кто-то другой.", gradient: "linear-gradient(135deg, #d946ef 0%, #a21caf 100%)", icon: "🌷" },
      "31.12": { title: "С Наступающим! 🎄", text: "Оливье готов? Мандарины куплены?", gradient: "linear-gradient(135deg, #dc2626 0%, #166534 100%)", icon: "🎅" },
      "1.1": { title: "С Новым 2026 годом! 🎉", text: "Начинаем год вкусно!", gradient: "linear-gradient(135deg, #fbbf24 0%, #b45309 100%)", icon: "🥂" }
    };
    if (holidays[key]) setCurrentHoliday(holidays[key]);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('recipeId')) loadSharedRecipe(params.get('recipeId')!);
      else if (params.get('daily') === 'true') { setActiveView('daily'); window.history.replaceState({}, '', '/'); }
      // Открыть регистрацию из баннера банкетов (?auth=register|login).
      const authParam = params.get('auth');
      if (authParam === 'register' || authParam === 'login') {
        setAuthMode(authParam);
        setActiveView('profile');
        setIsAuthModalOpen(true);
        window.history.replaceState({}, '', '/');
      }
    }
  }, []);

  useEffect(() => { if (activeView === 'feed') fetchPhotosFeed(photosSort); }, [activeView, photosSort]);

  useEffect(() => {
    if (!FEATURE_RESTAURANT_GAME) return; // игровые уровни скрыты (этап 4.2)
    const uids = new Set<string>();
    photosFeed.forEach(p => { if (p.user_id) uids.add(p.user_id); });
    postComments.forEach(c => { if (c.user_id) uids.add(c.user_id); });
    if (uids.size > 0) {
      // Узкое публичное view (только user_id + restaurant_level) — см. supabase_game_progress_rls.sql
      supabase.from('game_public_levels').select('user_id, restaurant_level').in('user_id', Array.from(uids)).then(({data, error}) => {
          if (data && !error) { const levels: Record<string, number> = {}; data.forEach(d => levels[d.user_id] = d.restaurant_level); setUserLevels(prev => ({...prev, ...levels})); }
        });
    }
  }, [photosFeed, postComments]);

  useEffect(() => {
    if (!FEATURE_RESTAURANT_GAME) return; // прогресс игры не грузим (этап 4.2)
    if (user) {
      supabase.from('game_progress').select('*').eq('user_id', user.id).single()
      .then(({data, error}) => {
        const localC = Number(localStorage.getItem('sc_cooks') || 0);
        const localP = Number(localStorage.getItem('sc_clickPower') || 1);
        const localPI = Number(localStorage.getItem('sc_passiveIncome') || 0);
        const localL = Number(localStorage.getItem('sc_restLevel') || 1);

        if (data) {
          // ВОЗВРАЩЕНО: Берем максимальные значения (база vs браузер)
          setCooks(Math.max(data.cooks || 0, localC)); 
          setClickPower(Math.max(data.click_power || 1, localP)); 
          setPassiveIncome(Math.max(data.passive_income || 0, localPI)); 
          setRestaurantLevel(Math.max(data.restaurant_level || 1, localL)); 
          setEnergy(data.energy || 500); 
        } else {
          setCooks(localC); setClickPower(localP); setPassiveIncome(localPI); setRestaurantLevel(localL);
          
          const profileName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Шеф';
          
          supabase.from('game_progress').upsert({ 
            user_id: user.id, 
            user_name: profileName, 
            user_avatar: user.user_metadata?.avatar_url || null, 
            cooks: localC, click_power: localP, passive_income: localPI, restaurant_level: localL, energy: 500 
          }, { onConflict: 'user_id' }).then(({error: insError}) => {
             if(insError) console.error("Ошибка создания прогресса:", insError);
          });
        }
      });
    } else if (typeof window !== 'undefined') {
      setCooks(Number(localStorage.getItem('sc_cooks') || 0)); setClickPower(Number(localStorage.getItem('sc_clickPower') || 1));
      setPassiveIncome(Number(localStorage.getItem('sc_passiveIncome') || 0)); setRestaurantLevel(Number(localStorage.getItem('sc_restLevel') || 1));
    }
  }, [user]);

  useEffect(() => {
    if (!FEATURE_RESTAURANT_GAME) return; // прогресс игры не сохраняем (этап 4.2)
    if (typeof window !== 'undefined') {
      localStorage.setItem('sc_cooks', cooks.toString()); localStorage.setItem('sc_clickPower', clickPower.toString());
      localStorage.setItem('sc_passiveIncome', passiveIncome.toString()); localStorage.setItem('sc_restLevel', restaurantLevel.toString());
    }
    if (user) {
      const timer = setTimeout(() => {
        const profileName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Шеф';
        supabase.from('game_progress').upsert({ 
          user_id: user.id, 
          user_name: profileName, 
          user_avatar: user.user_metadata?.avatar_url || null, 
          cooks, click_power: clickPower, passive_income: passiveIncome, restaurant_level: restaurantLevel, energy, updated_at: new Date().toISOString() 
        }, { onConflict: 'user_id' }).then(({error}) => {
          if(error) console.error("Ошибка автосохранения прогресса:", error);
        });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [cooks, clickPower, passiveIncome, restaurantLevel, energy, user]);

  useEffect(() => {
    if (!FEATURE_RESTAURANT_GAME) return; // без игры энергия/пассивный доход не тикают
    const interval = setInterval(() => {
      setEnergy(prev => prev < maxEnergy ? prev + 1 : maxEnergy);
      if (actualPassiveIncome > 0) setCooks(prev => prev + actualPassiveIncome);
    }, 1000);
    return () => clearInterval(interval);
  }, [actualPassiveIncome, maxEnergy]);

  useEffect(() => {
    if (activeView === 'feed' && feedTab === 'photos' && scrollToPostId && photosFeed.length > 0) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`feed-post-${scrollToPostId}`);
        if (element) { element.scrollIntoView({ behavior: 'smooth', block: 'center' }); element.style.transition = 'box-shadow 0.5s'; element.style.boxShadow = '0 0 0 4px var(--color-accent)'; setTimeout(() => { element.style.boxShadow = ''; setScrollToPostId(null); }, 2000); }
      }, 300); return () => clearTimeout(timer);
    }
  }, [activeView, feedTab, photosFeed, scrollToPostId]);

  useEffect(() => {
    if (dailyRecipe && feed.length > 0) {
      const alreadySaved = feed.find(r => r.title === dailyRecipe.title && r.is_favorite); setDailyFavoriteId(alreadySaved ? alreadySaved.id : null);
    }
  }, [dailyRecipe, feed]);

  // СОРТИРОВКА ТОЛЬКО ПО КУКАМ
  useEffect(() => {
    if (!FEATURE_RESTAURANT_GAME) return; // лидерборд скрыт (этап 4.2)
    if (gameTab === 'leaderboard') {
      // Публичное view без user_id/energy/click_power и т.п. — см. supabase_game_progress_rls.sql
      supabase.from('game_leaderboard').select('*').order('cooks', { ascending: false }).then(({data}) => { if (data) setLeaderboard(data); });
    }
  }, [gameTab]);

  /* --- ФУНКЦИИ ОБРАБОТЧИКИ --- */
  const fetchMyRecipes = async (currentId: string) => { const { data, error } = await supabase.from('recipes').select('*').eq('session_id', currentId).order('created_at', { ascending: false }); if (!error && data) setFeed(data); };
  const fetchPhotosFeed = async (sortType: 'new' | 'top' | 'old') => {
    setPhotosSort(sortType); if (!userId) return;
    try { const res = await fetch("/api/photo-feed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort: sortType, sessionId: userId }) }); const json = await res.json(); if (json.feed) setPhotosFeed(json.feed); } catch (e) {}
  };

  // Перенос профиля вкуса из localStorage (анонимный опыт) в аккаунт при
  // входе/регистрации. МЁРДЖ, а не перезапись: то, что уже сохранено в
  // аккаунте, остаётся; добавляется только новое из localStorage.
  const mergeTasteProfileIntoAccount = async (
    accountUser: { user_metadata?: { allergies?: unknown; dislikes?: unknown } } | null | undefined,
  ) => {
    try {
      const localA = JSON.parse(localStorage.getItem("sc_allergies") || "[]");
      const localD = JSON.parse(localStorage.getItem("sc_dislikes") || "[]");
      const accA = Array.isArray(accountUser?.user_metadata?.allergies) ? (accountUser!.user_metadata!.allergies as string[]) : [];
      const accD = Array.isArray(accountUser?.user_metadata?.dislikes) ? (accountUser!.user_metadata!.dislikes as string[]) : [];
      const mergedA = Array.from(new Set([...accA, ...(Array.isArray(localA) ? localA : [])]));
      const mergedD = Array.from(new Set([...accD, ...(Array.isArray(localD) ? localD : [])]));

      // Пишем в аккаунт только если localStorage добавил что-то новое.
      if (mergedA.length !== accA.length || mergedD.length !== accD.length) {
        await supabase.auth.updateUser({ data: { allergies: mergedA, dislikes: mergedD } });
      }
      setAllergies(mergedA);
      setDislikes(mergedD);
      localStorage.setItem("sc_allergies", JSON.stringify(mergedA));
      localStorage.setItem("sc_dislikes", JSON.stringify(mergedD));
    } catch {}
  };

  const handleAuth = async () => {
    setAuthError(null);
    const username = normalizeUsername(authUsername);

    if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
      setAuthError(`Логин: латиница, цифры и «_», от ${USERNAME_MIN} до ${USERNAME_MAX} символов.`);
      return;
    }
    if (authPassword.length < PASSWORD_MIN) {
      setAuthError(`Пароль должен быть не короче ${PASSWORD_MIN} символов.`);
      return;
    }

    setAuthLoading(true);
    // username уже нормализован (латиница/цифры/_), поэтому dummyEmail валиден.
    const dummyEmail = `${username}@smartcook.app`;

    try {
      if (authMode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email: dummyEmail,
          password: authPassword,
          options: { data: { full_name: username, username } },
        });
        if (error) {
          if (error.message.includes('already registered') || error.message.includes('User already exists')) {
            setAuthError("Это имя уже занято. Выберите другое или войдите.");
          } else {
            setAuthError("Не удалось создать аккаунт. Попробуйте ещё раз.");
          }
          return;
        }
        reachGoal("auth_signup");
        await mergeTasteProfileIntoAccount(data.user);
        await claimGuestPartiesToAccount();
        showToast("Добро пожаловать, шеф!", <Sparkles size={18} color="var(--color-accent)" />);
        setIsAuthModalOpen(false);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: dummyEmail, password: authPassword });
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            setAuthError("Неверное имя или пароль.");
          } else {
            setAuthError("Не удалось войти. Попробуйте ещё раз.");
          }
          return;
        }
        reachGoal("auth_login");
        await mergeTasteProfileIntoAccount(data.user);
        await claimGuestPartiesToAccount();
        setIsAuthModalOpen(false);
      }
    } catch {
      setAuthError("Что-то пошло не так. Попробуйте позже.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); setActiveView('service'); setProfileView('main'); };

  // Персистентность профиля вкуса: localStorage — для всех (в т.ч. анонимов),
  // а для залогиненных ещё и в Supabase auth user_metadata (владелец — сам
  // пользователь по JWT, чужой профиль править нельзя; отдельная таблица не нужна).
  const savePreferences = (newAllergies: string[], newDislikes: string[]) => {
    try {
      localStorage.setItem("sc_allergies", JSON.stringify(newAllergies));
      localStorage.setItem("sc_dislikes", JSON.stringify(newDislikes));
    } catch {}
    if (user) supabase.auth.updateUser({ data: { allergies: newAllergies, dislikes: newDislikes } });
  };
  const addAllergy = () => { if (!newAllergy.trim()) return; const updated = [...allergies, newAllergy.trim().toLowerCase()]; setAllergies(updated); setNewAllergy(""); savePreferences(updated, dislikes); };
  const addDislike = () => { if (!newDislike.trim()) return; const updated = [...dislikes, newDislike.trim().toLowerCase()]; setDislikes(updated); setNewDislike(""); savePreferences(allergies, updated); };
  const removeAllergy = (idx: number) => { const updated = allergies.filter((_, i) => i !== idx); setAllergies(updated); savePreferences(updated, dislikes); };
  const removeDislike = (idx: number) => { const updated = dislikes.filter((_, i) => i !== idx); setDislikes(updated); savePreferences(allergies, updated); };

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => { const files = e.target.files; if (!files || files.length === 0) return; setCropImageSrc(URL.createObjectURL(files[0])); setIsCropping(true); };
  const onCropComplete = (croppedArea: any, croppedAreaPixels: any) => { setCroppedAreaPixels(croppedAreaPixels); };
  const handleCropConfirm = async () => {
    if (!cropImageSrc || !croppedAreaPixels) return;
    try {
      const croppedFile = await getCroppedImg(cropImageSrc, croppedAreaPixels);
      if (croppedFile) {
         const imageCompression = (await import('browser-image-compression')).default; 
         const compressedFile = await imageCompression(croppedFile, { maxSizeMB: 0.3, maxWidthOrHeight: 500, useWebWorker: true, fileType: "image/jpeg" }); 
         const finalFile = new File([compressedFile], `avatar_${Date.now()}.jpg`, { type: "image/jpeg" });
         setEditAvatarFile(finalFile); setEditAvatarPreview(URL.createObjectURL(finalFile)); setIsCropping(false); setCropImageSrc(null);
      }
    } catch (e) { showToast("Не удалось обработать фото", undefined, 'error'); setEditAvatarFile(null); setEditAvatarPreview(null); }
  };

  const handleProfileSave = async () => { 
    if (!user) return; setIsSavingProfile(true); 
    try { 
      let avatarUrl = user.user_metadata?.avatar_url; 
      if (editAvatarFile) { 
        const fileName = `${user.id}/avatar_${Date.now()}.jpg`; const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, editAvatarFile, { upsert: true }); if (uploadError) throw uploadError; const { data } = supabase.storage.from('avatars').getPublicUrl(fileName); avatarUrl = data.publicUrl + '?t=' + Date.now(); 
      } 

      const newUsername = editUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (newUsername.length < 4) throw new Error("Username должен быть от 4 символов (только буквы, цифры и _)");

      let updates: any = { data: { full_name: editProfileName, avatar_url: avatarUrl, username: newUsername } };
      
      const { data, error } = await supabase.auth.updateUser(updates); 
      if (error) throw error;

      setUser(data.user); setIsEditingProfile(false); 
      
      await supabase.from('feed_posts').update({ user_name: editProfileName, user_avatar: avatarUrl }).eq('user_id', user.id);
      await supabase.from('photo_comments').update({ user_name: editProfileName, user_avatar: avatarUrl }).eq('user_id', user.id);
      await supabase.from('game_progress').update({ user_name: editProfileName, user_avatar: avatarUrl }).eq('user_id', user.id);
      
      setPhotosFeed(prev => prev.map(p => p.user_id === user.id ? { ...p, user_name: editProfileName, user_avatar: avatarUrl } : p));
      setUserPhotos(prev => prev.map(p => p.user_id === user.id ? { ...p, user_name: editProfileName, user_avatar: avatarUrl } : p));
    } catch(e: any) { showToast(e.message || "Ошибка сохранения профиля", undefined, 'error'); } finally { setIsSavingProfile(false); } 
  }; 

  const handlePhotoLike = async (e: any, item: any) => {
    e.stopPropagation(); if (!userId) return;
    const action = item.is_liked ? 'unlike' : 'like'; const newCount = item.is_liked ? Math.max(0, (item.likes_count || 0) - 1) : (item.likes_count || 0) + 1;
    setPhotosFeed(photosFeed.map(p => p.id === item.id ? { ...p, is_liked: !item.is_liked, likes_count: newCount } : p));
    try { 
      if (action === 'like') await supabase.from('photo_likes').insert({ post_id: item.id, session_id: userId });
      else await supabase.from('photo_likes').delete().match({ post_id: item.id, session_id: userId });
    } catch (err) {}
  };

  const handleDeletePost = async (postId: number) => { 
    if (!confirm("Вы уверены, что хотите удалить этот пост?")) return; 
    try { const { error } = await supabase.from('feed_posts').delete().eq('id', postId).eq('user_id', user?.id); if (error) throw error; setPhotosFeed(prev => prev.filter(p => p.id !== postId)); setUserPhotos(prev => prev.filter(p => p.id !== postId)); } catch (e: any) { showToast("Ошибка удаления", undefined, 'error'); } 
  }; 

  const openComments = async (postId: number) => { 
    try {
      setCommentsModalPostId(postId); 
      setPostComments([]); 
      setReplyingTo(null); 
      setIsLoadingComments(true); 
      
      const { data, error } = await supabase.from('photo_comments').select('*').eq('post_id', postId).order('created_at', { ascending: true }); 
      if (error) throw error;

      let likedIds = new Set(); 
      if (userId && data && data.length > 0) { 
        const cIds = data.map(c => c.id); 
        const { data: likes } = await supabase.from('comment_likes').select('comment_id').in('comment_id', cIds).eq('session_id', userId); 
        if (likes) likes.forEach((l: any) => likedIds.add(l.comment_id)); 
      } 
      setPostComments(data?.map(c => ({...c, is_liked: likedIds.has(c.id)})) || []); 
    } catch (e) {
      console.error(e);
      showToast("Не удалось загрузить комментарии", undefined, 'error');
    } finally {
      setIsLoadingComments(false);
    }
  }; 

  const submitComment = async () => { 
    if (!user) { setCommentsModalPostId(null); return setIsAuthModalOpen(true); }
    if (!newCommentText.trim() || !commentsModalPostId) return; 
    const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Шеф'; const userAvatar = user.user_metadata?.avatar_url || null; 
    const { data, error } = await supabase.from('photo_comments').insert({ post_id: commentsModalPostId, user_id: user.id, user_name: userName, user_avatar: userAvatar, text: newCommentText.trim(), parent_id: replyingTo ? replyingTo.id : null }).select().single(); 
    if (!error && data) { setPostComments([...postComments, data]); setNewCommentText(""); setReplyingTo(null); setPhotosFeed(photosFeed.map(p => p.id === commentsModalPostId ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p)); } 
  }; 

  const handleDeleteComment = async (commentId: number) => { 
    if (!confirm("Удалить комментарий?")) return; 
    try { const { error } = await supabase.from('photo_comments').delete().eq('id', commentId).eq('user_id', user?.id); if (error) throw error; setPostComments(prev => prev.filter(c => c.id !== commentId && c.parent_id !== commentId)); setPhotosFeed(photosFeed.map(p => p.id === commentsModalPostId ? { ...p, comments_count: Math.max(0, (p.comments_count || 0) - 1) } : p)); } catch (e: any) { showToast("Ошибка удаления", undefined, 'error'); } 
  }; 

  const handleCommentLike = async (comment: DBComment) => {
    if (!userId) return;
    const action = comment.is_liked ? 'unlike' : 'like'; const newCount = comment.is_liked ? Math.max(0, (comment.likes_count || 0) - 1) : (comment.likes_count || 0) + 1;
    setPostComments(postComments.map(c => c.id === comment.id ? { ...c, is_liked: !c.is_liked, likes_count: newCount } : c));
    try { if (action === 'like') await supabase.from('comment_likes').insert({ comment_id: comment.id, session_id: userId }); else await supabase.from('comment_likes').delete().match({ comment_id: comment.id, session_id: userId }); } catch (err) {}
  };

  const toggleFavorite = async (e: any, targetId: number, currentStatus: boolean = false) => { 
    e.stopPropagation(); if (!targetId) return; const newStatus = !currentStatus; 
    setFeed(feed?.map(r => r.id === targetId ? { ...r, is_favorite: newStatus } : r) || []); if (recipe && recipe.id === targetId) setRecipe({ ...recipe, is_favorite: newStatus }); 
    try { await fetch("/api/favorite", { method: "POST", headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) }, body: JSON.stringify({ id: targetId, isFavorite: newStatus, sessionId: userId }) }); } catch (err) {}
  };

  const toggleDailyFavorite = async () => { 
    if (!dailyRecipe || !userId) return; 
    if (dailyFavoriteId) { 
      setFeed(feed?.map(r => r.id === dailyFavoriteId ? { ...r, is_favorite: false } : r) || []); setDailyFavoriteId(null); 
      try { await fetch("/api/favorite", { method: "POST", headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) }, body: JSON.stringify({ id: dailyFavoriteId, isFavorite: false, sessionId: userId }) }); } catch(e) {}
    } else { 
      const { data } = await supabase.from('recipes').insert({ session_id: userId, title: dailyRecipe.title, description: dailyRecipe.description, time: String(dailyRecipe.time), calories: String(dailyRecipe.calories), ingredients: dailyRecipe.ingredients || dailyRecipe.detailed_ingredients?.map(i => `${i.name} - ${i.amount}`) || [], detailed_ingredients: dailyRecipe.detailed_ingredients || [], missing_ingredients: dailyRecipe.missing_ingredients || [], steps: dailyRecipe.steps, is_favorite: true }).select('*'); 
      if (data && data.length > 0) { setDailyFavoriteId(data[0].id); fetchMyRecipes(userId); } 
    } 
  }; 

  const handleUserPhotoChange = async (e: ChangeEvent<HTMLInputElement>) => { 
    const files = e.target.files; if (!files || files.length === 0) return; 
    setUserPhotoPreview(URL.createObjectURL(files[0])); setIsUploadingPhoto(true); 
    try { 
      const imageCompression = (await import('browser-image-compression')).default; 
      const compressedFile = await imageCompression(files[0], { maxSizeMB: 1, maxWidthOrHeight: 1080, useWebWorker: false, fileType: "image/jpeg" }); 
      setUserPhotoFile(new File([compressedFile], `post_${Date.now()}.jpg`, { type: "image/jpeg" })); 
    } catch (error) { showToast("Не удалось обработать фото", undefined, 'error'); setUserPhotoFile(null); setUserPhotoPreview(null); } 
    finally { setIsUploadingPhoto(false); } 
  }; 

  const ensureRecipeInDB = async (currentRecipe: any) => { 
    if (!currentRecipe) return null; if (currentRecipe.id) return currentRecipe.id; 
    const { data } = await supabase.from('recipes').insert({ session_id: userId, title: currentRecipe.title, description: currentRecipe.description, time: String(currentRecipe.time), calories: String(currentRecipe.calories), ingredients: currentRecipe.ingredients || currentRecipe.detailed_ingredients?.map((i:any) => `${i.name} - ${i.amount}`) || [], detailed_ingredients: currentRecipe.detailed_ingredients || [], missing_ingredients: currentRecipe.missing_ingredients || [], steps: currentRecipe.steps, is_favorite: false }).select('*'); 
    if (data && data.length > 0) { if (recipe && recipe.title === currentRecipe.title) setRecipe({...recipe, id: data[0].id}); return data[0].id; } return null; 
  }; 

  const submitFeedPost = async (currentRecipeContext: any) => { 
    if (!user) return setIsAuthModalOpen(true); 
    if (!userPhotoFile) { showToast("Сначала выберите фото!", undefined, 'error'); return; } 
    if (isStandaloneUploadOpen && !standaloneTitle.trim()) { showToast("Введите название вашего блюда!", undefined, 'error'); return; } 

    setIsUploadingPhoto(true); 
    try { 
      let dbRecipeId = null; let postTitleContext = standaloneTitle; 
      if (!isStandaloneUploadOpen) { 
         dbRecipeId = await ensureRecipeInDB(currentRecipeContext); 
         if (!dbRecipeId) throw new Error("Не удалось привязать рецепт"); 
         postTitleContext = currentRecipeContext.title; 
      } 
      const fileName = `${user.id}/${Date.now()}.jpg`; 
      const fileBuffer = await userPhotoFile.arrayBuffer();
      const { error: uploadError } = await supabase.storage.from('recipe_photos').upload(fileName, fileBuffer, { contentType: 'image/jpeg' }); 
      if (uploadError) throw uploadError; 

      const { data: publicUrlData } = supabase.storage.from('recipe_photos').getPublicUrl(fileName); 
      const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Шеф'; 
      
      const { error: postError } = await supabase.from('feed_posts').insert({ 
        recipe_id: dbRecipeId, custom_title: isStandaloneUploadOpen ? standaloneTitle : null, user_id: user.id, user_name: userName, user_avatar: user.user_metadata?.avatar_url || null, photo_url: publicUrlData.publicUrl, comment: userComment, status: 'pending' 
      }); 
      if (postError) throw postError; 

      try { 
          const { data: latestPost } = await supabase.from('feed_posts').select('id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).single(); 
          if (latestPost) await fetch('/api/telegram-mod', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId: latestPost.id, recipeTitle: postTitleContext, userName: userName, comment: userComment, photoUrl: publicUrlData.publicUrl }) }); 
      } catch (tgErr) {} 

      showToast(FEATURE_RESTAURANT_GAME ? "Фото на проверке у шефа! +1000 куков!" : "Фото на проверке у шефа!", <Sparkles size={18} color="var(--color-accent)" />);
      if (FEATURE_RESTAURANT_GAME) setCooks(prev => prev + 1000);
      setUserPhotoFile(null); setUserPhotoPreview(null); setUserComment(""); setStandaloneTitle(""); setIsStandaloneUploadOpen(false);
    } catch (err: any) { showToast("Ошибка отправки: " + err.message, undefined, 'error'); } finally { setIsUploadingPhoto(false); } 
  }; 

  const handleShareDaily = async () => { 
    if (!dailyRecipe) return; const recipeUrl = `${window.location.origin}/?daily=true`; const fullText = `«${dailyRecipe.title}» 🍲\nПриготовлено с помощью SmartCook 👨‍🍳\n\nСмотри рецепт по ссылке:\n${recipeUrl}`; 
    try { if (navigator.share) await navigator.share({ title: dailyRecipe.title, text: fullText }); else { await navigator.clipboard.writeText(fullText); showToast("Ссылка скопирована в буфер обмена!", <Clipboard size={18} color="var(--color-accent)" />); } } catch (err) {} 
  }; 

  const handleShareRecipe = async () => { 
    if (!recipe) return;
    const recipeUrl = recipe.id ? `${window.location.origin}/?recipeId=${recipe.id}` : window.location.origin;
    // Единый хелпер: navigator.share → фолбэк на копирование ссылки. Текст —
    // название блюда + время приготовления. Цель Метрики — share_recipe.
    shareOrCopy({
      title: recipe.title,
      text: `«${recipe.title}» • ${formatTime(recipe.time)}`,
      url: recipeUrl,
      goal: "share_recipe",
    });
  }; 

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => { 
    const files = e.target.files; if (!files || files.length === 0) return; 
    setPreview(URL.createObjectURL(files[0])); setAnalysisResult(null); setRecipe(null); setSelectedDish(null); setQuestion(""); setAnswer(null); setIsProcessing(true); setIsHistoryView(false); setFromFeed(false); setServings(1);  
    try { 
      const imageCompression = (await import('browser-image-compression')).default; 
      const compressedFile = await imageCompression(files[0], { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, fileType: "image/jpeg" }); 
      const finalFile = new File([compressedFile], "image.jpg", { type: "image/jpeg" }); 
      setFile(finalFile); setPreview(URL.createObjectURL(finalFile));  
    } catch (error) { showToast("Не удалось обработать фото", undefined, 'error'); setFile(null); } finally { setIsProcessing(false); } 
  }; 

  const triggerFileInput = () => document.getElementById('hidden-file-input')?.click(); 

  const handleAnalyze = async () => { 
    if (!file) return; setAnalyzing(true); setRecipe(null); 
    try { 
      const formData = new FormData(); formData.append("image", file); formData.append("mode", cookingMode); formData.append("allergies", allergies.join(', ')); formData.append("dislikes", dislikes.join(', '));
      const response = await fetch("/api/analyze", { method: "POST", headers: await getAuthHeaders(), body: formData });
      const json = await response.json(); if (handleRateLimitedResponse(response, json)) return; if (json.error) throw new Error(json.error);
      setAnalysisResult(json.data);
    } catch (err: any) { showToast("Ошибка: " + err.message, undefined, 'error'); } finally { setAnalyzing(false); } 
  }; 

  const handleRegenerate = async () => {
    if (!analysisResult) return; setIsRegenerating(true);
    try {
      const response = await fetch("/api/regenerate", { method: "POST", headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) }, body: JSON.stringify({ ingredients: analysisResult.ingredients }) });
      const json = await response.json(); if (handleRateLimitedResponse(response, json)) return; if (json.error) throw new Error(json.error);
      setAnalysisResult({ ...analysisResult, dishes: json.dishes });
    } catch (err: any) { showToast("Ошибка", undefined, 'error'); } finally { setIsRegenerating(false); } 
  }; 

  const isStandalone = () =>
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true);

  // Момент успеха: после генерации рецепта. Считаем генерации и:
  // 1) после первой — один раз мягко предлагаем установить PWA;
  // 2) со второй, если профиль вкуса пуст — один раз предлагаем его заполнить.
  const onRecipeGenerated = () => {
    try {
      const count = Number(localStorage.getItem("sc_gen_count") || 0) + 1;
      localStorage.setItem("sc_gen_count", String(count));
      if (!localStorage.getItem("sc_pwa_prompt_seen") && !isStandalone()) {
        localStorage.setItem("sc_pwa_prompt_seen", "1");
        setShowInstallCard(true);
      } else if (
        count >= 2 &&
        allergies.length === 0 &&
        dislikes.length === 0 &&
        !localStorage.getItem("sc_taste_nudge_seen")
      ) {
        localStorage.setItem("sc_taste_nudge_seen", "1");
        showToast(
          "Расскажите, что не любите — рецепты станут точнее. Нажмите ⚙️ рядом с поиском.",
          <Sparkles size={18} color="var(--color-accent)" />
        );
      }
    } catch {}
  };

  const handleRewardForRecipe = () => {
    if (!FEATURE_RESTAURANT_GAME) return; // награды-куки отключены (этап 4.2)
    const today = new Date().toLocaleDateString();
    const lastGen = localStorage.getItem('sc_last_gen_date');
    if (lastGen !== today) {
      localStorage.setItem('sc_last_gen_date', today);
      setCooks(prev => prev + 500);
      setTimeout(() => showToast("+500 куков за первый рецепт сегодня!", <Sparkles size={18} color="var(--color-accent)" />), 1500);
    }
  };

  const getRecipeFromPhoto = async (dishName: string) => { 
    if (!analysisResult || !userId) return; setSelectedDish(dishName); setLoadingRecipe(true); setRecipe(null); setIsHistoryView(false); setFromFeed(false); setServings(1);  
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); 
    try { 
      const response = await fetch("/api/recipe", { method: "POST", headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) }, body: JSON.stringify({ dish: dishName, ingredients: analysisResult.ingredients, sessionId: userId, allergies, dislikes }) });
      const json = await response.json(); if (handleRateLimitedResponse(response, json)) return; if (json.error) throw new Error(json.error);
      setRecipe({ ...json.recipe, id: json.recipe.id, is_favorite: false, ingredients: analysisResult.ingredients });
      if (userId) fetchMyRecipes(userId);
      handleRewardForRecipe();
      onRecipeGenerated();
    } catch (err: any) { showToast("Ошибка: " + err.message, undefined, 'error'); } finally { setLoadingRecipe(false); } 
  }; 

  const handleSmartVariant = async () => { 
    setLoadingRecipe(true); setIsHistoryView(false); setFromFeed(false); setServings(1);  
    try { 
      if (analysisResult) {
        const response = await fetch("/api/regenerate", { method: "POST", headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) }, body: JSON.stringify({ ingredients: analysisResult.ingredients }) });
        const json = await response.json(); if (handleRateLimitedResponse(response, json)) return; if (json.error) throw new Error(json.error);
        const newDishes = json.dishes.filter((d: string) => d !== selectedDish);
        setAnalysisResult({ ...analysisResult, dishes: json.dishes }); 
        await getRecipeFromPhoto(newDishes.length > 0 ? newDishes[0] : json.dishes[0]); 
      } else if (searchMode === 'text' && textQuery) { 
        await handleTextSearch();
      } 
    } catch (err: any) { showToast("Ошибка", undefined, 'error'); } finally { setLoadingRecipe(false); } 
  }; 

  const handleTextSearch = async () => { 
    if (!textQuery.trim() || !userId) return; setLoadingRecipe(true); setRecipe(null); setAnalysisResult(null); setIsHistoryView(false); setFromFeed(false); setServings(1);  
    try { 
      const response = await fetch("/api/search-recipe", { method: "POST", headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) }, body: JSON.stringify({ query: textQuery, sessionId: userId, allergies, dislikes }) });
      const json = await response.json(); if (handleRateLimitedResponse(response, json)) return; if (!response.ok) throw new Error(json.error || "Ошибка поиска");
      setRecipe({ ...json.recipe, id: json.recipe.id, is_favorite: false, missing_ingredients: json.recipe.missing_ingredients || [] });  
      if (userId) fetchMyRecipes(userId);
      handleRewardForRecipe();
      onRecipeGenerated();
    } catch (err: any) { showToast(err.message, undefined, 'error'); } finally { setLoadingRecipe(false); } 
  }; 

  const handleAskChef = async () => { 
    const currentContext = activeView === 'daily' ? (dailyRecipe as any) : recipe; 
    if (!question.trim() || !currentContext) return; setAsking(true); setAnswer(null); 
    try { 
      const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) }, body: JSON.stringify({ question: question, recipeContext: currentContext }) });
      const json = await response.json(); if (handleRateLimitedResponse(response, json)) return; if (json.error) throw new Error(json.error); setAnswer(json.answer);
    } catch (err: any) { showToast("Ошибка", undefined, 'error'); } finally { setAsking(false); } 
  }; 

  const loadFromHistory = (item: DBRecipe, source: 'photos' | 'history' | 'profile_history' | 'profile_favorites' = 'history') => { 
    setAnalysisResult(null); setQuestion(""); setAnswer(null); setServings(1);  
    setRecipe({ id: item.id, is_favorite: item.is_favorite, title: item.title, description: item.description, time: item.time, calories: item.calories, steps: item.steps || [], missing_ingredients: item.missing_ingredients || [], ingredients: item.ingredients || [], detailed_ingredients: item.detailed_ingredients || [], estimated_cost: item.estimated_cost, budget_tier: item.budget_tier }); 
    setFromFeed(source === 'history' ? false : source); setIsHistoryView(source === 'history' || source === 'profile_history' || source === 'profile_favorites'); setIsSharedView(false);  
    window.scrollTo({ top: 0, behavior: 'smooth' }); setActiveView('service');  
  }; 

  const loadSharedRecipe = async (id: string, source: 'photos' | false = false) => { 
    try { 
      const { data, error } = await supabase.from('recipes').select('*').eq('id', id).single(); 
      if (data && !error) { 
        setAnalysisResult(null); setQuestion(""); setAnswer(null); setServings(1);  
        setRecipe({ id: data.id, is_favorite: data.is_favorite, title: data.title, description: data.description, time: data.time, calories: data.calories, steps: data.steps || [], missing_ingredients: data.missing_ingredients || [], ingredients: data.ingredients || [], detailed_ingredients: data.detailed_ingredients || [], estimated_cost: data.estimated_cost, budget_tier: data.budget_tier }); 
        setActiveView('service'); setFromFeed(source); setIsHistoryView(false); setIsSharedView(source === false);  
        window.scrollTo({ top: 0, behavior: 'smooth' }); 
      } 
    } catch (err) {} 
  }; 

  const handleBackToSource = () => { 
    setRecipe(null); setIsHistoryView(false); 
    if (fromFeed === 'photos') setActiveView('feed');  
    else if (fromFeed === 'profile_history') { setProfileView('history'); setActiveView('profile'); }  
    else if (fromFeed === 'profile_favorites') { setProfileView('favorites'); setActiveView('profile'); }  
    else setActiveView('service'); 
    setFromFeed(false); 
  }; 

  const handleBackToSearch = () => { 
    setRecipe(null); setIsSharedView(false); setIsHistoryView(false); 
    if (typeof window !== 'undefined') window.history.replaceState({}, '', '/'); 
  }; 

  const switchView = (view: 'service' | 'about' | 'daily' | 'feed' | 'profile' | 'game') => { 
    setActiveView(view); setIsMenuOpen(false); 
    if (typeof window !== 'undefined') window.history.replaceState({}, '', '/'); 
  }; 

  const displayedFeed = filterMode === 'all' ? feed : feed?.filter(r => r.is_favorite); 
  const visibleHistory = historyExpanded ? displayedFeed : displayedFeed?.slice(0, 4); 
  const actualServings = typeof servings === 'number' ? servings : 1;

  return ( 
    <div className="container"> 
      <style>{` 
        input[type=number]::-webkit-inner-spin-button,  
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; } 
        input[type=number] { -moz-appearance: textfield; }
        textarea { font-family: inherit; }
        @keyframes floatUp { 0% { opacity: 1; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(-60px) scale(1.3); } }
        .float-coin { position: absolute; animation: floatUp 0.8s ease-out forwards; pointer-events: none; font-size: var(--font-size-heading); font-weight: var(--font-weight-semibold); color: var(--color-accent); text-shadow: 0px 2px 4px rgba(0,0,0,0.3); z-index: 10; }
      `}</style> 

      {/* TOAST УВЕДОМЛЕНИЯ */}
      {toast && (
        <div className={`sc-toast ${toast.type === 'error' ? 'sc-toast-error' : 'sc-toast-success'}`}>
          {toast.icon && <span className="sc-toast-icon">{toast.icon}</span>}
          <span className="sc-toast-text">{toast.message}</span>
          <button className="sc-toast-close" onClick={() => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); setToast(null); }}>&times;</button>
        </div>
      )}

      <InstallPromptCard open={showInstallCard} onClose={() => setShowInstallCard(false)} />

      <FullScreenImage imageUrl={fullScreenImage} onClose={() => setFullScreenImage(null)} />

      <CropperModal
        isCropping={isCropping}
        cropImageSrc={cropImageSrc}
        crop={crop}
        setCrop={setCrop}
        zoom={zoom}
        setZoom={setZoom}
        onCropComplete={onCropComplete}
        onCancel={() => { setIsCropping(false); setCropImageSrc(null); }}
        onConfirm={handleCropConfirm}
      />

      <CommentsModal
        commentsModalPostId={commentsModalPostId}
        onClose={() => setCommentsModalPostId(null)}
        isLoadingComments={isLoadingComments}
        postComments={postComments}
        newCommentText={newCommentText}
        setNewCommentText={setNewCommentText}
        replyingTo={replyingTo}
        setReplyingTo={setReplyingTo}
        submitComment={submitComment}
        handleDeleteComment={handleDeleteComment}
        handleCommentLike={handleCommentLike}
        user={user}
        userLevels={userLevels}
        getUserBadges={getUserBadges}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => { setIsAuthModalOpen(false); setAuthError(null); }}
        authMode={authMode}
        setAuthMode={setAuthMode}
        authUsername={authUsername}
        setAuthUsername={setAuthUsername}
        authPassword={authPassword}
        setAuthPassword={setAuthPassword}
        authLoading={authLoading}
        authError={authError}
        setAuthError={setAuthError}
        handleAuth={handleAuth}
      />

      <EditProfileModal
        isOpen={isEditingProfile}
        user={user}
        editAvatarPreview={editAvatarPreview}
        editProfileName={editProfileName}
        setEditProfileName={setEditProfileName}
        editUsername={editUsername}
        setEditUsername={setEditUsername}
        handleAvatarChange={handleAvatarChange}
        handleProfileSave={handleProfileSave}
        isSavingProfile={isSavingProfile}
        onCancel={() => { setIsEditingProfile(false); setEditAvatarFile(null); setEditUsername(user?.user_metadata?.username || user?.email?.split('@')[0] || ""); }}
      />

      <PreferencesModal
        isOpen={isPreferencesModalOpen}
        onClose={() => setIsPreferencesModalOpen(false)}
        allergies={allergies}
        dislikes={dislikes}
        newAllergy={newAllergy}
        setNewAllergy={setNewAllergy}
        newDislike={newDislike}
        setNewDislike={setNewDislike}
        addAllergy={addAllergy}
        addDislike={addDislike}
        removeAllergy={removeAllergy}
        removeDislike={removeDislike}
        isLoggedIn={!!user}
        onLogin={() => { setIsPreferencesModalOpen(false); setIsAuthModalOpen(true); }}
      />
       
      {/* КНОПКА МЕНЮ */}
      <button className="menu-btn" onClick={() => setIsMenuOpen(true)} style={{ position: 'fixed', top: 'var(--space-2)', left: 'var(--space-3)', zIndex: 50, background: 'var(--color-surface)', borderRadius: '50%', width: '44px', height: '44px', padding: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: 'none', cursor: 'pointer' }}>
        <Menu size={24} color="var(--color-text)" />
      </button>

      {/* МЕНЮ */}
      {isMenuOpen && (
        <>
          <div className="menu-overlay" onClick={() => setIsMenuOpen(false)} style={{zIndex: 99}} />
          <div className={`menu-drawer ${isMenuOpen ? 'open' : ''}`} style={{ left: 0, right: 'auto', transform: isMenuOpen ? 'translateX(0)' : 'translateX(-100%)', zIndex: 100, borderTopRightRadius: 'var(--radius-md)', borderBottomRightRadius: 'var(--radius-md)', borderTopLeftRadius: '0', borderBottomLeftRadius: '0' }}>
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-5)'}}>
               <span style={{fontSize: 'var(--font-size-heading)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-accent)'}}>SmartCook</span>
               <X size={24} color="var(--color-text-secondary)" onClick={() => setIsMenuOpen(false)} style={{cursor: 'pointer'}} />
            </div>

            <div className="menu-link" onClick={() => { setProfileView('main'); switchView('profile'); }} style={{ background: activeView === 'profile' ? 'var(--color-accent-subtle)' : 'transparent', color: activeView === 'profile' ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontWeight: activeView === 'profile' ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)' }}>
               <User size={22} style={{flexShrink: 0}}/> Личный кабинет
            </div>
            <div className="menu-link" onClick={() => switchView('service')} style={{ background: activeView === 'service' ? 'var(--color-accent-subtle)' : 'transparent', color: activeView === 'service' ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontWeight: activeView === 'service' ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)' }}>
               <Search size={22} style={{flexShrink: 0}}/> Поиск
            </div>
            <a className="menu-link" href="/parties" style={{ background: 'transparent', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)', textDecoration: 'none' }}>
               <PartyPopper size={22} style={{flexShrink: 0}}/> Банкеты
            </a>
            <div className="menu-link" onClick={() => switchView('feed')} style={{ background: activeView === 'feed' ? 'var(--color-accent-subtle)' : 'transparent', color: activeView === 'feed' ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontWeight: activeView === 'feed' ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)' }}>
               <Globe size={22} style={{flexShrink: 0}}/> Лента
            </div>
            {FEATURE_RESTAURANT_GAME && (
            <div className="menu-link" onClick={() => switchView('game')} style={{ background: activeView === 'game' ? 'var(--color-accent-subtle)' : 'transparent', color: activeView === 'game' ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontWeight: activeView === 'game' ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)' }}>
               <Store size={22} style={{flexShrink: 0}}/> Мой ресторан
            </div>
            )}
            <div className="menu-link" onClick={() => switchView('daily')} style={{ background: activeView === 'daily' ? 'var(--color-accent-subtle)' : 'transparent', color: activeView === 'daily' ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontWeight: activeView === 'daily' ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)' }}>
               <Flame size={22} style={{flexShrink: 0}}/> Рецепт дня
            </div>

            <div className="menu-link" style={{ marginTop: 'var(--space-2)', background: activeView === 'about' ? 'var(--color-accent-subtle)' : 'transparent', color: activeView === 'about' ? 'var(--color-accent)' : 'var(--color-text-secondary)', fontWeight: activeView === 'about' ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)' }} onClick={() => switchView('about')}>
               <CheckCircle size={22} style={{flexShrink: 0}}/> О проекте
            </div>
          </div>
        </>
      )}

      {/* === ВНЕШНИЕ КОМПОНЕНТЫ === */}
      {activeView === 'profile' && (
        <Profile 
          user={user} cooks={cooks} restaurantLevel={restaurantLevel} profileView={profileView} 
          setProfileView={setProfileView} feed={feed} userPhotos={userPhotos} handleLogout={handleLogout} 
          setIsEditingProfile={setIsEditingProfile} setIsPreferencesModalOpen={setIsPreferencesModalOpen} 
          setIsAuthModalOpen={setIsAuthModalOpen} loadFromHistory={loadFromHistory} handleDeletePost={handleDeletePost} 
          formatCooks={formatCooks} formatTime={formatTime} formatCalories={formatCalories} getUserBadges={getUserBadges} 
        />
      )}

      {activeView === 'feed' && (
        <Feed 
          photosFeed={photosFeed} photosSort={photosSort} fetchPhotosFeed={fetchPhotosFeed} user={user} userLevels={userLevels} 
          handleDeletePost={handleDeletePost} setFullScreenImage={setFullScreenImage} handlePhotoLike={handlePhotoLike} 
          openComments={openComments} loadSharedRecipe={loadSharedRecipe} isStandaloneUploadOpen={isStandaloneUploadOpen} 
          setIsStandaloneUploadOpen={setIsStandaloneUploadOpen} userPhotoPreview={userPhotoPreview} standaloneTitle={standaloneTitle} 
          setStandaloneTitle={setStandaloneTitle} userComment={userComment} setUserComment={setUserComment} 
          setUserPhotoFile={setUserPhotoFile} setUserPhotoPreview={setUserPhotoPreview} submitFeedPost={submitFeedPost} 
          isUploadingPhoto={isUploadingPhoto} handleUserPhotoChange={handleUserPhotoChange} getUserBadges={getUserBadges} 
        />
      )}

      {FEATURE_RESTAURANT_GAME && activeView === 'game' && (
        <Game 
          user={user} setIsAuthModalOpen={setIsAuthModalOpen} restaurantLevel={restaurantLevel} gameTab={gameTab} setGameTab={setGameTab} 
          floatingClicks={floatingClicks} cooks={cooks} formatCooks={formatCooks} passiveIncome={passiveIncome} 
          handleCookClick={handleCookClick} energy={energy} clickPower={clickPower} buyUpgrade={buyUpgrade} 
          leaderboard={leaderboard} getUserBadges={getUserBadges} switchView={switchView}
          maxEnergy={maxEnergy} actualClickPower={actualClickPower} actualPassiveIncome={actualPassiveIncome} getRestaurantCost={getRestaurantCost}
        />
      )}

      {/* ИСПОЛЬЗУЕМ ТВОЙ КРАСИВЫЙ DailyRecipe */}
      {activeView === 'daily' && (
        <DailyRecipe 
          dailyError={dailyError} dailyRecipe={dailyRecipe} dailyFavoriteId={dailyFavoriteId} 
          toggleDailyFavorite={toggleDailyFavorite} handleShareDaily={handleShareDaily} 
          formatTime={formatTime} formatCalories={formatCalories} cleanText={cleanText} 
          question={question} setQuestion={setQuestion} handleAskChef={handleAskChef} answer={answer}
          asking={asking}
        />
      )}

      {activeView === 'about' && <About />}


      {/* === ГЛАВНЫЙ СЕРВИС ПОИСКА === */}
      {activeView === 'service' && (
        <ServiceView
          isHistoryView={isHistoryView}
          fromFeed={fromFeed}
          isSharedView={isSharedView}
          currentHoliday={currentHoliday}
          switchView={switchView}
          dailyRecipe={dailyRecipe}
          searchMode={searchMode}
          setSearchMode={setSearchMode}
          setIsPreferencesModalOpen={setIsPreferencesModalOpen}
          allergies={allergies}
          dislikes={dislikes}
          file={file}
          handleFileChange={handleFileChange}
          preview={preview}
          triggerFileInput={triggerFileInput}
          cookingMode={cookingMode}
          setCookingMode={setCookingMode}
          handleAnalyze={handleAnalyze}
          analyzing={analyzing}
          isProcessing={isProcessing}
          textQuery={textQuery}
          setTextQuery={setTextQuery}
          handleTextSearch={handleTextSearch}
          loadingRecipe={loadingRecipe}
          analysisResult={analysisResult}
          getRecipeFromPhoto={getRecipeFromPhoto}
          selectedDish={selectedDish}
          handleRegenerate={handleRegenerate}
          isRegenerating={isRegenerating}
          recipe={recipe}
          handleBackToSearch={handleBackToSearch}
          handleBackToSource={handleBackToSource}
          handleShareRecipe={handleShareRecipe}
          toggleFavorite={toggleFavorite}
          handleSmartVariant={handleSmartVariant}
          formatTime={formatTime}
          formatCalories={formatCalories}
          scaleAmount={scaleAmount}
          cleanText={cleanText}
          actualServings={actualServings}
          servings={servings}
          setServings={setServings}
          question={question}
          setQuestion={setQuestion}
          handleAskChef={handleAskChef}
          asking={asking}
          answer={answer}
          user={user}
          setIsAuthModalOpen={setIsAuthModalOpen}
          userPhotoFile={userPhotoFile}
          userPhotoPreview={userPhotoPreview}
          userComment={userComment}
          setUserComment={setUserComment}
          handleUserPhotoChange={handleUserPhotoChange}
          submitFeedPost={submitFeedPost}
          isUploadingPhoto={isUploadingPhoto}
          setIsStandaloneUploadOpen={setIsStandaloneUploadOpen}
          setUserPhotoFile={setUserPhotoFile}
          setUserPhotoPreview={setUserPhotoPreview}
          historyExpanded={historyExpanded}
          setHistoryExpanded={setHistoryExpanded}
          filterMode={filterMode}
          setFilterMode={setFilterMode}
          displayedFeed={displayedFeed}
          visibleHistory={visibleHistory}
          loadFromHistory={loadFromHistory}
        />
      )} 
    </div> 
  ); 
}