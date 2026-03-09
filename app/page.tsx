"use client";

import { useState, useEffect, useRef, ChangeEvent } from "react";
import { supabase } from "@/lib/supabase";
import { Menu, X, Flame, Search, CheckCircle, Sparkles, Globe, User, Store, Settings } from "lucide-react";

import type { AnalysisData, RecipeData, DBRecipe, DailyRecipeType, HolidayType, DBComment } from "@/lib/types";
import { DEVELOPER_ID, scaleAmount, formatCooks, cleanText, formatTime, formatCalories, getCroppedImg } from "@/lib/utils";

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

  const [toast, setToast] = useState<{ message: string; icon?: React.ReactNode; type?: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, icon?: React.ReactNode, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, icon, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4500);
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
    if (!authUsername.trim() || authPassword.length < 6) { showToast("Введите логин и пароль (мин. 6 символов)", undefined, 'error'); return; }
    
    const safeUsername = authUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (safeUsername.length < 4) { showToast("Логин: только a-z, 0-9, _ (мин. 4 символа)", undefined, 'error'); return; }

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
            showToast("Этот Username уже занят! Выберите другой или войдите.", undefined, 'error');
          } else throw error;
        } else {
          showToast("Добро пожаловать, шеф! 🎉", <Sparkles size={18} color="#fbbf24" />);
          setIsAuthModalOpen(false);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: dummyEmail, password: authPassword });
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            showToast("Неверный Username или пароль!", undefined, 'error');
          } else throw error;
        } else {
          setIsAuthModalOpen(false);
        }
      }
    } catch (e: any) { 
      showToast("Ошибка: " + e.message, undefined, 'error'); 
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
    } catch (e) { showToast("Не удалось обработать фото", undefined, 'error'); setUserPhotoFile(null); setUserPhotoPreview(null); }
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

      showToast("🎉 Фото на проверке у шефа! +1000 куков!", <Sparkles size={18} color="#fbbf24" />); 
      setCooks(prev => prev + 1000); setUserPhotoFile(null); setUserPhotoPreview(null); setUserComment(""); setStandaloneTitle(""); setIsStandaloneUploadOpen(false); 
    } catch (err: any) { showToast("Ошибка отправки: " + err.message, undefined, 'error'); } finally { setIsUploadingPhoto(false); } 
  }; 

  const handleShareDaily = async () => { 
    if (!dailyRecipe) return; const recipeUrl = `${window.location.origin}/?daily=true`; const fullText = `«${dailyRecipe.title}» 🍲\nПриготовлено с помощью SmartCook 👨‍🍳\n\nСмотри рецепт по ссылке:\n${recipeUrl}`; 
    try { if (navigator.share) await navigator.share({ title: dailyRecipe.title, text: fullText }); else { await navigator.clipboard.writeText(fullText); showToast("📋 Ссылка скопирована в буфер обмена!"); } } catch (err) {} 
  }; 

  const handleShareRecipe = async () => { 
    if (!recipe) return; const recipeUrl = recipe.id ? `${window.location.origin}/?recipeId=${recipe.id}` : window.location.origin; const fullText = `«${recipe.title}» 🍲\nПриготовлено с помощью SmartCook 👨‍🍳\n\nОткрой рецепт по ссылке:\n${recipeUrl}`; 
    try { if (navigator.share) await navigator.share({ title: recipe.title, text: fullText }); else { await navigator.clipboard.writeText(fullText); showToast("📋 Ссылка скопирована в буфер обмена!"); } } catch (err) {} 
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
      const response = await fetch("/api/analyze", { method: "POST", body: formData }); 
      const json = await response.json(); if (json.error) throw new Error(json.error);  
      setAnalysisResult(json.data); 
    } catch (err: any) { showToast("Ошибка: " + err.message, undefined, 'error'); } finally { setAnalyzing(false); } 
  }; 

  const handleRegenerate = async () => { 
    if (!analysisResult) return; setIsRegenerating(true); 
    try { 
      const response = await fetch("/api/regenerate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ingredients: analysisResult.ingredients }) }); 
      const json = await response.json(); if (json.error) throw new Error(json.error); 
      setAnalysisResult({ ...analysisResult, dishes: json.dishes }); 
    } catch (err: any) { showToast("Ошибка", undefined, 'error'); } finally { setIsRegenerating(false); } 
  }; 

  const handleRewardForRecipe = () => {
    const today = new Date().toLocaleDateString();
    const lastGen = localStorage.getItem('sc_last_gen_date');
    if (lastGen !== today) {
      localStorage.setItem('sc_last_gen_date', today);
      setCooks(prev => prev + 100);
      setTimeout(() => showToast("🎉 +100 куков за первый рецепт сегодня!", <Sparkles size={18} color="#fbbf24" />), 1500);
    }
  };

  const rewardForSaving = (estimatedCost?: number) => {
    if (estimatedCost === undefined || estimatedCost === null) return;
    const savings = 800 - estimatedCost;
    if (savings >= 500) {
      setCooks(prev => prev + 500);
      setTimeout(() => showToast("💰 +500 куков за экономию бюджета!", <Sparkles size={18} color="#fbbf24" />), 2000);
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
         await supabase.from('recipes').insert({ session_id: userId, title: json.recipe.title, description: json.recipe.description, time: String(json.recipe.time), calories: String(json.recipe.calories), ingredients: json.recipe.detailed_ingredients?.map((i:any) => `${i.name} - ${i.amount}`) || [], detailed_ingredients: json.recipe.detailed_ingredients, missing_ingredients: json.recipe.missing_ingredients, steps: json.recipe.steps, is_favorite: false, estimated_cost: json.recipe.estimated_cost || null, budget_tier: json.recipe.budget_tier || null }); 
         fetchMyRecipes(userId); 
      }
      handleRewardForRecipe();
      rewardForSaving(json.recipe.estimated_cost);
    } catch (err: any) { showToast("Ошибка: " + err.message, undefined, 'error'); } finally { setLoadingRecipe(false); } 
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
    } catch (err: any) { showToast("Ошибка", undefined, 'error'); } finally { setLoadingRecipe(false); } 
  }; 

  const handleTextSearch = async () => { 
    if (!textQuery.trim() || !userId) return; setLoadingRecipe(true); setRecipe(null); setAnalysisResult(null); setIsHistoryView(false); setFromFeed(false); setServings(1);  
    try { 
      const response = await fetch("/api/search-recipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: textQuery, sessionId: userId, allergies, dislikes }) }); 
      const json = await response.json(); if (!response.ok) throw new Error(json.error || "Ошибка поиска"); 
      setRecipe({ ...json.recipe, missing_ingredients: json.recipe.missing_ingredients || [] });  
      if (userId) {
         await supabase.from('recipes').insert({ session_id: userId, title: json.recipe.title, description: json.recipe.description, time: String(json.recipe.time), calories: String(json.recipe.calories), ingredients: json.recipe.detailed_ingredients?.map((i:any) => `${i.name} - ${i.amount}`) || [], detailed_ingredients: json.recipe.detailed_ingredients, missing_ingredients: json.recipe.missing_ingredients, steps: json.recipe.steps, is_favorite: false, estimated_cost: json.recipe.estimated_cost || null, budget_tier: json.recipe.budget_tier || null }); 
         fetchMyRecipes(userId); 
      }
      handleRewardForRecipe();
      rewardForSaving(json.recipe.estimated_cost);
    } catch (err: any) { showToast(err.message, undefined, 'error'); } finally { setLoadingRecipe(false); } 
  }; 

  const handleAskChef = async () => { 
    const currentContext = activeView === 'daily' ? (dailyRecipe as any) : recipe; 
    if (!question.trim() || !currentContext) return; setAsking(true); setAnswer(null); 
    try { 
      const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: question, recipeContext: currentContext }) }); 
      const json = await response.json(); if (json.error) throw new Error(json.error); setAnswer(json.answer); 
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
        .menu-link { display: flex; align-items: center; gap: 14px; padding: 14px 16px; font-size: 16px; font-weight: 600; color: #475569; border-radius: 16px; cursor: pointer; transition: all 0.2s ease; margin-bottom: 4px; }
        .menu-link:hover { background: #f8fafc; }
        @keyframes floatUp { 0% { opacity: 1; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(-60px) scale(1.3); } }
        .float-coin { position: absolute; animation: floatUp 0.8s ease-out forwards; pointer-events: none; font-size: 24px; font-weight: 900; color: #f59e0b; text-shadow: 0px 2px 4px rgba(0,0,0,0.3); z-index: 10; }
      `}</style> 

      {/* TOAST УВЕДОМЛЕНИЯ */}
      {toast && (
        <div className={`sc-toast ${toast.type === 'error' ? 'sc-toast-error' : 'sc-toast-success'}`}>
          {toast.icon && <span className="sc-toast-icon">{toast.icon}</span>}
          <span className="sc-toast-text">{toast.message}</span>
          <button className="sc-toast-close" onClick={() => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); setToast(null); }}>&times;</button>
        </div>
      )}

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
      />
       
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