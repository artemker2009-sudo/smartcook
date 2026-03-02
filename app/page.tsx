"use client";

import { useState, useEffect, ChangeEvent } from "react";
import { supabase } from "@/lib/supabase"; 
import Cropper from 'react-easy-crop';
import { 
  Menu, X, Flame, Send, Camera, Search, Clock, Heart, 
  ArrowRight, ArrowLeft, RotateCcw, CheckCircle, Sparkles, Image as ImageIcon, 
  Wallet, Zap, Leaf, Globe, ChevronRight, ChevronDown, ChevronUp, Shuffle, ShoppingCart, Lock, ShoppingBag, ExternalLink, Info, ThumbsUp, Share2, User, LogOut, Mail, MessageCircle, PlusCircle, Trash2, Edit3, CornerDownRight, Settings, Store, Trophy
} from "lucide-react";

// Импортируем компоненты
import Profile from "@/components/Profile";
import DailyRecipe from "@/components/DailyRecipe";
import Feed from "@/components/Feed";
import Game from "@/components/Game";
import About from "@/components/About";

/* --- ТИПЫ ДАННЫХ --- */
interface AnalysisData { ingredients: string[]; dishes: string[]; }
interface DetailedIngredient { name: string; amount: string; }
interface RecipeData { id?: number; is_favorite?: boolean; title: string; description?: string; time: string; calories?: string; steps: string[]; missing_ingredients?: string[]; ingredients?: string[]; detailed_ingredients?: DetailedIngredient[]; }
interface DBRecipe { id: number; title: string; time: string; calories?: string; is_favorite: boolean; created_at: string; steps: string[]; ingredients: string[]; detailed_ingredients?: DetailedIngredient[]; missing_ingredients?: string[]; description?: string; session_id: string; likes_count?: number; comments_count?: number; is_liked?: boolean; custom_title?: string; user_id?: string; user_avatar?: string; user_name?: string; }
interface DailyRecipeType { title: string; description?: string; time: string | number; calories: string | number; ingredients?: string[]; detailed_ingredients?: DetailedIngredient[]; missing_ingredients?: string[]; steps: string[]; date?: string; error?: string; }
interface HolidayType { title: string; text: string; gradient: string; icon: string; }
interface DBComment { id: number; post_id: number; user_id: string; user_name: string; user_avatar?: string; text: string; created_at: string; parent_id?: number | null; likes_count?: number; is_liked?: boolean; }

// =========================================================================
const DEVELOPER_ID = "68ff3d0a-2a09-4e22-b39b-3fea14de3f96"; 
// =========================================================================

/* --- ГЛОБАЛЬНЫЕ ФУНКЦИИ --- */
const scaleAmount = (amount: string, multiplier: number) => {
  if (!amount) return "";
  if (multiplier === 1) return amount;
  return amount.replace(/(\d+\/\d+|\d+([\.,]\d+)?)/g, (match) => {
    let num = 0;
    if (match.includes('/')) {
      const parts = match.split('/'); num = parseInt(parts[0]) / parseInt(parts[1]);
    } else { num = parseFloat(match.replace(',', '.')); }
    if (isNaN(num)) return match;
    const scaled = num * multiplier;
    return Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(1).replace('.', ',');
  });
};

const formatCooks = (num: number) => {
  const last = num % 10; const last100 = num % 100;
  if (last100 >= 11 && last100 <= 14) return `${num} куков`;
  if (last === 1) return `${num} кук`;
  if (last >= 2 && last <= 4) return `${num} кука`;
  return `${num} куков`;
};

const cleanText = (text: any) => {
  if (!text) return "";
  return String(text).replace(/^(Шаг \d+|Step \d+|\d+[\.\)])[:\s]*/i, '').trim();
};

const formatTime = (t: string) => {
  if (!t) return "";
  const digits = t.replace(/\D/g, ''); return digits ? `${digits} мин.` : t;
};

const formatCalories = (c?: string) => {
  if (!c) return "";
  const match = c.match(/\d+/); return match ? `${match[0]} ккал` : "";  
};

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image(); image.addEventListener('load', () => resolve(image)); image.addEventListener('error', (error) => reject(error)); image.setAttribute('crossOrigin', 'anonymous'); image.src = url;
  });

async function getCroppedImg(imageSrc: string, pixelCrop: any): Promise<File | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  canvas.width = pixelCrop.width; canvas.height = pixelCrop.height;
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve(null);
      resolve(new File([blob], `avatar_${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg');
  });
}

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

  const getUserBadges = (uid: string | undefined | null, level?: number) => {
    const isDev = uid === DEVELOPER_ID;
    const safeLevel = level || 1;
    const titles = ['Ларёк 🌭', 'Закусочная 🍔', 'Кафе ☕️', 'Ресторан 🍽', 'Мишленовский ресторан ⭐️', 'Сеть ресторанов 👑'];
    
    const restBadge = <span key="rest" style={{fontSize: '11px', background: '#fef3c7', color: '#d97706', padding: '4px 10px', borderRadius: '100px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', lineHeight: 1}}>{titles[Math.min(safeLevel - 1, 5)]}</span>;
    const devBadge = isDev ? <span key="dev" style={{fontSize: '11px', background: '#111', color: '#38bdf8', padding: '4px 10px', borderRadius: '100px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px', lineHeight: 1}}>👨‍💻 Разработчик</span> : null;

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
    }
  }, []);

  useEffect(() => { if (activeView === 'feed') fetchPhotosFeed(photosSort); }, [activeView, photosSort]);

  useEffect(() => {
    const uids = new Set<string>();
    photosFeed.forEach(p => { if (p.user_id) uids.add(p.user_id); });
    postComments.forEach(c => { if (c.user_id) uids.add(c.user_id); });
    if (uids.size > 0) {
      supabase.from('game_progress').select('user_id, restaurant_level').in('user_id', Array.from(uids)).then(({data, error}) => {
          if (data && !error) { const levels: Record<string, number> = {}; data.forEach(d => levels[d.user_id] = d.restaurant_level); setUserLevels(prev => ({...prev, ...levels})); }
        });
    }
  }, [photosFeed, postComments]);

  useEffect(() => {
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
        if (element) { element.scrollIntoView({ behavior: 'smooth', block: 'center' }); element.style.transition = 'box-shadow 0.5s'; element.style.boxShadow = '0 0 0 4px #0ea5e9'; setTimeout(() => { element.style.boxShadow = ''; setScrollToPostId(null); }, 2000); }
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
    if (gameTab === 'leaderboard') {
      supabase.from('game_progress').select('*').order('cooks', { ascending: false }).then(({data}) => { if (data) setLeaderboard(data); });
    }
  }, [gameTab]);

  /* --- ФУНКЦИИ ОБРАБОТЧИКИ --- */
  const fetchMyRecipes = async (currentId: string) => { const { data, error } = await supabase.from('recipes').select('*').eq('session_id', currentId).order('created_at', { ascending: false }); if (!error && data) setFeed(data); };
  const fetchPhotosFeed = async (sortType: 'new' | 'top' | 'old') => {
    setPhotosSort(sortType); if (!userId) return;
    try { const res = await fetch("/api/photo-feed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort: sortType, sessionId: userId }) }); const json = await res.json(); if (json.feed) setPhotosFeed(json.feed); } catch (e) {}
  };

  const handleAuth = async () => {
    if (!authUsername.trim() || authPassword.length < 6) return alert("Введите логин и пароль (минимум 6 символов)");
    
    const safeUsername = authUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (safeUsername.length < 4) return alert("Логин должен содержать только английские буквы, цифры и _ (минимум 4 символа)!");

    setAuthLoading(true);
    const dummyEmail = `${safeUsername}@smartcook.app`;
    
    try {
      if (authMode === 'register') {
        const { data, error } = await supabase.auth.signUp({ 
          email: dummyEmail, 
          password: authPassword, 
          options: { data: { full_name: authUsername.trim(), username: safeUsername } } 
        });
        if (error) {
          if (error.message.includes('already registered') || error.message.includes('User already exists')) {
            alert("Этот Username уже занят! Выберите другой или перейдите во вкладку «Войти».");
          } else throw error;
        } else {
          alert("Успешная регистрация! Добро пожаловать, шеф.");
          setIsAuthModalOpen(false);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: dummyEmail, password: authPassword });
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            alert("Неверный Username или пароль!");
          } else throw error;
        } else {
          setIsAuthModalOpen(false);
        }
      }
    } catch (e: any) { 
      alert("Ошибка: " + e.message); 
    } finally { 
      setAuthLoading(false); 
    }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); setActiveView('service'); setProfileView('main'); };

  const savePreferencesToDB = async (newAllergies: string[], newDislikes: string[]) => { if (user) await supabase.auth.updateUser({ data: { allergies: newAllergies, dislikes: newDislikes } }); };
  const addAllergy = () => { if (!newAllergy.trim()) return; const updated = [...allergies, newAllergy.trim().toLowerCase()]; setAllergies(updated); setNewAllergy(""); savePreferencesToDB(updated, dislikes); };
  const addDislike = () => { if (!newDislike.trim()) return; const updated = [...dislikes, newDislike.trim().toLowerCase()]; setDislikes(updated); setNewDislike(""); savePreferencesToDB(allergies, updated); };
  const removeAllergy = (idx: number) => { const updated = allergies.filter((_, i) => i !== idx); setAllergies(updated); savePreferencesToDB(updated, dislikes); };
  const removeDislike = (idx: number) => { const updated = dislikes.filter((_, i) => i !== idx); setDislikes(updated); savePreferencesToDB(allergies, updated); };

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
         setUserPhotoFile(finalFile); setEditAvatarPreview(URL.createObjectURL(finalFile)); setIsCropping(false); setCropImageSrc(null);
      }
    } catch (e) { alert("Не удалось обработать фото"); setUserPhotoFile(null); setUserPhotoPreview(null); }
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
    } catch(e: any) { alert(e.message || "Ошибка сохранения профиля"); } finally { setIsSavingProfile(false); } 
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
    try { const { error } = await supabase.from('feed_posts').delete().eq('id', postId).eq('user_id', user?.id); if (error) throw error; setPhotosFeed(prev => prev.filter(p => p.id !== postId)); setUserPhotos(prev => prev.filter(p => p.id !== postId)); } catch (e: any) { alert("Ошибка удаления."); } 
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
      alert("Не удалось загрузить комментарии");
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
    try { const { error } = await supabase.from('photo_comments').delete().eq('id', commentId).eq('user_id', user?.id); if (error) throw error; setPostComments(prev => prev.filter(c => c.id !== commentId && c.parent_id !== commentId)); setPhotosFeed(photosFeed.map(p => p.id === commentsModalPostId ? { ...p, comments_count: Math.max(0, (p.comments_count || 0) - 1) } : p)); } catch (e: any) { alert("Ошибка удаления"); } 
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
    try { await fetch("/api/favorite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: targetId, isFavorite: newStatus }) }); } catch (err) {} 
  }; 

  const toggleDailyFavorite = async () => { 
    if (!dailyRecipe || !userId) return; 
    if (dailyFavoriteId) { 
      setFeed(feed?.map(r => r.id === dailyFavoriteId ? { ...r, is_favorite: false } : r) || []); setDailyFavoriteId(null); 
      try { await fetch("/api/favorite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: dailyFavoriteId, isFavorite: false }) }); } catch(e) {} 
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
      const compressedFile = await imageCompression(files[0], { maxSizeMB: 1, maxWidthOrHeight: 1080, useWebWorker: true, fileType: "image/jpeg" }); 
      setUserPhotoFile(new File([compressedFile], `post_${Date.now()}.jpg`, { type: "image/jpeg" })); 
    } catch (error) { alert("Не удалось обработать фото"); setUserPhotoFile(null); setUserPhotoPreview(null); } 
    finally { setIsUploadingPhoto(false); } 
  }; 

  const ensureRecipeInDB = async (currentRecipe: any) => { 
    if (!currentRecipe) return null; if (currentRecipe.id) return currentRecipe.id; 
    const { data } = await supabase.from('recipes').insert({ session_id: userId, title: currentRecipe.title, description: currentRecipe.description, time: String(currentRecipe.time), calories: String(currentRecipe.calories), ingredients: currentRecipe.ingredients || currentRecipe.detailed_ingredients?.map((i:any) => `${i.name} - ${i.amount}`) || [], detailed_ingredients: currentRecipe.detailed_ingredients || [], missing_ingredients: currentRecipe.missing_ingredients || [], steps: currentRecipe.steps, is_favorite: false }).select('*'); 
    if (data && data.length > 0) { if (recipe && recipe.title === currentRecipe.title) setRecipe({...recipe, id: data[0].id}); return data[0].id; } return null; 
  }; 

  const submitFeedPost = async (currentRecipeContext: any) => { 
    if (!user) return setIsAuthModalOpen(true); 
    if (!userPhotoFile) return alert("Сначала выберите фото!"); 
    if (isStandaloneUploadOpen && !standaloneTitle.trim()) return alert("Введите название вашего блюда!"); 

    setIsUploadingPhoto(true); 
    try { 
      let dbRecipeId = null; let postTitleContext = standaloneTitle; 
      if (!isStandaloneUploadOpen) { 
         dbRecipeId = await ensureRecipeInDB(currentRecipeContext); 
         if (!dbRecipeId) throw new Error("Не удалось привязать рецепт"); 
         postTitleContext = currentRecipeContext.title; 
      } 
      const fileName = `${user.id}/${Date.now()}.jpg`; 
      const { error: uploadError } = await supabase.storage.from('recipe_photos').upload(fileName, userPhotoFile); 
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

      alert(`Ура! 🎉 Ваше фото отправлено на проверку шефу.\n\n🎁 Вы заработали 1000 куков!`); 
      setCooks(prev => prev + 1000); setUserPhotoFile(null); setUserPhotoPreview(null); setUserComment(""); setStandaloneTitle(""); setIsStandaloneUploadOpen(false); 
    } catch (err: any) { alert("Ошибка отправки: " + err.message); } finally { setIsUploadingPhoto(false); } 
  }; 

  const handleShareDaily = async () => { 
    if (!dailyRecipe) return; const recipeUrl = `${window.location.origin}/?daily=true`; const fullText = `«${dailyRecipe.title}» 🍲\nПриготовлено с помощью SmartCook 👨‍🍳\n\nСмотри рецепт по ссылке:\n${recipeUrl}`; 
    try { if (navigator.share) await navigator.share({ title: dailyRecipe.title, text: fullText }); else { await navigator.clipboard.writeText(fullText); alert("Ссылка на сайт скопирована в буфер обмена!"); } } catch (err) {} 
  }; 

  const handleShareRecipe = async () => { 
    if (!recipe) return; const recipeUrl = recipe.id ? `${window.location.origin}/?recipeId=${recipe.id}` : window.location.origin; const fullText = `«${recipe.title}» 🍲\nПриготовлено с помощью SmartCook 👨‍🍳\n\nОткрой рецепт по ссылке:\n${recipeUrl}`; 
    try { if (navigator.share) await navigator.share({ title: recipe.title, text: fullText }); else { await navigator.clipboard.writeText(fullText); alert("Ссылка на рецепт скопирована в буфер обмена!"); } } catch (err) {} 
  }; 

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => { 
    const files = e.target.files; if (!files || files.length === 0) return; 
    setPreview(URL.createObjectURL(files[0])); setAnalysisResult(null); setRecipe(null); setSelectedDish(null); setQuestion(""); setAnswer(null); setIsProcessing(true); setIsHistoryView(false); setFromFeed(false); setServings(1);  
    try { 
      const imageCompression = (await import('browser-image-compression')).default; 
      const compressedFile = await imageCompression(files[0], { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, fileType: "image/jpeg" }); 
      const finalFile = new File([compressedFile], "image.jpg", { type: "image/jpeg" }); 
      setFile(finalFile); setPreview(URL.createObjectURL(finalFile));  
    } catch (error) { alert("Не удалось обработать фото."); setFile(null); } finally { setIsProcessing(false); } 
  }; 

  const triggerFileInput = () => document.getElementById('hidden-file-input')?.click(); 

  const handleAnalyze = async () => { 
    if (!file) return; setAnalyzing(true); setRecipe(null); 
    try { 
      const formData = new FormData(); formData.append("image", file); formData.append("mode", cookingMode); formData.append("allergies", allergies.join(', ')); formData.append("dislikes", dislikes.join(', '));
      const response = await fetch("/api/analyze", { method: "POST", body: formData }); 
      const json = await response.json(); if (json.error) throw new Error(json.error);  
      setAnalysisResult(json.data); 
    } catch (err: any) { alert("Ошибка: " + err.message); } finally { setAnalyzing(false); } 
  }; 

  const handleRegenerate = async () => { 
    if (!analysisResult) return; setIsRegenerating(true); 
    try { 
      const response = await fetch("/api/regenerate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ingredients: analysisResult.ingredients }) }); 
      const json = await response.json(); if (json.error) throw new Error(json.error); 
      setAnalysisResult({ ...analysisResult, dishes: json.dishes }); 
    } catch (err: any) { alert("Ошибка"); } finally { setIsRegenerating(false); } 
  }; 

  const handleRewardForRecipe = () => {
    const today = new Date().toLocaleDateString();
    const lastGen = localStorage.getItem('sc_last_gen_date');
    if (lastGen !== today) {
      localStorage.setItem('sc_last_gen_date', today);
      setCooks(prev => prev + 100);
      setTimeout(() => alert("🎉 Поздравляем! Вы заработали 100 куков за первый сгенерированный рецепт сегодня! Загляните в 'Мой ресторан'."), 1500);
    }
  };

  const getRecipeFromPhoto = async (dishName: string) => { 
    if (!analysisResult || !userId) return; setSelectedDish(dishName); setLoadingRecipe(true); setRecipe(null); setIsHistoryView(false); setFromFeed(false); setServings(1);  
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); 
    try { 
      const response = await fetch("/api/recipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dish: dishName, ingredients: analysisResult.ingredients, sessionId: userId, allergies, dislikes }) }); 
      const json = await response.json(); if (json.error) throw new Error(json.error);  
      setRecipe({ ...json.recipe, ingredients: analysisResult.ingredients });  
      if (userId) {
         await supabase.from('recipes').insert({ session_id: userId, title: json.recipe.title, description: json.recipe.description, time: String(json.recipe.time), calories: String(json.recipe.calories), ingredients: json.recipe.detailed_ingredients?.map((i:any) => `${i.name} - ${i.amount}`) || [], detailed_ingredients: json.recipe.detailed_ingredients, missing_ingredients: json.recipe.missing_ingredients, steps: json.recipe.steps, is_favorite: false }); 
         fetchMyRecipes(userId); 
      }
      handleRewardForRecipe();
    } catch (err: any) { alert("Ошибка: " + err.message); } finally { setLoadingRecipe(false); } 
  }; 

  const handleSmartVariant = async () => { 
    setLoadingRecipe(true); setIsHistoryView(false); setFromFeed(false); setServings(1);  
    try { 
      if (analysisResult) { 
        const response = await fetch("/api/regenerate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ingredients: analysisResult.ingredients }) }); 
        const json = await response.json(); if (json.error) throw new Error(json.error); 
        const newDishes = json.dishes.filter((d: string) => d !== selectedDish); 
        setAnalysisResult({ ...analysisResult, dishes: json.dishes }); 
        await getRecipeFromPhoto(newDishes.length > 0 ? newDishes[0] : json.dishes[0]); 
      } else if (searchMode === 'text' && textQuery) { 
        await handleTextSearch();
      } 
    } catch (err: any) { alert("Ошибка"); } finally { setLoadingRecipe(false); } 
  }; 

  const handleTextSearch = async () => { 
    if (!textQuery.trim() || !userId) return; setLoadingRecipe(true); setRecipe(null); setAnalysisResult(null); setIsHistoryView(false); setFromFeed(false); setServings(1);  
    try { 
      const response = await fetch("/api/search-recipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: textQuery, sessionId: userId, allergies, dislikes }) }); 
      const json = await response.json(); if (!response.ok) throw new Error(json.error || "Ошибка поиска"); 
      setRecipe({ ...json.recipe, missing_ingredients: json.recipe.missing_ingredients || [] });  
      if (userId) {
         await supabase.from('recipes').insert({ session_id: userId, title: json.recipe.title, description: json.recipe.description, time: String(json.recipe.time), calories: String(json.recipe.calories), ingredients: json.recipe.detailed_ingredients?.map((i:any) => `${i.name} - ${i.amount}`) || [], detailed_ingredients: json.recipe.detailed_ingredients, missing_ingredients: json.recipe.missing_ingredients, steps: json.recipe.steps, is_favorite: false }); 
         fetchMyRecipes(userId); 
      }
      handleRewardForRecipe();
    } catch (err: any) { alert("🛑 " + err.message); } finally { setLoadingRecipe(false); } 
  }; 

  const handleAskChef = async () => { 
    const currentContext = activeView === 'daily' ? (dailyRecipe as any) : recipe; 
    if (!question.trim() || !currentContext) return; setAsking(true); setAnswer(null); 
    try { 
      const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: question, recipeContext: currentContext }) }); 
      const json = await response.json(); if (json.error) throw new Error(json.error); setAnswer(json.answer); 
    } catch (err: any) { alert("Ошибка"); } finally { setAsking(false); } 
  }; 

  const loadFromHistory = (item: DBRecipe, source: 'photos' | 'history' | 'profile_history' | 'profile_favorites' = 'history') => { 
    setAnalysisResult(null); setQuestion(""); setAnswer(null); setServings(1);  
    setRecipe({ id: item.id, is_favorite: item.is_favorite, title: item.title, description: item.description, time: item.time, calories: item.calories, steps: item.steps || [], missing_ingredients: item.missing_ingredients || [], ingredients: item.ingredients || [], detailed_ingredients: item.detailed_ingredients || [] }); 
    setFromFeed(source === 'history' ? false : source); setIsHistoryView(source === 'history' || source === 'profile_history' || source === 'profile_favorites'); setIsSharedView(false);  
    window.scrollTo({ top: 0, behavior: 'smooth' }); setActiveView('service');  
  }; 

  const loadSharedRecipe = async (id: string, source: 'photos' | false = false) => { 
    try { 
      const { data, error } = await supabase.from('recipes').select('*').eq('id', id).single(); 
      if (data && !error) { 
        setAnalysisResult(null); setQuestion(""); setAnswer(null); setServings(1);  
        setRecipe({ id: data.id, is_favorite: data.is_favorite, title: data.title, description: data.description, time: data.time, calories: data.calories, steps: data.steps || [], missing_ingredients: data.missing_ingredients || [], ingredients: data.ingredients || [], detailed_ingredients: data.detailed_ingredients || [] }); 
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

  const renderCommentUI = (c: DBComment, isReply: boolean = false) => {
    const { isDev, restBadge } = getUserBadges(c.user_id, userLevels[c.user_id]);
    return ( 
      <div key={c.id} style={{ background: isReply ? '#f8fafc' : 'white', padding: '12px 15px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: isReply ? '10px' : '0', marginLeft: isReply ? '25px' : '0', position: 'relative' }}> 
        {isReply && <div style={{position: 'absolute', left: '-15px', top: '20px', width: '15px', height: '2px', background: '#cbd5e1'}} />} 
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}> 
          {c.user_avatar ? ( 
            <img src={c.user_avatar} alt="Avatar" style={{width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover'}} /> 
          ) : ( 
            <div style={{width: '28px', height: '28px', borderRadius: '50%', background: '#e2e8f0', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, flexShrink: 0}}> 
              {c.user_name?.charAt(0).toUpperCase()} 
            </div> 
          )} 
          <div style={{flex: 1, display: 'flex', flexDirection: 'column'}}> 
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}> 
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#111' }}>{c.user_name}</span>
                  {restBadge}
                </div>
                {isDev && <span style={{fontSize: '10px', background: '#111', color: '#38bdf8', padding: '2px 8px', borderRadius: '100px', fontWeight: 800}}>👨‍💻 Разработчик</span>}
              </div> 
              {user && user.id === c.user_id && ( 
                <button onClick={() => handleDeleteComment(c.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}><Trash2 size={14} /></button> 
              )} 
            </div> 
            <div style={{ fontSize: '14px', color: '#374151', lineHeight: 1.4, marginBottom: '8px', wordBreak: 'break-word' }}>{c.text}</div> 
            
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', justifyContent: 'flex-end', marginTop: '5px' }}> 
              {!isReply && ( 
                <div onClick={() => setReplyingTo({id: c.id, name: c.user_name})} style={{ fontSize: '12px', color: '#0ea5e9', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 600 }}> 
                  <CornerDownRight size={14} /> Ответить 
                </div> 
              )} 
              <div onClick={() => handleCommentLike(c)} style={{ fontSize: '12px', color: c.is_liked ? '#ef4444' : '#64748b', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 600 }}> 
                <Heart size={14} fill={c.is_liked ? "#ef4444" : "none"} /> {c.likes_count || 0} 
              </div> 
            </div> 
          </div> 
        </div> 
      </div> 
    );
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
        .menu-link { display: flex; align-items: center; gap: 14px; padding: 14px 16px; font-size: 16px; font-weight: 600; color: #475569; border-radius: 16px; cursor: pointer; transition: all 0.2s ease; margin-bottom: 4px; }
        .menu-link:hover { background: #f8fafc; }
        @keyframes floatUp { 0% { opacity: 1; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(-60px) scale(1.3); } }
        .float-coin { position: absolute; animation: floatUp 0.8s ease-out forwards; pointer-events: none; font-size: 24px; font-weight: 900; color: #f59e0b; text-shadow: 0px 2px 4px rgba(0,0,0,0.3); z-index: 10; }
      `}</style> 

      {/* --- МОДАЛКИ --- */}
      {fullScreenImage && ( 
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setFullScreenImage(null)}> 
          <button style={{position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', padding: '10px', color: 'white', cursor: 'pointer', backdropFilter: 'blur(5px)'}} onClick={() => setFullScreenImage(null)}> <X size={24} /> </button> 
          <img src={fullScreenImage} style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '12px'}} alt="Fullscreen" /> 
        </div> 
      )} 

      {isCropping && cropImageSrc && (
        <div style={{position: 'fixed', inset: 0, zIndex: 100001, background: 'black', display: 'flex', flexDirection: 'column'}}>
          <div style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: '80px'}}>
            <Cropper image={cropImageSrc} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} onCropChange={setCrop} onCropComplete={onCropComplete} onZoomChange={setZoom} style={{ containerStyle: { background: 'black' } }} />
          </div>
          <div style={{position: 'absolute', bottom: 0, left: 0, right: 0, height: '80px', padding: '15px 20px', background: '#111', display: 'flex', gap: '10px', paddingBottom: 'env(safe-area-inset-bottom, 20px)'}}>
             <button onClick={() => {setIsCropping(false); setCropImageSrc(null);}} style={{flex: 1, padding: '14px', borderRadius: '12px', background: '#333', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer'}}>Отмена</button>
             <button onClick={handleCropConfirm} style={{flex: 2, padding: '14px', borderRadius: '12px', background: '#0ea5e9', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer'}}>Выбрать</button>
          </div>
        </div>
      )}

      {/* --- МОДАЛКА КОММЕНТАРИЕВ --- */}
      {commentsModalPostId && ( 
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}> 
          <div className="animate-fade-in" style={{ background: '#f8fafc', width: '100%', maxWidth: '500px', height: '85dvh', paddingBottom: 'env(safe-area-inset-bottom, 15px)', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', display: 'flex', flexDirection: 'column', boxShadow: '0 -10px 40px rgba(0,0,0,0.2)' }}> 
            <div style={{ padding: '15px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', borderTopLeftRadius: '24px', borderTopRightRadius: '24px' }}> 
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Комментарии</h3> 
              <button onClick={() => setCommentsModalPostId(null)} style={{ minWidth: '32px', minHeight: '32px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: '#f1f5f9', border: 'none', borderRadius: '50%', padding: '0', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button> 
            </div> 
             
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}> 
              {isLoadingComments ? (
                 <div style={{ textAlign: 'center', color: '#0ea5e9', marginTop: '40px', fontWeight: 600 }}><Sparkles className="animate-spin" style={{display: 'inline', marginRight: '8px'}} size={18} /> Загрузка комментариев...</div>
              ) : postComments.length === 0 ? ( 
                <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '40px' }}>Пока нет комментариев. Будьте первым!</div> 
              ) : ( 
                postComments.filter(c => !c.parent_id).map((c) => ( 
                  <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}> 
                    {renderCommentUI(c)} 
                    {postComments.filter(reply => reply.parent_id === c.id).map(reply => renderCommentUI(reply, true))} 
                  </div> 
                )) 
              )} 
            </div> 

            <div style={{ padding: '15px', background: 'white', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}> 
              {replyingTo && ( 
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f1f5f9', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', color: '#475569', fontWeight: 600 }}> 
                  <span>Ответ пользователю: {replyingTo.name}</span> 
                  <button onClick={() => setReplyingTo(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={14} /></button> 
                </div> 
              )} 
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', width: '100%' }}> 
                <textarea  
                  placeholder="Написать комментарий..." 
                  value={newCommentText} 
                  onChange={(e) => {
                    setNewCommentText(e.target.value);
                    e.target.style.height = '44px';
                    e.target.style.height = (e.target.scrollHeight < 120 ? e.target.scrollHeight : 120) + 'px';
                  }}
                  onFocus={(e) => setTimeout(() => e.target.scrollIntoView({behavior: 'smooth', block: 'center'}), 300)}
                  rows={1}
                  style={{ flex: 1, width: '100%', padding: '12px 16px', borderRadius: '24px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none', background: '#f8fafc', resize: 'none', overflowY: 'auto', height: '44px', minHeight: '44px', maxHeight: '120px', boxSizing: 'border-box', lineHeight: '18px', fontFamily: 'inherit' }} 
                  onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }} 
                /> 
                <button onClick={submitComment} disabled={!newCommentText.trim()} style={{ background: newCommentText.trim() ? '#0ea5e9' : '#e0f2fe', color: 'white', border: 'none', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: newCommentText.trim() ? 'pointer' : 'default', transition: 'all 0.2s', flexShrink: 0 }}> 
                  <Send size={18} style={{marginLeft: '-2px'}}/> 
                </button> 
              </div> 
            </div> 
          </div> 
        </div> 
      )} 

      {/* --- АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ ПО ЛОГИНУ --- */}
      {isAuthModalOpen && ( 
        <div style={{ position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: '20px' }}> 
          <div className="animate-fade-in" style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '400px', padding: '30px 25px', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}> 
            <button onClick={() => setIsAuthModalOpen(false)} style={{position: 'absolute', top: '15px', right: '15px', background: '#f3f4f6', border: 'none', borderRadius: '50%', padding: '6px', cursor: 'pointer', color: '#6b7280'}}><X size={20} /></button> 
            <div style={{textAlign: 'center', marginBottom: '25px'}}> 
              <h2 style={{fontSize: '24px', fontWeight: 900, color: '#111', margin: '0 0 5px 0'}}>
                {authMode === 'register' ? 'Создать аккаунт' : 'Вход'}
              </h2> 
              <p style={{color: '#6b7280', fontSize: '13px', margin: 0, lineHeight: 1.4}}>
                Нам не нужны ваши личные данные! Никаких почт и телефонов — просто придумайте уникальный логин.
              </p> 
            </div> 

            <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}> 
              <div> 
                <input 
                  type="text" 
                  placeholder="Username (как в Telegram, от 4 симв.)" 
                  value={authUsername} 
                  onChange={(e) => setAuthUsername(e.target.value)} 
                  style={{width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #d1d5db', fontSize: '15px', marginBottom: '10px', outline: 'none', boxSizing: 'border-box'}} 
                /> 
                <input 
                  type="password" 
                  placeholder="Пароль (минимум 6 символов)" 
                  value={authPassword} 
                  onChange={(e) => setAuthPassword(e.target.value)} 
                  style={{width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #d1d5db', fontSize: '15px', marginBottom: '15px', outline: 'none', boxSizing: 'border-box'}} 
                /> 
                <button 
                  onClick={handleAuth} 
                  disabled={authLoading || authUsername.length < 4 || authPassword.length < 6} 
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '14px', borderRadius: '12px', background: (authUsername.length >= 4 && authPassword.length >= 6) ? '#059669' : '#d1fae5', color: (authUsername.length >= 4 && authPassword.length >= 6) ? 'white' : '#047857', border: 'none', fontSize: '15px', fontWeight: 700, cursor: (authUsername.length >= 4 && authPassword.length >= 6) ? 'pointer' : 'default', transition: 'all 0.2s' }}
                > 
                  {authLoading ? <Sparkles className="animate-spin" size={18} /> : null} 
                  {authLoading ? "Загрузка..." : authMode === 'register' ? "Зарегистрироваться" : "Войти"} 
                </button> 
              </div> 
            </div> 

            <div style={{marginTop: '20px', textAlign: 'center'}}>
              <span 
                onClick={() => setAuthMode(authMode === 'register' ? 'login' : 'register')}
                style={{color: '#0ea5e9', fontSize: '14px', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline'}}
              >
                {authMode === 'register' ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Создать'}
              </span>
            </div>
            
            <div style={{marginTop: '25px', padding: '15px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0'}}> 
              <p style={{fontSize: '11px', color: '#64748b', margin: 0, lineHeight: 1.5, textAlign: 'center'}}> 
                🛡 <strong>100% Анонимность.</strong> Вы сами придумываете логин и пароль. Это нужно только для того, чтобы ваши рецепты, фото и прогресс в ресторане сохранялись в вашем личном кабинете.
              </p> 
            </div> 
          </div> 
        </div> 
      )} 

      {/* Редактирование профиля с Username */}
      {isEditingProfile && user && ( 
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: '20px' }}> 
          <div className="animate-fade-in" style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '400px', padding: '30px 25px', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', textAlign: 'center' }}> 
            <h2 style={{fontSize: '20px', fontWeight: 900, color: '#111', margin: '0 0 20px 0'}}>Редактировать профиль</h2> 
             
            <div style={{position: 'relative', width: '100px', height: '100px', margin: '0 auto 20px auto', cursor: 'pointer'}} onClick={() => document.getElementById('avatar-upload')?.click()}> 
              {editAvatarPreview ? ( 
                <img src={editAvatarPreview} alt="Avatar" style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '3px solid #059669'}} /> 
              ) : ( 
                <div style={{background: '#059669', width: '100%', height: '100%', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '30px', fontWeight: 800}}> 
                  {user.user_metadata?.full_name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'U'} 
                </div> 
              )} 
              <div style={{position: 'absolute', bottom: 0, right: 0, background: '#111', color: 'white', padding: '6px', borderRadius: '50%', border: '2px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><Camera size={14} /></div> 
              <input id="avatar-upload" type="file" accept="image/*" style={{display: 'none'}} onChange={handleAvatarChange} /> 
            </div> 

            <div style={{textAlign: 'left', marginBottom: '15px'}}> 
              <label style={{fontSize: '12px', fontWeight: 700, color: '#64748b', marginLeft: '5px'}}>Имя профиля (Отображается всем)</label> 
              <input type="text" value={editProfileName} onChange={(e) => setEditProfileName(e.target.value)} style={{width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #d1d5db', fontSize: '15px', marginTop: '5px', outline: 'none', boxSizing: 'border-box'}} /> 
            </div> 

            <div style={{textAlign: 'left', marginBottom: '20px'}}> 
              <label style={{fontSize: '12px', fontWeight: 700, color: '#64748b', marginLeft: '5px'}}>Username (от 4 символов, без @)</label> 
              <input type="text" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} style={{width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #d1d5db', fontSize: '15px', marginTop: '5px', outline: 'none', boxSizing: 'border-box'}} /> 
            </div> 

            <div style={{display: 'flex', gap: '10px'}}> 
               <button onClick={() => {setIsEditingProfile(false); setEditAvatarFile(null); setEditUsername(user.user_metadata?.username || user.email?.split('@')[0] || "");}} style={{flex: 1, padding: '12px', borderRadius: '12px', background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 700, cursor: 'pointer'}}>Отмена</button> 
               <button onClick={handleProfileSave} disabled={isSavingProfile} style={{flex: 1, padding: '12px', borderRadius: '12px', background: '#059669', border: 'none', color: 'white', fontWeight: 700, cursor: isSavingProfile ? 'default' : 'pointer'}}> 
                 {isSavingProfile ? "Сохранение..." : "Сохранить"} 
               </button> 
            </div> 
          </div> 
        </div> 
      )} 

      {/* Окно фильтров */}
      {isPreferencesModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="animate-fade-in" style={{ background: 'white', width: '100%', maxWidth: '500px', padding: '25px', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', position: 'relative', boxShadow: '0 -10px 40px rgba(0,0,0,0.2)' }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>Фильтры для рецепта ⚙️</h3>
              <button onClick={() => setIsPreferencesModalOpen(false)} style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: '#f1f5f9', border: 'none', borderRadius: '50%', padding: '0', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
            </div>
            
            <p style={{fontSize: '13px', color: '#64748b', marginBottom: '20px', lineHeight: 1.4}}>
              Если вы авторизованы, эти настройки подтянутся из вашего профиля. Вы также можете настроить их прямо здесь на один раз.
            </p>

            <div style={{marginBottom: '20px'}}>
              <div style={{fontSize: '14px', fontWeight: 800, color: '#be123c', marginBottom: '10px'}}>Аллергии (Строго исключить)</div>
              <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px'}}>
                {allergies.map((item, idx) => (
                  <span key={idx} style={{background: '#ffe4e6', color: '#be123c', padding: '6px 12px', borderRadius: '100px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px'}}>
                    {item} <X size={14} onClick={() => removeAllergy(idx)} style={{cursor: 'pointer'}}/>
                  </span>
                ))}
              </div>
              <div style={{display: 'flex', gap: '8px'}}>
                <input type="text" placeholder="Например: орехи" value={newAllergy} onChange={e => setNewAllergy(e.target.value)} onKeyPress={e => e.key === 'Enter' && addAllergy()} style={{flex: 1, padding: '10px 15px', borderRadius: '12px', border: '1px solid #fecdd3', outline: 'none', fontSize: '14px', boxSizing: 'border-box'}} />
                <button onClick={addAllergy} style={{background: '#be123c', color: 'white', border: 'none', padding: '0 20px', borderRadius: '12px', fontWeight: 700}}><PlusCircle size={20}/></button>
              </div>
            </div>

            <div style={{marginBottom: '20px'}}>
              <div style={{fontSize: '14px', fontWeight: 800, color: '#b45309', marginBottom: '10px'}}>Не люблю (По возможности без этого)</div>
              <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px'}}>
                {dislikes.map((item, idx) => (
                  <span key={idx} style={{background: '#ffedd5', color: '#c2410c', padding: '6px 12px', borderRadius: '100px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px'}}>
                    {item} <X size={14} onClick={() => removeDislike(idx)} style={{cursor: 'pointer'}}/>
                  </span>
                ))}
              </div>
              <div style={{display: 'flex', gap: '8px'}}>
                <input type="text" placeholder="Например: лук" value={newDislike} onChange={e => setNewDislike(e.target.value)} onKeyPress={e => e.key === 'Enter' && addDislike()} style={{flex: 1, padding: '10px 15px', borderRadius: '12px', border: '1px solid #fed7aa', outline: 'none', fontSize: '14px', boxSizing: 'border-box'}} />
                <button onClick={addDislike} style={{background: '#ea580c', color: 'white', border: 'none', padding: '0 20px', borderRadius: '12px', fontWeight: 700}}><PlusCircle size={20}/></button>
              </div>
            </div>

            <button onClick={() => setIsPreferencesModalOpen(false)} style={{width: '100%', padding: '15px', borderRadius: '16px', background: '#111', color: 'white', border: 'none', fontWeight: 800, fontSize: '16px'}}>Готово</button>
          </div>
        </div>
      )}
       
      {/* КНОПКА МЕНЮ */}
      <button className="menu-btn" onClick={() => setIsMenuOpen(true)} style={{ position: 'fixed', top: '10px', left: '20px', zIndex: 50, background: 'white', borderRadius: '50%', width: '44px', height: '44px', padding: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: 'none', cursor: 'pointer' }}> 
        <Menu size={24} color="#111" /> 
      </button> 

      {/* МЕНЮ */}
      {isMenuOpen && ( 
        <> 
          <div className="menu-overlay" onClick={() => setIsMenuOpen(false)} style={{zIndex: 99}} /> 
          <div className={`menu-drawer ${isMenuOpen ? 'open' : ''}`} style={{ left: 0, right: 'auto', transform: isMenuOpen ? 'translateX(0)' : 'translateX(-100%)', zIndex: 100, borderTopRightRadius: '24px', borderBottomRightRadius: '24px', borderTopLeftRadius: '0', borderBottomLeftRadius: '0' }}> 
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '40px'}}> 
               <span style={{fontSize: '24px', fontWeight: '900', color: '#059669'}}>SmartCook</span> 
               <X size={24} onClick={() => setIsMenuOpen(false)} style={{cursor: 'pointer'}} /> 
            </div> 
             
            <div className="menu-link" onClick={() => { setProfileView('main'); switchView('profile'); }} style={{ background: activeView === 'profile' ? '#f1f5f9' : 'transparent', color: activeView === 'profile' ? '#0f172a' : '#475569', fontWeight: activeView === 'profile' ? 800 : 600 }}>
               <User size={22} color="#0ea5e9" style={{flexShrink: 0}}/> Личный кабинет
            </div> 
            <div className="menu-link" onClick={() => switchView('service')} style={{ background: activeView === 'service' ? '#f1f5f9' : 'transparent', color: activeView === 'service' ? '#0f172a' : '#475569', fontWeight: activeView === 'service' ? 800 : 600 }}>
               <Search size={22} color="#10b981" style={{flexShrink: 0}}/> Поиск
            </div> 
            <div className="menu-link" onClick={() => switchView('feed')} style={{ background: activeView === 'feed' ? '#f1f5f9' : 'transparent', color: activeView === 'feed' ? '#0f172a' : '#475569', fontWeight: activeView === 'feed' ? 800 : 600 }}> 
               <Globe size={22} color="#8b5cf6" style={{flexShrink: 0}}/> Лента 
            </div> 
            <div className="menu-link" onClick={() => switchView('game')} style={{ background: activeView === 'game' ? '#f1f5f9' : 'transparent', color: activeView === 'game' ? '#0f172a' : '#475569', fontWeight: activeView === 'game' ? 800 : 600 }}>
               <Store size={22} color="#f59e0b" style={{flexShrink: 0}}/> Мой ресторан
            </div> 
            <div className="menu-link" onClick={() => switchView('daily')} style={{ background: activeView === 'daily' ? '#f1f5f9' : 'transparent', color: activeView === 'daily' ? '#0f172a' : '#475569', fontWeight: activeView === 'daily' ? 800 : 600 }}>
               <Flame size={22} color="#f97316" style={{flexShrink: 0}}/> Рецепт дня
            </div> 
             
            <div className="menu-link" style={{ marginTop: '10px', background: activeView === 'about' ? '#f1f5f9' : 'transparent', color: activeView === 'about' ? '#0f172a' : '#475569', fontWeight: activeView === 'about' ? 800 : 600 }} onClick={() => switchView('about')}>
               <CheckCircle size={22} color="#3b82f6" style={{flexShrink: 0}}/> О проекте
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

      {activeView === 'game' && (
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
        <> 
          {!isHistoryView && fromFeed === false && !isSharedView && ( 
            <> 
              <div className="hero"> 
                <h1 className="brand-name">SmartCook</h1> 
                <div className="brand-sub">Ваш личный AI Шеф-повар</div> 
                {currentHoliday && ( 
                  <div className="animate-fade-in" style={{ background: currentHoliday.gradient, color: 'white', padding: '20px', borderRadius: '20px', marginTop: '25px', textAlign: 'center', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.3)', position: 'relative', overflow: 'hidden' }}> 
                     <div style={{position: 'absolute', top: '-10px', right: '-10px', width: '60px', height: '60px', background: 'white', opacity: 0.1, borderRadius: '50%'}}></div> 
                     <div style={{position: 'absolute', bottom: '-20px', left: '-10px', width: '80px', height: '80px', background: 'white', opacity: 0.1, borderRadius: '50%'}}></div> 
                     <div style={{fontSize: '22px', marginBottom: '8px', fontWeight: '700', fontFamily: '"Times New Roman", serif', fontStyle: 'italic'}}> {currentHoliday.icon} {currentHoliday.title} </div> 
                     <div style={{fontSize: '15px', lineHeight: '1.5', opacity: 0.95, fontWeight: '500'}}> {currentHoliday.text} </div> 
                  </div> 
                )} 
              </div> 

              <div className="daily-teaser" onClick={() => switchView('daily')}> 
                <div style={{background: '#fff7ed', padding: '12px', borderRadius: '12px'}}><Flame color="#f97316" size={24} /></div> 
                <div style={{flex: 1}}> 
                   <div style={{fontSize: '12px', fontWeight: 'bold', color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.5px'}}>🔥 Рецепт дня</div> 
                   <div style={{fontWeight: '800', fontSize: '18px'}}>{dailyRecipe ? dailyRecipe.title : "Секрет от шефа..."}</div> 
                </div> 
                <ArrowRight size={20} color="#cbd5e1"/> 
              </div> 

              <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px'}}>
                <div style={{flex: 1, display: 'flex', background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)', padding: '6px', borderRadius: '20px', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'}}> 
                  <button onClick={() => setSearchMode('photo')} style={{ flex: 1, padding: '8px 5px', borderRadius: '16px', border: 'none', background: searchMode === 'photo' ? 'white' : 'transparent', fontWeight: 800, fontSize: '15px', boxShadow: searchMode === 'photo' ? '0 4px 15px rgba(0,0,0,0.05)' : 'none', color: searchMode === 'photo' ? '#111' : '#64748b', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
                    <div style={{background: searchMode === 'photo' ? '#dcfce7' : '#f1f5f9', color: searchMode === 'photo' ? '#10b981' : '#94a3b8', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s', flexShrink: 0}}>
                       <Camera size={18} /> 
                    </div>
                    По фото
                  </button>
                  <button onClick={() => setSearchMode('text')} style={{ flex: 1, padding: '8px 5px', borderRadius: '16px', border: 'none', background: searchMode === 'text' ? 'white' : 'transparent', fontWeight: 800, fontSize: '15px', boxShadow: searchMode === 'text' ? '0 4px 15px rgba(0,0,0,0.05)' : 'none', color: searchMode === 'text' ? '#111' : '#64748b', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
                    <div style={{background: searchMode === 'text' ? '#e0f2fe' : '#f1f5f9', color: searchMode === 'text' ? '#0ea5e9' : '#94a3b8', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s', flexShrink: 0}}>
                       <Search size={18} /> 
                    </div>
                    По названию
                  </button>
                </div>
                
                <button onClick={() => setIsPreferencesModalOpen(true)} style={{background: 'white', border: '1px solid #e2e8f0', borderRadius: '20px', height: '52px', width: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', color: '#475569', flexShrink: 0}}>
                   <Settings size={22} />
                </button>
              </div>

              <div className="card"> 
                {searchMode === 'photo' ? ( 
                  <> 
                    {!file ? ( 
                      <div className="upload-zone"> 
                        <input id="hidden-file-input" type="file" accept="image/png, image/jpeg, image/jpg, .heic, .HEIC" className="upload-input" onChange={handleFileChange} /> 
                        <Camera size={48} color="#059669" style={{marginBottom: '15px'}} /> 
                        <div style={{fontWeight: '700', fontSize: '18px', color: '#374151', marginBottom: '5px'}}>Выберите фото</div> 
                        <div style={{fontSize: '14px', color: '#9ca3af'}}>HEIC, JPG, PNG</div> 
                      </div> 
                    ) : ( 
                      <div className="upload-compact"> 
                        {preview && <img src={preview} className="preview-img" alt="Preview" />} 
                        <input id="hidden-file-input" type="file" accept="image/png, image/jpeg, image/jpg, .heic, .HEIC" style={{display: 'none'}} onChange={handleFileChange} /> 
                        <button className="btn-replace" onClick={triggerFileInput}> <RotateCcw size={16} /> Заменить фото </button> 
                      </div> 
                    )} 

                    {file && ( 
                       <div className="mode-toggle-container"> 
                          <button className={`mode-btn ${cookingMode === 'strict' ? 'active' : ''}`} onClick={() => setCookingMode('strict')}><Lock size={16} /> Строго из этого</button> 
                          <button className={`mode-btn ${cookingMode === 'extended' ? 'active' : ''}`} onClick={() => setCookingMode('extended')}><ShoppingBag size={16} /> Могу докупить</button> 
                       </div> 
                    )} 

                    <button className="btn-primary" onClick={handleAnalyze} disabled={!file || analyzing || isProcessing}> 
                      {isProcessing ? "🔄 Обработка фото..." : analyzing ? "🔍 Изучаю продукты..." : "✨ Найти рецепт"} 
                    </button> 
                  </> 
                ) : ( 
                  <> 
                    <div style={{ position: 'relative', width: '100%', marginBottom: '15px' }}> 
                      <input type="text" className="text-search-input" placeholder="Например: Паста Карбонара" value={textQuery} onChange={(e) => setTextQuery(e.target.value)} style={{ paddingRight: textQuery ? '40px' : '15px', marginBottom: 0, boxSizing: 'border-box' }} /> 
                      {textQuery && ( <button onClick={() => setTextQuery("")} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}><X size={18} /></button> )} 
                    </div> 
                    <button className="btn-primary" onClick={handleTextSearch} disabled={loadingRecipe || !textQuery.trim()}> {loadingRecipe ? "🍳 Готовлю..." : "🔍 Найти рецепт"} </button> 
                  </> 
                )} 
              </div> 
            </> 
          )} 

          {analysisResult && !isSharedView && !isHistoryView && ( 
            <div className="card"> 
              <h3 style={{textAlign: 'center', marginBottom: '20px'}}>Я вижу продукты:</h3> 
              <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginBottom: '25px'}}> 
                {analysisResult.ingredients?.map((ing, i) => <span key={i} style={{background: '#d1fae5', color: '#065f46', padding: '6px 12px', borderRadius: '100px', fontSize: '14px', fontWeight: 600}}>{ing}</span>)} 
              </div> 
              <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}> 
                {analysisResult.dishes?.map((dish, i) => ( 
                  <button key={i} onClick={() => getRecipeFromPhoto(dish)} className="btn-secondary" disabled={loadingRecipe} style={{ opacity: loadingRecipe && selectedDish !== dish ? 0.5 : 1, borderColor: selectedDish === dish ? '#f97316' : '#e5e7eb', background: selectedDish === dish ? '#fff7ed' : 'white' }}> 
                    <span>{dish}</span> {loadingRecipe && selectedDish === dish ? ( <Sparkles className="animate-spin" size={24} color="#f97316" /> ) : ( <ChevronRight color="#d1d5db" /> )} 
                  </button> 
                ))} 
              </div> 
              <button className="btn-magic" onClick={handleRegenerate} disabled={isRegenerating || loadingRecipe}> 
                 <Sparkles size={20} /> {isRegenerating ? "Включаю фантазию..." : "✨ Хочу что-то необычное"} 
              </button> 
            </div> 
          )} 

          {recipe && ( 
            <div className="card" style={{position: 'relative', overflow: 'visible', marginTop: (isSharedView || fromFeed || isHistoryView) ? '60px' : '20px'}}> 
              {isSharedView && ( 
                <button onClick={handleBackToSearch} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '100px', padding: '8px 16px', color: '#374151', fontSize: '14px', fontWeight: 600, marginBottom: '20px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', transition: 'all 0.2s' }}> 
                  <Search size={18} color="#059669" /> К поиску 
                </button> 
              )} 

              {(fromFeed !== false || isHistoryView) && !isSharedView && ( 
                <button onClick={fromFeed ? handleBackToSource : handleBackToSearch} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '100px', padding: '8px 16px', color: '#374151', fontSize: '14px', fontWeight: 600, marginBottom: '20px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', transition: 'all 0.2s' }}> 
                  <ArrowLeft size={18} />  
                  {fromFeed === 'photos' ? "Назад к ленте" :  
                   fromFeed === 'profile_history' ? "Назад в историю" :  
                   fromFeed === 'profile_favorites' ? "Назад в избранное" :  
                   "Назад к истории"} 
                </button> 
              )} 

              <div className="recipe-header" style={{flexDirection: 'column', alignItems: 'flex-start', gap: '15px'}}> 
                <div style={{display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'flex-start', gap: '10px'}}> 
                  <h2 className="recipe-title" style={{marginBottom: 0, fontSize: '24px', flex: 1, wordBreak: 'break-word', lineHeight: 1.2}}>{recipe.title}</h2> 
                  <div style={{display: 'flex', gap: '15px', alignItems: 'center', flexShrink: 0, marginTop: '2px'}}> 
                    <div onClick={handleShareRecipe} style={{cursor: 'pointer', display: 'flex'}}> <Share2 size={30} color="#d1d5db" style={{ transition: 'color 0.2s' }} /> </div> 
                    <div onClick={(e) => toggleFavorite(e, recipe.id!, recipe.is_favorite)} style={{cursor: 'pointer'}}> 
                      <Heart size={30} className={recipe.is_favorite ? "fill-red-500 text-red-500" : "text-gray-300"} color={recipe.is_favorite ? "#ef4444" : "#d1d5db"} fill={recipe.is_favorite ? "#ef4444" : "none"} /> 
                    </div> 
                  </div> 
                </div> 

                {recipe.description && ( <p style={{fontSize: '15px', color: '#4b5563', lineHeight: '1.5', margin: '5px 0 15px 0'}}>{recipe.description}</p> )} 
               
                {!fromFeed && !isSharedView && !isHistoryView && (analysisResult || (searchMode === 'text' && recipe)) && ( 
                  <button onClick={handleSmartVariant} disabled={loadingRecipe} className="btn-smart-variant"> 
                    {loadingRecipe ? ( <Sparkles className="animate-spin" size={24} color="#f97316"/> ) : ( <Shuffle size={20} color="#f97316"/> )} 
                    <span style={{flex: 1, textAlign: 'left'}}> {loadingRecipe ? "Ищем идеи..." : "Подобрать другой рецепт"} </span> 
                    <ChevronRight size={18} color="#9ca3af" /> 
                  </button> 
                )} 
              </div> 

              <div className="recipe-tags" style={{marginTop: '15px', marginBottom: '15px'}}> 
                <div className="tag-badge"><Clock size={16}/> {formatTime(recipe.time)}</div> 
                {recipe.calories && <div className="tag-badge orange"><Flame size={16}/> {formatCalories(recipe.calories)}</div>} 
              </div> 

              {recipe.detailed_ingredients && recipe.detailed_ingredients.length > 0 && ( 
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', background: '#f9fafb', padding: '10px 15px', borderRadius: '12px', width: 'fit-content' }}> 
                  <span style={{fontWeight: 700, color: '#374151', fontSize: '15px'}}>🍽 Порции:</span> 
                  <div style={{display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #d1d5db', borderRadius: '8px', overflow: 'hidden'}}> 
                    <button onClick={() => setServings(prev => typeof prev === 'number' && prev > 1 ? prev - 1 : 1)} disabled={servings === 1 || servings === ""} style={{padding: '6px 12px', background: 'transparent', border: 'none', fontSize: '18px', color: (servings === 1 || servings === "") ? '#d1d5db' : '#374151', cursor: (servings === 1 || servings === "") ? 'default' : 'pointer', fontWeight: 600}}> - </button> 
                    <input type="number" value={servings} onChange={(e) => { const val = e.target.value; if (val === '') setServings(''); else { const num = parseInt(val); if (!isNaN(num) && num > 0 && num <= 100) setServings(num); } }} onBlur={() => { if (servings === "") setServings(1); }} style={{width: '40px', textAlign: 'center', border: 'none', borderLeft: '1px solid #d1d5db', borderRight: '1px solid #d1d5db', padding: '6px 0', fontSize: '16px', fontWeight: 700, color: '#111', outline: 'none', boxSizing: 'border-box'}} /> 
                    <button onClick={() => setServings(prev => typeof prev === 'number' ? prev + 1 : 2)} style={{padding: '6px 12px', background: 'transparent', border: 'none', fontSize: '18px', color: '#374151', cursor: 'pointer', fontWeight: 600}}> + </button> 
                  </div> 
                </div> 
              )} 

              {(() => { 
                const itemsToBuy = (fromFeed && recipe.detailed_ingredients) ? recipe.detailed_ingredients.map(ing => ing.name) : (recipe.missing_ingredients || []); 
                if (itemsToBuy.length === 0) return null; 
                return ( 
                  <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '12px', padding: '15px', margin: '20px 0', color: '#92400e' }}> 
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 800}}> <ShoppingCart size={20} /> {(searchMode === 'text' || fromFeed || isSharedView) ? "Нужно купить:" : "Нужно докупить:"} </div> 
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px'}}> 
                      {itemsToBuy.map((item, idx) => ( <a key={idx} href={`https://www.ozon.ru/search/?text=${encodeURIComponent(item)}&from_global=true`} target="_blank" rel="noopener noreferrer" style={{ background: '#fef3c7', padding: '6px 12px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, textDecoration: 'none', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #fcd34d', cursor: 'pointer', transition: 'all 0.2s' }}> {item} <ExternalLink size={12} style={{opacity: 0.6}} /> </a> ))} 
                    </div> 
                    <div style={{fontSize: '12px', color: '#b45309', display: 'flex', alignItems: 'center', gap: '5px'}}> <Info size={14} /> Нажмите на ингредиент, чтобы заказать быструю доставку Ozon Fresh до двери </div> 
                  </div> 
                ); 
              })()} 

              {recipe.detailed_ingredients && ( 
                <div className="ing-box"> 
                  <h3 style={{marginTop: 0, marginBottom: '15px'}}>Ингредиенты</h3> 
                  {recipe.detailed_ingredients.map((ing, i) => ( 
                    <div key={i} className="ing-row"> <span>{ing.name}</span> <span className="ing-val">{scaleAmount(ing.amount, actualServings)}</span> </div> 
                  ))} 
                </div> 
              )} 

              <h3 style={{fontSize: '22px', fontWeight: 800, marginBottom: '20px'}}>👨‍🍳 Рецепт приготовления</h3> 
              <div> 
                {recipe.steps?.map((step, i) => ( 
                  <div key={i} className="step-row"> <div className="step-num">{i + 1}</div> <div className="step-text">{cleanText(step)}</div> </div> 
                ))} 
              </div> 

              <div className="chat-box" style={{marginTop: '30px', background: '#e0f2fe', padding: '20px', borderRadius: '24px', border: '2px solid #93c5fd'}}> 
                <div style={{fontWeight: 800, marginBottom: '20px', color: '#0369a1', fontSize: '18px', textAlign: 'center'}}> Задайте вопрос AI шеф-повару! </div> 
                <div style={{display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'flex-start', width: '100%'}}> 
                   <div style={{ fontWeight: 800, fontSize: '15px', color: '#0284c7', paddingLeft: '5px', display: 'flex', alignItems: 'center', gap: '6px' }}><Sparkles size={16} /> Спросить AI Шефа:</div>
                   <div style={{display: 'flex', gap: '10px', alignItems: 'flex-end', width: '100%'}}>
                      <textarea 
                        value={question} 
                        onChange={(e) => {
                          setQuestion(e.target.value);
                          e.target.style.height = '44px';
                          e.target.style.height = (e.target.scrollHeight < 120 ? e.target.scrollHeight : 120) + 'px';
                        }} 
                        rows={1}
                        disabled={asking}
                        style={{ flex: 1, width: '100%', padding: '12px 16px', borderRadius: '22px', border: '1px solid #93c5fd', fontSize: '15px', outline: 'none', background: asking ? '#f8fafc' : 'white', resize: 'none', overflowY: 'auto', height: '44px', minHeight: '44px', maxHeight: '120px', boxSizing: 'border-box', lineHeight: '18px', fontFamily: 'inherit' }}
                      /> 
                      <button onClick={handleAskChef} disabled={asking || !question.trim()} style={{flexShrink: 0, padding: 0, width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: (asking || !question.trim()) ? '#bae6fd' : '#3b82f6', color: 'white', border: 'none', cursor: (asking || !question.trim()) ? 'default' : 'pointer'}}> <Send size={18} style={{marginLeft: '-2px'}}/> </button> 
                   </div>
                </div> 
                {asking && (
                  <div style={{marginTop: '15px', color: '#0ea5e9', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center'}}>
                    <Sparkles className="animate-spin" size={16} /> Шеф-повар думает над ответом...
                  </div>
                )}
                {answer && !asking && <div style={{marginTop: '20px', lineHeight: 1.5, background: 'white', padding: '15px', borderRadius: '16px'}}><strong>Ответ:</strong> {answer}</div>} 
              </div> 

              <div style={{marginTop: '30px', background: '#f8fafc', padding: '25px 20px', borderRadius: '16px', border: '1px solid #e2e8f0', textAlign: 'center'}}> 
                <h3 style={{fontSize: '18px', fontWeight: 800, marginBottom: '5px', color: '#1f2937'}}>📸 Приготовили? Покажите результат!</h3> 
                <p style={{fontSize: '13px', color: '#64748b', marginBottom: '15px', lineHeight: 1.4}}> Ваше фото появится в разделе <strong>«Лента»</strong>, где его смогут оценить другие пользователи! </p> 
                {!user ? ( 
                   <button className="btn-primary" onClick={() => setIsAuthModalOpen(true)}>Войти, чтобы опубликовать фото</button> 
                ) : ( 
                   <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}> 
                     {!userPhotoFile ? ( 
                        <div style={{border: '2px dashed #cbd5e1', borderRadius: '12px', padding: '20px', cursor: 'pointer', background: 'white'}} onClick={() => {setIsStandaloneUploadOpen(false); document.getElementById('user-photo-upload')?.click();}}> 
                           <Camera size={32} color="#f97316" style={{margin: '0 auto 10px auto'}} /> 
                           <div style={{fontSize: '14px', fontWeight: 600, color: '#4b5563'}}>Нажмите, чтобы загрузить фото блюда</div> 
                           <input id="user-photo-upload" type="file" accept="image/*" style={{display: 'none'}} onChange={handleUserPhotoChange} /> 
                        </div> 
                     ) : ( 
                        <div style={{background: 'white', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0'}}> 
                           <img src={userPhotoPreview!} alt="Preview" style={{width: '100%', height: '200px', objectFit: 'cover', borderRadius: '8px', marginBottom: '15px'}} /> 
                           <textarea 
                             placeholder="Описание (как получилось?)" 
                             value={userComment} 
                             onChange={(e) => {
                               setUserComment(e.target.value);
                               e.target.style.height = '44px';
                               e.target.style.height = (e.target.scrollHeight) + 'px';
                             }} 
                             rows={1}
                             style={{width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #fdba74', fontSize: '15px', marginBottom: '15px', outline: 'none', resize: 'none', overflow: 'hidden', minHeight: '44px', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: '18px'}} 
                           /> 
                           <div style={{display: 'flex', gap: '10px'}}> 
                             <button onClick={() => {setUserPhotoFile(null); setUserPhotoPreview(null); setUserComment("");}} style={{flex: 1, padding: '12px', borderRadius: '8px', background: '#f3f4f6', border: 'none', color: '#4b5563', fontWeight: 700, cursor: 'pointer'}}>Отмена</button> 
                             <button onClick={() => submitFeedPost(recipe)} disabled={isUploadingPhoto} style={{flex: 2, padding: '12px', borderRadius: '8px', background: '#ea580c', border: 'none', color: 'white', fontWeight: 700, cursor: isUploadingPhoto ? 'default' : 'pointer'}}> {isUploadingPhoto ? "Отправка..." : "Отправить в ленту"} </button> 
                           </div> 
                        </div> 
                     )} 
                   </div> 
                )} 
              </div> 
            </div> 
          )} 

          {!isHistoryView && !fromFeed && !isSharedView && ( 
            <> 
              <div className="history-bar" style={{marginTop: '40px'}}> 
                <span className="history-title">📜 История рецептов</span> 
                <div className="history-filters"> 
                  <button className={`filter-pill ${filterMode === 'all' ? 'active' : ''}`} onClick={() => setFilterMode('all')}>Все</button> 
                  <button className={`filter-pill ${filterMode === 'favorites' ? 'active' : ''}`} onClick={() => setFilterMode('favorites')}>❤️ Избранное</button> 
                </div> 
              </div> 
               
              {historyExpanded && displayedFeed && displayedFeed.length > 4 && ( 
                <button className="btn-expand-history" onClick={() => setHistoryExpanded(false)} style={{marginTop: '0', marginBottom: '15px'}}> Свернуть историю <ChevronUp size={16}/> </button> 
              )} 
               
              {displayedFeed?.length === 0 && filterMode === 'favorites' ? ( 
                 <div className="empty-msg">В избранном пока пусто 💔<br/>Добавьте рецепты лайком!</div> 
              ) : ( 
                <> 
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '15px', marginBottom: '10px' }}> 
                    {visibleHistory?.map((item) => ( 
                      // ИСТОРИЯ РЕЦЕПТОВ - КРАСИВОЕ ИЗБРАННОЕ С ФОНОМ
                      <div key={item.id} className="card" style={{ padding: '15px', cursor: 'pointer', marginBottom: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid #e5e7eb', position: 'relative', overflow: 'hidden', background: item.is_favorite ? '#fff5f5' : 'white' }} onClick={() => loadFromHistory(item, 'history')}> 
                        {item.is_favorite && (
                          <div style={{ position: 'absolute', top: '10px', right: '10px', color: '#ef4444' }}>
                            <Heart size={18} className="fill-red-500" fill="#ef4444" />
                          </div>
                        )}
                        <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px', lineHeight: 1.3, height: '38px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word', position: 'relative', paddingRight: item.is_favorite ? '22px' : 0 }}> {item.title} </div> 
                        <div style={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6b7280'}}> 
                           <div style={{display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap'}}><Clock size={12}/> {formatTime(item.time)}</div> 
                           {item.calories && <div style={{display: 'flex', alignItems: 'center', gap: '3px', color: '#f97316', whiteSpace: 'nowrap'}}><Flame size={12}/> {formatCalories(item.calories)}</div>} 
                        </div> 
                      </div> 
                    ))} 
                  </div> 

                  {!historyExpanded && displayedFeed && displayedFeed.length > 4 && ( 
                    <button className="btn-expand-history" onClick={() => setHistoryExpanded(true)}> Показать еще ({displayedFeed.length - 4}) <ChevronDown size={16}/> </button> 
                  )} 
                </> 
              )} 
            </> 
          )} 

          {!isHistoryView && !fromFeed && !isSharedView && ( 
            <section style={{marginTop: '40px', padding: '20px', background: '#f9fafb', borderRadius: '16px', color: '#6b7280', fontSize: '14px', lineHeight: '1.6'}}> 
              <h2 style={{fontSize: '18px', color: '#1f2937', marginBottom: '10px', fontWeight: '700'}}>SmartCook: Генератор рецептов по фото</h2> 
              <p>SmartCook использует искусственный интеллект для распознавания продуктов и создания рецептов за секунды.</p> 
            </section> 
          )} 
        </> 
      )} 
    </div> 
  ); 
}