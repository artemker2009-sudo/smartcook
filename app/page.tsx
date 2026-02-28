"use client";

import { useState, useEffect, ChangeEvent } from "react";
import { supabase } from "@/lib/supabase"; 
import Cropper from 'react-easy-crop';
import { 
  Menu, X, Flame, Send, Camera, Search, Clock, Heart, 
  ArrowRight, ArrowLeft, RotateCcw, CheckCircle, Sparkles, Image as ImageIcon, 
  Wallet, Zap, Leaf, Globe, ChevronRight, ChevronDown, ChevronUp, Shuffle, ShoppingCart, Lock, ShoppingBag, ExternalLink, Info, ThumbsUp, Share2, User, LogOut, Mail, MessageCircle, PlusCircle, Trash2, Edit3, CornerDownRight, Settings
} from "lucide-react";

/* --- ТИПЫ ДАННЫХ --- */
interface AnalysisData { ingredients: string[]; dishes: string[]; }
interface DetailedIngredient { name: string; amount: string; }

interface RecipeData { 
  id?: number; 
  is_favorite?: boolean; 
  title: string; 
  description?: string; 
  time: string; 
  calories?: string; 
  steps: string[]; 
  missing_ingredients?: string[]; 
  ingredients?: string[]; 
  detailed_ingredients?: DetailedIngredient[]; 
}

interface DBRecipe { 
  id: number; 
  title: string; 
  time: string; 
  calories?: string; 
  is_favorite: boolean; 
  created_at: string; 
  steps: string[]; 
  ingredients: string[]; 
  detailed_ingredients?: DetailedIngredient[]; 
  missing_ingredients?: string[]; 
  description?: string; 
  session_id: string; 
  likes_count?: number;
  comments_count?: number;
  is_liked?: boolean; 
  custom_title?: string;
  user_id?: string;
  user_avatar?: string;
}

interface DailyRecipeType { 
  title: string; 
  description?: string; 
  time: string | number; 
  calories: string | number; 
  ingredients?: string[]; 
  detailed_ingredients?: DetailedIngredient[];
  missing_ingredients?: string[];
  steps: string[]; 
  date?: string; 
  error?: string; 
}

interface HolidayType {
  title: string;
  text: string;
  gradient: string;
  icon: string;
}

interface DBComment {
  id: number;
  post_id: number;
  user_id: string;
  user_name: string;
  user_avatar?: string;
  text: string;
  created_at: string;
  parent_id?: number | null;
  likes_count?: number;
  is_liked?: boolean;
}

const scaleAmount = (amount: string, multiplier: number) => {
  if (!amount) return "";
  if (multiplier === 1) return amount;
  
  return amount.replace(/(\d+\/\d+|\d+([\.,]\d+)?)/g, (match) => {
    let num = 0;
    if (match.includes('/')) {
      const parts = match.split('/');
      num = parseInt(parts[0]) / parseInt(parts[1]);
    } else {
      num = parseFloat(match.replace(',', '.'));
    }
    
    if (isNaN(num)) return match;
    const scaled = num * multiplier;
    return Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(1).replace('.', ',');
  });
};

/* --- ФУНКЦИИ ДЛЯ ОБРЕЗКИ АВАТАРОК --- */
const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: any
): Promise<File | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) return null;

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve(null);
      resolve(new File([blob], `avatar_${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg');
  });
}

export default function Home() {
  const [activeView, setActiveView] = useState<'service' | 'about' | 'daily' | 'feed' | 'profile'>('service');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFeedMenuExpanded, setIsFeedMenuExpanded] = useState(false);

  const [dailyRecipe, setDailyRecipe] = useState<DailyRecipeType | null>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<'photo' | 'text'>('photo');
  const [textQuery, setTextQuery] = useState(""); 
  
  const [cookingMode, setCookingMode] = useState<'strict' | 'extended'>('strict');
  
  // СОСТОЯНИЯ ДЛЯ АЛЛЕРГИЙ И ПРЕДПОЧТЕНИЙ
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
  const [publicFeed, setPublicFeed] = useState<DBRecipe[]>([]);
  const [feedSort, setFeedSort] = useState<'new' | 'top' | 'old'>('new');
  
  const [feedTab, setFeedTab] = useState<'photos' | 'recipes'>('photos');
  const [photosFeed, setPhotosFeed] = useState<any[]>([]);
  const [photosSort, setPhotosSort] = useState<'new' | 'top' | 'old'>('new');

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

  // Авторизация
  const [user, setUser] = useState<any>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [isSendingLink, setIsSendingLink] = useState(false);

  // Загрузка фото в ленту
  const [userPhotoFile, setUserPhotoFile] = useState<File | null>(null);
  const [userPhotoPreview, setUserPhotoPreview] = useState<string | null>(null);
  const [userComment, setUserComment] = useState("");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Фулскрин фото и навигация профиля
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [profileView, setProfileView] = useState<'main' | 'favorites' | 'photos' | 'history'>('main');
  const [userPhotos, setUserPhotos] = useState<any[]>([]);

  // Комментарии и Свои блюда
  const [commentsModalPostId, setCommentsModalPostId] = useState<number | null>(null);
  const [postComments, setPostComments] = useState<DBComment[]>([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [replyingTo, setReplyingTo] = useState<{id: number, name: string} | null>(null);
  
  const [isStandaloneUploadOpen, setIsStandaloneUploadOpen] = useState(false);
  const [standaloneTitle, setStandaloneTitle] = useState("");

  // Редактирование профиля
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfileName, setEditProfileName] = useState("");
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Состояния для обрезки (Crop)
  const [isCropping, setIsCropping] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  useEffect(() => {
    if (dailyRecipe && feed.length > 0) {
      const alreadySaved = feed.find(r => r.title === dailyRecipe.title && r.is_favorite);
      if (alreadySaved) {
        setDailyFavoriteId(alreadySaved.id);
      } else {
        setDailyFavoriteId(null);
      }
    }
  }, [dailyRecipe, feed]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      if (session?.user?.user_metadata) {
        setAllergies(session.user.user_metadata.allergies || []);
        setDislikes(session.user.user_metadata.dislikes || []);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user?.user_metadata) {
        setAllergies(session.user.user_metadata.allergies || []);
        setDislikes(session.user.user_metadata.dislikes || []);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let currentSessionId = localStorage.getItem("cook_user_id");
    
    if (user) {
      currentSessionId = user.id;
      localStorage.setItem("cook_user_id", user.id);
      setEditProfileName(user.user_metadata?.full_name || "");
      setEditAvatarPreview(user.user_metadata?.avatar_url || null);
    } else if (!currentSessionId) {
      currentSessionId = "user_" + Math.random().toString(36).substr(2, 9); 
      localStorage.setItem("cook_user_id", currentSessionId); 
    }
    
    setUserId(currentSessionId); 
    if (currentSessionId) {
      fetchMyRecipes(currentSessionId); 
    }
  }, [user]);

  useEffect(() => {
    const fetchUserPhotos = async () => {
      if (!user) {
        setUserPhotos([]);
        return;
      }
      const { data, error } = await supabase
        .from('feed_posts')
        .select('*, recipes(title)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
        
      if (!error && data) {
        setUserPhotos(data);
      }
    };

    if (activeView === 'profile') {
      fetchUserPhotos();
    }
  }, [activeView, user]);

  const cleanText = (text: any) => {
    if (!text) return "";
    return String(text).replace(/^(Шаг \d+|Step \d+|\d+[\.\)])[:\s]*/i, '').trim();
  };

  const formatTime = (t: string) => {
    if (!t) return "";
    const digits = t.replace(/\D/g, '');  
    if (!digits) return t;  
    return `${digits} мин.`;
  };

  const formatCalories = (c: string) => {
    if (!c) return "";
    const match = c.match(/\d+/);
    if (match) {
      return `${match[0]} ккал`;
    }
    return "";  
  };

  useEffect(() => {
    fetch('/api/daily').then(res => res.json()).then(data => { if (data && !data.error) setDailyRecipe(data); }).catch(console.error);

    const d = new Date();
    const day = d.getDate();
    const month = d.getMonth() + 1;  
    const key = `${day}.${month}`;

    const holidays: Record<string, HolidayType> = {
      "14.2": { title: "С Днем святого Валентина! 💖", text: "Пусть ваша жизнь будет наполнена любовью, а ужины — романтикой.", gradient: "linear-gradient(135deg, #ec4899 0%, #be185d 100%)", icon: "💘" },
      "23.2": { title: "С Днем защитника Отечества!", text: "Силы, мужества и сытных побед на кулинарном фронте!", gradient: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)", icon: "⭐" },
      "8.3": { title: "С 8 Марта! 💐", text: "Красоты, нежности и вдохновения! Пусть сегодня готовит кто-то другой.", gradient: "linear-gradient(135deg, #d946ef 0%, #a21caf 100%)", icon: "🌷" },
      "1.3": { title: "С первым днем весны!", text: "Природа просыпается, и аппетит тоже!", gradient: "linear-gradient(135deg, #84cc16 0%, #4d7c0f 100%)", icon: "🌱" },
      "1.5": { title: "Мир, Труд, Май!", text: "Отличный повод выбраться на шашлыки!", gradient: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)", icon: "🔥" },
      "9.5": { title: "С Днем Победы!", text: "Мирного неба над головой и тепла в вашем доме.", gradient: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)", icon: "🎖" },
      "1.6": { title: "Ура, лето!", text: "Сезон мороженого и окрошки открыт!", gradient: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)", icon: "☀" },
      "1.9": { title: "С Днем знаний!", text: "Учиться никогда не поздно, особенно готовить!", gradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", icon: "🔔" },
      "31.12": { title: "С Наступающим! 🎄", text: "Оливье готов? Мандарины куплены?", gradient: "linear-gradient(135deg, #dc2626 0%, #166534 100%)", icon: "🎅" },
      "1.1": { title: "С Новым 2026 годом! 🎉", text: "Начинаем год вкусно!", gradient: "linear-gradient(135deg, #fbbf24 0%, #b45309 100%)", icon: "🥂" }
    };

    if (holidays[key]) setCurrentHoliday(holidays[key]);

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const sharedId = params.get('recipeId');
      const isDaily = params.get('daily');

      if (sharedId) {
        loadSharedRecipe(sharedId);
      } else if (isDaily === 'true') {
        setActiveView('daily');
        window.history.replaceState({}, '', '/');
      }
    }
  }, []);

  useEffect(() => {
    if (activeView === 'feed') {
      fetchPhotosFeed(photosSort);
    }
  }, [activeView, photosSort]);

  const fetchMyRecipes = async (currentId: string) => {
    if (!currentId) return;
    const { data, error } = await supabase.from('recipes').select('*').eq('session_id', currentId).order('created_at', { ascending: false });
    if (!error && data) setFeed(data);
  };

  const fetchPhotosFeed = async (sortType: 'new' | 'top' | 'old') => {
    setPhotosSort(sortType);
    if (!userId) return;
    try {
      const res = await fetch("/api/photo-feed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort: sortType, sessionId: userId }) });
      const json = await res.json();
      if (json.feed) setPhotosFeed(json.feed);
    } catch (e) { console.error("Photo Feed Error:", e); }
  };

  const handleOAuthLogin = async (provider: 'google' | 'yandex' | 'vk') => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: provider as any, options: { redirectTo: window.location.origin } });
      if (error) throw error;
    } catch (error: any) { alert("Ошибка входа: " + error.message); }
  };

  const handleEmailLogin = async () => {
    if (!authEmail.includes('@')) return alert("Пожалуйста, введите корректный email");
    setIsSendingLink(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: authEmail, options: { emailRedirectTo: window.location.origin } });
      if (error) throw error;
      alert("✨ Магическая ссылка отправлена! Проверьте вашу почту (и папку Спам).");
      setIsAuthModalOpen(false);
    } catch (error: any) { alert("Ошибка отправки: " + error.message); } finally { setIsSendingLink(false); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setActiveView('service');
    setProfileView('main');
  };

  // СОХРАНЕНИЕ ПРЕДПОЧТЕНИЙ (Аллергии и Не люблю)
  const savePreferencesToDB = async (newAllergies: string[], newDislikes: string[]) => {
    if (user) {
      await supabase.auth.updateUser({ 
        data: { allergies: newAllergies, dislikes: newDislikes } 
      });
    }
  };

  const addAllergy = () => {
    if (!newAllergy.trim()) return;
    const updated = [...allergies, newAllergy.trim().toLowerCase()];
    setAllergies(updated);
    setNewAllergy("");
    savePreferencesToDB(updated, dislikes);
  };

  const addDislike = () => {
    if (!newDislike.trim()) return;
    const updated = [...dislikes, newDislike.trim().toLowerCase()];
    setDislikes(updated);
    setNewDislike("");
    savePreferencesToDB(allergies, updated);
  };

  const removeAllergy = (idx: number) => {
    const updated = allergies.filter((_, i) => i !== idx);
    setAllergies(updated);
    savePreferencesToDB(updated, dislikes);
  };

  const removeDislike = (idx: number) => {
    const updated = dislikes.filter((_, i) => i !== idx);
    setDislikes(updated);
    savePreferencesToDB(allergies, updated);
  };

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => { 
    const files = e.target.files; 
    if (!files || files.length === 0) return; 
    const rawFile = files[0]; 
    setCropImageSrc(URL.createObjectURL(rawFile));
    setIsCropping(true);
  };

  const onCropComplete = (croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const handleCropConfirm = async () => {
    if (!cropImageSrc || !croppedAreaPixels) return;
    try {
      const croppedFile = await getCroppedImg(cropImageSrc, croppedAreaPixels);
      if (croppedFile) {
         const imageCompression = (await import('browser-image-compression')).default; 
         const options = { maxSizeMB: 0.3, maxWidthOrHeight: 500, useWebWorker: true, fileType: "image/jpeg" }; 
         const compressedFile = await imageCompression(croppedFile, options); 
         const finalFile = new File([compressedFile], `avatar_${Date.now()}.jpg`, { type: "image/jpeg" });
         
         setEditAvatarFile(finalFile);
         setEditAvatarPreview(URL.createObjectURL(finalFile));
         setIsCropping(false);
         setCropImageSrc(null);
      }
    } catch (e) {
      alert("Не удалось обработать фото");
    }
  };

  const handleProfileSave = async () => { 
    if (!user) return; 
    setIsSavingProfile(true); 
    try { 
      let avatarUrl = user.user_metadata?.avatar_url; 
      if (editAvatarFile) { 
        const fileName = `${user.id}/avatar_${Date.now()}.jpg`; 
        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, editAvatarFile, { upsert: true }); 
        if (uploadError) throw uploadError; 
        const { data } = supabase.storage.from('avatars').getPublicUrl(fileName); 
        avatarUrl = data.publicUrl + '?t=' + Date.now(); 
      } 
      
      const { data, error } = await supabase.auth.updateUser({ 
        data: { full_name: editProfileName, avatar_url: avatarUrl } 
      }); 
      
      if (error) throw error; 
      setUser(data.user); 
      setIsEditingProfile(false); 

      await supabase.from('feed_posts').update({ user_name: editProfileName, user_avatar: avatarUrl }).eq('user_id', user.id);
      await supabase.from('photo_comments').update({ user_name: editProfileName, user_avatar: avatarUrl }).eq('user_id', user.id);

      setPhotosFeed(prev => prev.map(p => p.user_id === user.id ? { ...p, user_name: editProfileName, user_avatar: avatarUrl } : p));
      setUserPhotos(prev => prev.map(p => p.user_id === user.id ? { ...p, user_name: editProfileName, user_avatar: avatarUrl } : p));

    } catch(e) { 
      alert("Ошибка сохранения профиля"); 
    } finally { 
      setIsSavingProfile(false); 
    } 
  }; 

  const handlePhotoLike = async (e: any, item: any) => {
    e.stopPropagation();
    if (!userId) return;
    const action = item.is_liked ? 'unlike' : 'like';
    const newCount = item.is_liked ? Math.max(0, (item.likes_count || 0) - 1) : (item.likes_count || 0) + 1;
    
    setPhotosFeed(photosFeed.map(p => p.id === item.id ? { ...p, is_liked: !item.is_liked, likes_count: newCount } : p));
    
    try { 
      if (action === 'like') {
        await supabase.from('photo_likes').insert({ post_id: item.id, session_id: userId });
      } else {
        await supabase.from('photo_likes').delete().match({ post_id: item.id, session_id: userId });
      }
    } catch (err) {}
  };

  const handleDeletePost = async (postId: number) => { 
    if (!confirm("Вы уверены, что хотите удалить этот пост?")) return; 
    try { 
      const { error } = await supabase.from('feed_posts').delete().eq('id', postId).eq('user_id', user?.id); 
      if (error) throw error; 
      setPhotosFeed(prev => prev.filter(p => p.id !== postId)); 
      setUserPhotos(prev => prev.filter(p => p.id !== postId)); 
    } catch (e: any) { 
      alert("Ошибка удаления. Возможно у вас нет прав на этот пост."); 
    } 
  }; 

  const openComments = async (postId: number) => { 
    setCommentsModalPostId(postId); 
    setPostComments([]); 
    setReplyingTo(null); 
    const { data } = await supabase.from('photo_comments').select('*').eq('post_id', postId).order('created_at', { ascending: true }); 
    
    let likedIds = new Set(); 
    if (userId && data && data.length > 0) { 
      const cIds = data.map(c => c.id); 
      const { data: likes } = await supabase.from('comment_likes').select('comment_id').in('comment_id', cIds).eq('session_id', userId); 
      if (likes) likes.forEach((l: any) => likedIds.add(l.comment_id)); 
    } 
    
    setPostComments(data?.map(c => ({...c, is_liked: likedIds.has(c.id)})) || []); 
  }; 

  const submitComment = async () => { 
    if (!user) {
       setCommentsModalPostId(null);
       return setIsAuthModalOpen(true); 
    }
    if (!newCommentText.trim() || !commentsModalPostId) return; 
    
    const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Шеф'; 
    const userAvatar = user.user_metadata?.avatar_url || null; 

    const { data, error } = await supabase.from('photo_comments').insert({ 
      post_id: commentsModalPostId, 
      user_id: user.id, 
      user_name: userName, 
      user_avatar: userAvatar, 
      text: newCommentText.trim(), 
      parent_id: replyingTo ? replyingTo.id : null 
    }).select().single(); 

    if (!error && data) { 
      setPostComments([...postComments, data]); 
      setNewCommentText(""); 
      setReplyingTo(null); 
      setPhotosFeed(photosFeed.map(p => p.id === commentsModalPostId ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p)); 
    } 
  }; 

  const handleDeleteComment = async (commentId: number) => { 
    if (!confirm("Удалить комментарий?")) return; 
    try { 
      const { error } = await supabase.from('photo_comments').delete().eq('id', commentId).eq('user_id', user?.id); 
      if (error) throw error; 
      setPostComments(prev => prev.filter(c => c.id !== commentId && c.parent_id !== commentId)); 
      setPhotosFeed(photosFeed.map(p => p.id === commentsModalPostId ? { ...p, comments_count: Math.max(0, (p.comments_count || 0) - 1) } : p)); 
    } catch (e: any) { 
       alert("Ошибка удаления комментария: " + e.message); 
    } 
  }; 

  const handleCommentLike = async (comment: DBComment) => {
    if (!userId) return;
    const action = comment.is_liked ? 'unlike' : 'like';
    const newCount = comment.is_liked ? Math.max(0, (comment.likes_count || 0) - 1) : (comment.likes_count || 0) + 1;
    
    setPostComments(postComments.map(c => c.id === comment.id ? { ...c, is_liked: !c.is_liked, likes_count: newCount } : c));
    
    try {
      if (action === 'like') {
        await supabase.from('comment_likes').insert({ comment_id: comment.id, session_id: userId });
      } else {
        await supabase.from('comment_likes').delete().match({ comment_id: comment.id, session_id: userId });
      }
    } catch (err) {}
  };

  const toggleFavorite = async (e: any, targetId: number, currentStatus: boolean = false) => { 
    e.stopPropagation();  
    if (!targetId) return; 
    const newStatus = !currentStatus; 
    setFeed(feed?.map(r => r.id === targetId ? { ...r, is_favorite: newStatus } : r) || []); 
    if (recipe && recipe.id === targetId) setRecipe({ ...recipe, is_favorite: newStatus }); 
    try { await fetch("/api/favorite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: targetId, isFavorite: newStatus }) }); } catch (err) {} 
  }; 

  const toggleDailyFavorite = async () => { 
    if (!dailyRecipe || !userId) return; 
    if (dailyFavoriteId) { 
      setFeed(feed?.map(r => r.id === dailyFavoriteId ? { ...r, is_favorite: false } : r) || []); 
      setDailyFavoriteId(null); 
      try { await fetch("/api/favorite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: dailyFavoriteId, isFavorite: false }) }); } catch(e) {} 
    } else { 
      const { data } = await supabase.from('recipes').insert({ session_id: userId, title: dailyRecipe.title, description: dailyRecipe.description, time: String(dailyRecipe.time), calories: String(dailyRecipe.calories), ingredients: dailyRecipe.ingredients || dailyRecipe.detailed_ingredients?.map(i => `${i.name} - ${i.amount}`) || [], detailed_ingredients: dailyRecipe.detailed_ingredients || [], missing_ingredients: dailyRecipe.missing_ingredients || [], steps: dailyRecipe.steps, is_favorite: true }).select('*'); 
      if (data && data.length > 0) { setDailyFavoriteId(data[0].id); fetchMyRecipes(userId); } 
    } 
  }; 

  const handleUserPhotoChange = async (e: ChangeEvent<HTMLInputElement>) => { 
    const files = e.target.files; 
    if (!files || files.length === 0) return; 
    const rawFile = files[0]; 
    setUserPhotoPreview(URL.createObjectURL(rawFile)); 
    setIsUploadingPhoto(true); 

    try { 
      const imageCompression = (await import('browser-image-compression')).default; 
      const options = { maxSizeMB: 1, maxWidthOrHeight: 1080, useWebWorker: true, fileType: "image/jpeg" }; 
      const compressedFile = await imageCompression(rawFile, options); 
      setUserPhotoFile(new File([compressedFile], `post_${Date.now()}.jpg`, { type: "image/jpeg" })); 
    } catch (error) { 
      alert("Не удалось обработать фото."); 
      setUserPhotoFile(null); 
      setUserPhotoPreview(null); 
    } finally { setIsUploadingPhoto(false); } 
  }; 

  const ensureRecipeInDB = async (currentRecipe: any) => { 
    if (!currentRecipe) return null; 
    if (currentRecipe.id) return currentRecipe.id; 
    const { data } = await supabase.from('recipes').insert({ session_id: userId, title: currentRecipe.title, description: currentRecipe.description, time: String(currentRecipe.time), calories: String(currentRecipe.calories), ingredients: currentRecipe.ingredients || currentRecipe.detailed_ingredients?.map((i:any) => `${i.name} - ${i.amount}`) || [], detailed_ingredients: currentRecipe.detailed_ingredients || [], missing_ingredients: currentRecipe.missing_ingredients || [], steps: currentRecipe.steps, is_favorite: false }).select('*'); 
    if (data && data.length > 0) { 
      if (recipe && recipe.title === currentRecipe.title) setRecipe({...recipe, id: data[0].id}); 
      return data[0].id; 
    } 
    return null; 
  }; 

  const submitFeedPost = async (currentRecipeContext: any) => { 
    if (!user) return setIsAuthModalOpen(true); 
    if (!userPhotoFile) return alert("Сначала выберите фото!"); 
    
    if (isStandaloneUploadOpen && !standaloneTitle.trim()) return alert("Введите название вашего блюда!"); 

    setIsUploadingPhoto(true); 
    try { 
      let dbRecipeId = null; 
      let postTitleContext = standaloneTitle; 

      if (!isStandaloneUploadOpen) { 
         dbRecipeId = await ensureRecipeInDB(currentRecipeContext); 
         if (!dbRecipeId) throw new Error("Не удалось привязать рецепт"); 
         postTitleContext = currentRecipeContext.title; 
      } 

      const fileName = `${user.id}/${Date.now()}.jpg`; 
      const { error: uploadError } = await supabase.storage.from('recipe_photos').upload(fileName, userPhotoFile); 
      if (uploadError) throw uploadError; 

      const { data: publicUrlData } = supabase.storage.from('recipe_photos').getPublicUrl(fileName); 
      const photoUrl = publicUrlData.publicUrl; 
      const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Шеф'; 
      const userAvatar = user.user_metadata?.avatar_url || null; 
      
      const { error: postError } = await supabase.from('feed_posts').insert({ 
        recipe_id: dbRecipeId, 
        custom_title: isStandaloneUploadOpen ? standaloneTitle : null, 
        user_id: user.id, 
        user_name: userName, 
        user_avatar: userAvatar, 
        photo_url: photoUrl, 
        comment: userComment, 
        status: 'pending' 
      }); 
      if (postError) throw postError; 

      try { 
          const { data: latestPost } = await supabase.from('feed_posts').select('id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).single(); 
          if (latestPost) { 
              await fetch('/api/telegram-mod', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ 
                  postId: latestPost.id, 
                  recipeTitle: postTitleContext, 
                  userName: userName, 
                  comment: userComment, 
                  photoUrl: photoUrl 
                }) 
              }); 
          } 
      } catch (tgErr) { console.warn("TG error", tgErr); } 

      alert("Ура! 🎉 Ваше фото отправлено на проверку шефу. Скоро оно появится в общей ленте!"); 
      setUserPhotoFile(null); setUserPhotoPreview(null); setUserComment(""); setStandaloneTitle(""); setIsStandaloneUploadOpen(false); 

    } catch (err: any) { alert("Ошибка отправки: " + err.message); }  
    finally { setIsUploadingPhoto(false); } 
  }; 

  const handleShareDaily = async () => { 
    if (!dailyRecipe) return; 
    const recipeUrl = `${window.location.origin}/?daily=true`; 
    const fullText = `«${dailyRecipe.title}» 🍲\nПриготовлено с помощью SmartCook 👨‍🍳\n\nСмотри рецепт по ссылке:\n${recipeUrl}`; 
    try { if (navigator.share) await navigator.share({ title: dailyRecipe.title, text: fullText }); else { await navigator.clipboard.writeText(fullText); alert("Ссылка на сайт скопирована в буфер обмена!"); } } catch (err) {} 
  }; 

  const handleShareRecipe = async () => { 
    if (!recipe) return; 
    const recipeUrl = recipe.id ? `${window.location.origin}/?recipeId=${recipe.id}` : window.location.origin; 
    const fullText = `«${recipe.title}» 🍲\nПриготовлено с помощью SmartCook 👨‍🍳\n\nОткрой рецепт по ссылке:\n${recipeUrl}`; 
    try { if (navigator.share) await navigator.share({ title: recipe.title, text: fullText }); else { await navigator.clipboard.writeText(fullText); alert("Ссылка на рецепт скопирована в буфер обмена!"); } } catch (err) {} 
  }; 

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => { 
    const files = e.target.files;  
    if (!files || files.length === 0) return; 
    const rawFile = files[0]; 
    setPreview(URL.createObjectURL(rawFile)); 
    setAnalysisResult(null); setRecipe(null); setSelectedDish(null); setQuestion(""); setAnswer(null);  
    setIsProcessing(true); setIsHistoryView(false); setFromFeed(false); setServings(1);  
    try { 
      const imageCompression = (await import('browser-image-compression')).default; 
      const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, fileType: "image/jpeg" }; 
      const compressedFile = await imageCompression(rawFile, options); 
      const finalFile = new File([compressedFile], "image.jpg", { type: "image/jpeg" }); 
      setFile(finalFile); setPreview(URL.createObjectURL(finalFile));  
    } catch (error) { alert("Не удалось обработать фото."); setFile(null); } finally { setIsProcessing(false); } 
  }; 

  const triggerFileInput = () => document.getElementById('hidden-file-input')?.click(); 

  const handleAnalyze = async () => { 
    if (!file) return;  
    setAnalyzing(true); setRecipe(null); 
    try { 
      const formData = new FormData(); formData.append("image", file); formData.append("mode", cookingMode); 
      formData.append("allergies", allergies.join(', '));
      formData.append("dislikes", dislikes.join(', '));

      const response = await fetch("/api/analyze", { method: "POST", body: formData }); 
      if (!response.ok) throw new Error(`Error: ${response.status}`); 
      const json = await response.json(); if (json.error) throw new Error(json.error);  
      setAnalysisResult(json.data); 
    } catch (err: any) { alert("Ошибка: " + err.message); } finally { setAnalyzing(false); } 
  }; 

  const handleRegenerate = async () => { 
    if (!analysisResult) return; setIsRegenerating(true); 
    try { 
      const response = await fetch("/api/regenerate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ingredients: analysisResult.ingredients }) }); 
      const json = await response.json(); if (json.error) throw new Error(json.error); setAnalysisResult({ ...analysisResult, dishes: json.dishes }); 
    } catch (err: any) { alert("Ошибка: " + err.message); } finally { setIsRegenerating(false); } 
  }; 

  const getRecipeFromPhoto = async (dishName: string) => { 
    if (!analysisResult || !userId) return;  
    setSelectedDish(dishName); setLoadingRecipe(true); setRecipe(null); setIsHistoryView(false); setFromFeed(false); setServings(1);  
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); 
    try { 
      const response = await fetch("/api/recipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dish: dishName, ingredients: analysisResult.ingredients, sessionId: userId, allergies, dislikes }) }); 
      const json = await response.json(); if (json.error) throw new Error(json.error);  
      setRecipe({ ...json.recipe, ingredients: analysisResult.ingredients });  
      updateLatestRecipeId(); 
    } catch (err: any) { alert("Ошибка: " + err.message); } finally { setLoadingRecipe(false); } 
  }; 

  const handleSmartVariant = async () => { 
    setLoadingRecipe(true); setIsHistoryView(false); setFromFeed(false); setServings(1);  
    try { 
      if (analysisResult) { 
        const response = await fetch("/api/regenerate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ingredients: analysisResult.ingredients }) }); 
        const json = await response.json(); if (json.error) throw new Error(json.error); 
        const newDishes = json.dishes.filter((d: string) => d !== selectedDish); 
        const freshIdea = newDishes.length > 0 ? newDishes[0] : json.dishes[0]; 
        setAnalysisResult({ ...analysisResult, dishes: json.dishes }); 
        await getRecipeFromPhoto(freshIdea); 
      } else if (searchMode === 'text' && textQuery) { 
        const response = await fetch("/api/search-recipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: textQuery, sessionId: userId, isVariant: true, allergies, dislikes }) }); 
        const json = await response.json(); if (!response.ok) throw new Error(json.error); 
        setRecipe({ ...json.recipe, missing_ingredients: json.recipe.missing_ingredients || [] });  
        updateLatestRecipeId(); 
      } 
    } catch (err: any) { alert("Ошибка: " + err.message); } finally { setLoadingRecipe(false); } 
  }; 

  const handleTextSearch = async () => { 
    if (!textQuery.trim() || !userId) return;  
    setLoadingRecipe(true); setRecipe(null); setAnalysisResult(null); setIsHistoryView(false); setFromFeed(false); setServings(1);  
    try { 
      const response = await fetch("/api/search-recipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: textQuery, sessionId: userId, allergies, dislikes }) }); 
      const json = await response.json(); if (!response.ok) throw new Error(json.error || "Ошибка поиска"); 
      setRecipe({ ...json.recipe, missing_ingredients: json.recipe.missing_ingredients || [] });  
      updateLatestRecipeId(); 
    } catch (err: any) { alert("🛑 " + err.message); } finally { setLoadingRecipe(false); } 
  }; 

  const updateLatestRecipeId = async () => { 
    if (!userId) return; 
    const { data } = await supabase.from('recipes').select('*').eq('session_id', userId).order('created_at', { ascending: false }).limit(1); 
    if (data && data.length > 0) { 
      setRecipe(prev => prev ? { ...prev, id: data[0].id, is_favorite: data[0].is_favorite } : prev); 
      fetchMyRecipes(userId); 
    } 
  }; 

  const handleAskChef = async () => { 
    const currentContext = activeView === 'daily' ? (dailyRecipe as any) : recipe; 
    if (!question.trim() || !currentContext) return; 
    setAsking(true); setAnswer(null); 
    try { 
      const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: question, recipeContext: currentContext }) }); 
      const json = await response.json(); if (json.error) throw new Error(json.error); setAnswer(json.answer); 
    } catch (err: any) { alert("Ошибка: " + err.message); } finally { setAsking(false); } 
  }; 

  const loadFromHistory = (item: DBRecipe, source: 'photos' | 'history' | 'profile_history' | 'profile_favorites' = 'history') => { 
    setAnalysisResult(null); setQuestion(""); setAnswer(null); setServings(1);  
    setRecipe({ id: item.id, is_favorite: item.is_favorite, title: item.title, description: item.description, time: item.time, calories: item.calories, steps: item.steps || [], missing_ingredients: item.missing_ingredients || [], ingredients: item.ingredients || [], detailed_ingredients: item.detailed_ingredients || [] }); 
    setFromFeed(source === 'history' ? false : source); 
    setIsHistoryView(source === 'history' || source === 'profile_history' || source === 'profile_favorites'); 
    setIsSharedView(false);  
    window.scrollTo({ top: 0, behavior: 'smooth' });  
    setActiveView('service');  
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
    if (fromFeed === 'photos') { setActiveView('feed'); }  
    else if (fromFeed === 'profile_history') { setProfileView('history'); setActiveView('profile'); }  
    else if (fromFeed === 'profile_favorites') { setProfileView('favorites'); setActiveView('profile'); }  
    else { setActiveView('service'); } 
    setFromFeed(false); 
  }; 

  const handleBackToSearch = () => { 
    setRecipe(null); setIsSharedView(false); setIsHistoryView(false); 
    if (typeof window !== 'undefined') window.history.replaceState({}, '', '/'); 
  }; 

  const switchView = (view: 'service' | 'about' | 'daily' | 'feed' | 'profile') => { 
    setActiveView(view); setIsMenuOpen(false); 
    if (view === 'service') { setIsSharedView(false); if (typeof window !== 'undefined') window.history.replaceState({}, '', '/'); }  
    else { if (typeof window !== 'undefined') window.history.replaceState({}, '', '/'); } 
  }; 

  const displayedFeed = filterMode === 'all' ? feed : feed?.filter(r => r.is_favorite); 
  const visibleHistory = historyExpanded ? displayedFeed : displayedFeed?.slice(0, 4); 
  const actualServings = typeof servings === 'number' ? servings : 1; 

  // Отрисовка комментария с вложенными ответами 
  const renderComment = (c: DBComment, isReply: boolean = false) => ( 
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
        <div style={{flex: 1}}> 
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}> 
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#111' }}>{c.user_name}</div> 
            {user && user.id === c.user_id && ( 
              <button onClick={() => handleDeleteComment(c.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}><Trash2 size={14} /></button> 
            )} 
          </div> 
          <div style={{ fontSize: '14px', color: '#374151', lineHeight: 1.4, marginBottom: '8px', wordBreak: 'break-word' }}>{c.text}</div> 
          
          {/* ИСПРАВЛЕНИЕ 5: Лайк правее кнопки Ответить */}
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

  return ( 
    <div className="container"> 
      <style>{` 
        input[type=number]::-webkit-inner-spin-button,  
        input[type=number]::-webkit-outer-spin-button {  
          -webkit-appearance: none;  
          margin: 0;  
        } 
        input[type=number] { 
          -moz-appearance: textfield; 
        } 
        textarea {
          font-family: inherit;
        }
        .menu-link {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          font-size: 16px;
          font-weight: 600;
          color: #475569;
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-bottom: 4px;
        }
        .menu-link:hover {
          background: #f8fafc;
        }
      `}</style> 

      {/* Фулскрин для фото */} 
      {fullScreenImage && ( 
        <div  
          style={{ 
            position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.9)',  
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' 
          }}  
          onClick={() => setFullScreenImage(null)} 
        > 
          <button  
            style={{position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', padding: '10px', color: 'white', cursor: 'pointer', backdropFilter: 'blur(5px)'}}  
            onClick={() => setFullScreenImage(null)} 
          > 
            <X size={24} /> 
          </button> 
          <img src={fullScreenImage} style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '12px'}} alt="Fullscreen" /> 
        </div> 
      )} 

      {/* МОДАЛЬНОЕ ОКНО ОБРЕЗКИ ФОТО */}
      {isCropping && cropImageSrc && (
        <div style={{position: 'fixed', inset: 0, zIndex: 100001, background: 'black', display: 'flex', flexDirection: 'column'}}>
          <div style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: '80px'}}>
            <Cropper
              image={cropImageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
              style={{ containerStyle: { background: 'black' } }}
            />
          </div>
          <div style={{position: 'absolute', bottom: 0, left: 0, right: 0, height: '80px', padding: '15px 20px', background: '#111', display: 'flex', gap: '10px', paddingBottom: 'env(safe-area-inset-bottom, 20px)'}}>
             <button onClick={() => {setIsCropping(false); setCropImageSrc(null);}} style={{flex: 1, padding: '14px', borderRadius: '12px', background: '#333', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer'}}>Отмена</button>
             <button onClick={handleCropConfirm} style={{flex: 2, padding: '14px', borderRadius: '12px', background: '#0ea5e9', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer'}}>Выбрать</button>
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО КОММЕНТАРИЕВ */} 
      {commentsModalPostId && ( 
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}> 
          <div className="animate-fade-in" style={{ background: '#f8fafc', width: '100%', maxWidth: '500px', height: '85dvh', paddingBottom: 'env(safe-area-inset-bottom, 15px)', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', display: 'flex', flexDirection: 'column', boxShadow: '0 -10px 40px rgba(0,0,0,0.2)', position: 'relative' }}> 
            <div style={{ padding: '15px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', borderTopLeftRadius: '24px', borderTopRightRadius: '24px' }}> 
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Комментарии</h3> 
              <button onClick={() => setCommentsModalPostId(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', padding: '6px', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button> 
            </div> 
             
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}> 
              {postComments.length === 0 ? ( 
                <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: '40px' }}>Пока нет комментариев. Будьте первым!</div> 
              ) : ( 
                postComments.filter(c => !c.parent_id).map((c) => ( 
                  <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}> 
                    {renderComment(c)} 
                    {postComments.filter(reply => reply.parent_id === c.id).map(reply => renderComment(reply, true))} 
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
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}> 
                <textarea  
                  placeholder="Написать комментарий..." 
                  value={newCommentText} 
                  onChange={(e) => {
                    setNewCommentText(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = (e.target.scrollHeight < 120 ? e.target.scrollHeight : 120) + 'px';
                  }}
                  onFocus={(e) => setTimeout(() => e.target.scrollIntoView({behavior: 'smooth', block: 'center'}), 300)}
                  rows={1}
                  style={{ flex: 1, padding: '12px 15px', borderRadius: '24px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none', background: '#f8fafc', resize: 'none', overflowY: 'auto', minHeight: '44px', maxHeight: '120px' }} 
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

      {/* МОДАЛЬНОЕ ОКНО АВТОРИЗАЦИИ (zIndex: 100000 - поверх всего) */} 
      {isAuthModalOpen && ( 
        <div style={{ position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: '20px' }}> 
          <div className="animate-fade-in" style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '400px', padding: '30px 25px', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}> 
            <button onClick={() => setIsAuthModalOpen(false)} style={{position: 'absolute', top: '15px', right: '15px', background: '#f3f4f6', border: 'none', borderRadius: '50%', padding: '6px', cursor: 'pointer', color: '#6b7280'}}><X size={20} /></button> 
            <div style={{textAlign: 'center', marginBottom: '25px'}}> 
              <h2 style={{fontSize: '24px', fontWeight: 900, color: '#111', margin: '0 0 5px 0'}}>Вход в систему</h2> 
              <p style={{color: '#6b7280', fontSize: '14px', margin: 0}}>Сохраняйте рецепты и делитесь фото</p> 
            </div> 
            <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}> 
              <button onClick={() => handleOAuthLogin('google')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', padding: '14px', borderRadius: '12px', background: 'white', border: '1px solid #e5e7eb', fontSize: '15px', fontWeight: 600, color: '#374151', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transition: 'all 0.2s' }}> 
                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" style={{width: '20px', height: '20px'}} /> Войти через Google 
              </button> 
               
              <div style={{display: 'flex', alignItems: 'center', margin: '15px 0', color: '#9ca3af', fontSize: '13px'}}> 
                <div style={{flex: 1, height: '1px', background: '#e5e7eb'}}></div><span style={{padding: '0 10px'}}>ИЛИ</span><div style={{flex: 1, height: '1px', background: '#e5e7eb'}}></div> 
              </div> 
              <div> 
                <input type="email" placeholder="Ваш Email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} style={{width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #d1d5db', fontSize: '15px', marginBottom: '10px', outline: 'none'}} /> 
                <button onClick={handleEmailLogin} disabled={isSendingLink || !authEmail} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '14px', borderRadius: '12px', background: authEmail ? '#059669' : '#d1fae5', color: authEmail ? 'white' : '#047857', border: 'none', fontSize: '15px', fontWeight: 700, cursor: authEmail ? 'pointer' : 'default', transition: 'all 0.2s' }}> 
                  <Mail size={18} /> {isSendingLink ? "Отправка..." : "Получить ссылку для входа"} 
                </button> 
              </div> 
            </div> 
            <div style={{marginTop: '25px', padding: '15px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0'}}> 
              <p style={{fontSize: '11px', color: '#64748b', margin: 0, lineHeight: 1.5, textAlign: 'center'}}> 
                🛡 <strong>Нам не нужны ваши личные данные.</strong> Авторизация нужна только для того, чтобы ваши любимые рецепты и фото блюд навсегда сохранились в вашем личном кабинете. Никакого спама, обещаем! 
              </p> 
            </div> 
          </div> 
        </div> 
      )} 

      {/* МОДАЛЬНОЕ ОКНО РЕДАКТИРОВАНИЯ ПРОФИЛЯ */} 
      {isEditingProfile && user && ( 
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: '20px' }}> 
          <div className="animate-fade-in" style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '400px', padding: '30px 25px', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', textAlign: 'center' }}> 
            <h2 style={{fontSize: '20px', fontWeight: 900, color: '#111', margin: '0 0 20px 0'}}>Редактировать профиль</h2> 
             
            <div style={{position: 'relative', width: '100px', height: '100px', margin: '0 auto 20px auto', cursor: 'pointer'}} onClick={() => document.getElementById('avatar-upload')?.click()}> 
              {editAvatarPreview ? ( 
                <img src={editAvatarPreview} alt="Avatar" style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '3px solid #059669'}} /> 
              ) : ( 
                <div style={{background: '#059669', width: '100%', height: '100%', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '30px', fontWeight: 800}}> 
                  {user.email?.charAt(0).toUpperCase() || 'U'} 
                </div> 
              )} 
              <div style={{position: 'absolute', bottom: 0, right: 0, background: '#111', color: 'white', padding: '6px', borderRadius: '50%', border: '2px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><Camera size={14} /></div> 
              <input id="avatar-upload" type="file" accept="image/*" style={{display: 'none'}} onChange={handleAvatarChange} /> 
            </div> 

            <div style={{textAlign: 'left', marginBottom: '20px'}}> 
              <label style={{fontSize: '12px', fontWeight: 700, color: '#64748b', marginLeft: '5px'}}>Имя пользователя</label> 
              <input type="text" value={editProfileName} onChange={(e) => setEditProfileName(e.target.value)} style={{width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #d1d5db', fontSize: '15px', marginTop: '5px', outline: 'none'}} /> 
            </div> 

            <div style={{display: 'flex', gap: '10px'}}> 
               <button onClick={() => {setIsEditingProfile(false); setEditAvatarFile(null);}} style={{flex: 1, padding: '12px', borderRadius: '12px', background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 700, cursor: 'pointer'}}>Отмена</button> 
               <button onClick={handleProfileSave} disabled={isSavingProfile} style={{flex: 1, padding: '12px', borderRadius: '12px', background: '#059669', border: 'none', color: 'white', fontWeight: 700, cursor: isSavingProfile ? 'default' : 'pointer'}}> 
                 {isSavingProfile ? "Сохранение..." : "Сохранить"} 
               </button> 
            </div> 
          </div> 
        </div> 
      )} 

      {/* БЫСТРЫЕ НАСТРОЙКИ (Шестеренка перед поиском) */}
      {isPreferencesModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="animate-fade-in" style={{ background: 'white', width: '100%', maxWidth: '500px', padding: '25px', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', position: 'relative', boxShadow: '0 -10px 40px rgba(0,0,0,0.2)' }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>Фильтры для рецепта ⚙️</h3>
              <button onClick={() => setIsPreferencesModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', padding: '6px', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
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
                <input type="text" placeholder="Например: орехи" value={newAllergy} onChange={e => setNewAllergy(e.target.value)} onKeyPress={e => e.key === 'Enter' && addAllergy()} style={{flex: 1, padding: '10px 15px', borderRadius: '12px', border: '1px solid #fecdd3', outline: 'none', fontSize: '14px'}} />
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
                <input type="text" placeholder="Например: лук" value={newDislike} onChange={e => setNewDislike(e.target.value)} onKeyPress={e => e.key === 'Enter' && addDislike()} style={{flex: 1, padding: '10px 15px', borderRadius: '12px', border: '1px solid #fed7aa', outline: 'none', fontSize: '14px'}} />
                <button onClick={addDislike} style={{background: '#ea580c', color: 'white', border: 'none', padding: '0 20px', borderRadius: '12px', fontWeight: 700}}><PlusCircle size={20}/></button>
              </div>
            </div>

            <button onClick={() => setIsPreferencesModalOpen(false)} style={{width: '100%', padding: '15px', borderRadius: '16px', background: '#111', color: 'white', border: 'none', fontWeight: 800, fontSize: '16px'}}>Готово</button>
          </div>
        </div>
      )}
       
      <button className="menu-btn" onClick={() => setIsMenuOpen(true)} style={{ position: 'fixed', top: '10px', left: '20px', zIndex: 50, background: 'white', borderRadius: '50%', width: '44px', height: '44px', padding: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: 'none', cursor: 'pointer' }}> 
        <Menu size={24} color="#111" /> 
      </button> 

      {/* ИСПРАВЛЕНИЕ: МЕНЮ С СЕРОЙ ПОДСВЕТКОЙ АКТИВНОГО ПУНКТА И ЦВЕТНЫМИ ИКОНКАМИ */}
      {isMenuOpen && ( 
        <> 
          <div className="menu-overlay" onClick={() => setIsMenuOpen(false)} style={{zIndex: 99}} /> 
          <div className={`menu-drawer ${isMenuOpen ? 'open' : ''}`} style={{ left: 0, right: 'auto', transform: isMenuOpen ? 'translateX(0)' : 'translateX(-100%)', zIndex: 100, borderTopRightRadius: '24px', borderBottomRightRadius: '24px', borderTopLeftRadius: '0', borderBottomLeftRadius: '0' }}> 
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '40px'}}> 
               <span style={{fontSize: '24px', fontWeight: '900', color: '#059669'}}>SmartCook</span> 
               <X size={24} onClick={() => setIsMenuOpen(false)} style={{cursor: 'pointer'}} /> 
            </div> 
             
            <div className="menu-link" onClick={() => { setProfileView('main'); switchView('profile'); }} style={{ background: activeView === 'profile' ? '#f1f5f9' : 'transparent' }}>
               <User size={22} color="#0ea5e9" style={{flexShrink: 0}}/> Личный кабинет
            </div> 
            <div className="menu-link" onClick={() => switchView('service')} style={{ background: activeView === 'service' ? '#f1f5f9' : 'transparent' }}>
               <Search size={22} color="#10b981" style={{flexShrink: 0}}/> Поиск
            </div> 
            <div className="menu-link" onClick={() => switchView('feed')} style={{ background: activeView === 'feed' ? '#f1f5f9' : 'transparent' }}> 
               <Globe size={22} color="#8b5cf6" style={{flexShrink: 0}}/> Лента 
            </div> 
            <div className="menu-link" onClick={() => switchView('daily')} style={{ background: activeView === 'daily' ? '#f1f5f9' : 'transparent' }}>
               <Flame size={22} color="#f97316" style={{flexShrink: 0}}/> Рецепт дня
            </div> 
             
            <div className="menu-link" style={{ marginTop: '10px', background: activeView === 'about' ? '#f1f5f9' : 'transparent' }} onClick={() => switchView('about')}>
               <CheckCircle size={22} color="#3b82f6" style={{flexShrink: 0}}/> О проекте
            </div> 
          </div> 
        </> 
      )} 

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
                {/* ИСПРАВЛЕНИЕ: Красивый переключатель "По фото / По названию" */}
                <div style={{flex: 1, display: 'flex', background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)', padding: '6px', borderRadius: '20px', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'}}> 
                  <button onClick={() => setSearchMode('photo')} style={{ flex: 1, padding: '12px 5px', borderRadius: '16px', border: 'none', background: searchMode === 'photo' ? 'white' : 'transparent', fontWeight: 800, fontSize: '15px', boxShadow: searchMode === 'photo' ? '0 4px 15px rgba(0,0,0,0.05)' : 'none', color: searchMode === 'photo' ? '#059669' : '#64748b', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
                    <Camera size={18} /> По фото
                  </button>
                  <button onClick={() => setSearchMode('text')} style={{ flex: 1, padding: '12px 5px', borderRadius: '16px', border: 'none', background: searchMode === 'text' ? 'white' : 'transparent', fontWeight: 800, fontSize: '15px', boxShadow: searchMode === 'text' ? '0 4px 15px rgba(0,0,0,0.05)' : 'none', color: searchMode === 'text' ? '#0ea5e9' : '#64748b', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
                    <Search size={18} /> По названию
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
                      <input type="text" className="text-search-input" placeholder="Например: Паста Карбонара" value={textQuery} onChange={(e) => setTextQuery(e.target.value)} style={{ paddingRight: textQuery ? '40px' : '15px', marginBottom: 0 }} /> 
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
                {analysisResult.ingredients.map((ing, i) => <span key={i} style={{background: '#d1fae5', color: '#065f46', padding: '6px 12px', borderRadius: '100px', fontSize: '14px', fontWeight: 600}}>{ing}</span>)} 
              </div> 
              <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}> 
                {analysisResult.dishes.map((dish, i) => ( 
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
                    <input type="number" value={servings} onChange={(e) => { const val = e.target.value; if (val === '') setServings(''); else { const num = parseInt(val); if (!isNaN(num) && num > 0 && num <= 100) setServings(num); } }} onBlur={() => { if (servings === "") setServings(1); }} style={{width: '40px', textAlign: 'center', border: 'none', borderLeft: '1px solid #d1d5db', borderRight: '1px solid #d1d5db', padding: '6px 0', fontSize: '16px', fontWeight: 700, color: '#111', outline: 'none'}} /> 
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
                {recipe.steps.map((step, i) => ( 
                  <div key={i} className="step-row"> <div className="step-num">{i + 1}</div> <div className="step-text">{cleanText(step)}</div> </div> 
                ))} 
              </div> 

              <div className="chat-box" style={{marginTop: '30px'}}> 
                <div style={{fontWeight: 800, marginBottom: '20px', color: '#1e40af', fontSize: '18px', textAlign: 'center'}}> Задайте вопрос AI шеф-повару! </div> 
                <div style={{display: 'flex', gap: '10px', alignItems: 'flex-end'}}> 
                  <textarea 
                    placeholder="Например: чем заменить сливки?" 
                    value={question} 
                    onChange={(e) => {
                      setQuestion(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = (e.target.scrollHeight < 120 ? e.target.scrollHeight : 120) + 'px';
                    }} 
                    rows={1}
                    style={{ flex: 1, padding: '12px 15px', borderRadius: '24px', border: '1px solid #93c5fd', fontSize: '14px', outline: 'none', background: 'white', resize: 'none', overflowY: 'auto', minHeight: '44px', maxHeight: '120px' }}
                  /> 
                  <button className="chat-btn-center" onClick={handleAskChef} style={{flexShrink: 0, padding: 0, width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%'}}> <Send size={18} style={{marginLeft: '-2px'}}/> </button> 
                </div> 
                {answer && <div style={{marginTop: '20px', lineHeight: 1.5, background: 'white', padding: '15px', borderRadius: '16px'}}><strong>Ответ:</strong> {answer}</div>} 
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
                               e.target.style.height = 'auto';
                               e.target.style.height = (e.target.scrollHeight) + 'px';
                             }} 
                             rows={2}
                             style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', marginBottom: '15px', outline: 'none', resize: 'none', overflow: 'hidden'}} 
                           /> 
                           
                           <div style={{display: 'flex', gap: '10px'}}> 
                             <button onClick={() => {setUserPhotoFile(null); setUserPhotoPreview(null); setUserComment("");}} style={{flex: 1, padding: '12px', borderRadius: '8px', background: '#f3f4f6', border: 'none', color: '#4b5563', fontWeight: 700, cursor: 'pointer'}}>Отмена</button> 
                             <button onClick={() => submitFeedPost(recipe)} disabled={isUploadingPhoto} style={{flex: 2, padding: '12px', borderRadius: '8px', background: '#059669', border: 'none', color: 'white', fontWeight: 700, cursor: isUploadingPhoto ? 'default' : 'pointer'}}> {isUploadingPhoto ? "Отправка..." : "Отправить в ленту"} </button> 
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
                      <div key={item.id} className="card" style={{ padding: '15px', cursor: 'pointer', marginBottom: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} onClick={() => loadFromHistory(item, 'history')}> 
                        <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px', lineHeight: 1.3, height: '38px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}> {item.title} </div> 
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

      {/* === ЛЕНТА ФОТО === */} 
      {activeView === 'feed' && ( 
        <div style={{marginTop: '60px'}}> 
          <div style={{textAlign: 'center', marginBottom: '25px'}}> 
            <h1 style={{fontSize: '28px', fontWeight: '900', margin: '0 0 10px 0'}}> Лента 📸 </h1> 
            <p style={{color: '#6b7280', margin: 0}}>Вдохновляйтесь кулинарными шедеврами</p> 
          </div> 

          <div style={{fontSize: '14px', fontWeight: 600, color: '#6b7280', marginBottom: '8px'}}>Сортировка:</div> 
          <div style={{display: 'flex', gap: '8px', marginBottom: '25px', overflowX: 'auto', paddingBottom: '5px'}}> 
             <button onClick={() => fetchPhotosFeed('new')} style={{ padding: '8px 16px', borderRadius: '100px', border: 'none', whiteSpace: 'nowrap', background: photosSort === 'new' ? '#111' : '#f3f4f6', color: photosSort === 'new' ? 'white' : '#4b5563', fontWeight: 700, fontSize: '14px', transition: 'all 0.2s', cursor: 'pointer' }}>✨ Свежее</button> 
             <button onClick={() => fetchPhotosFeed('top')} style={{ padding: '8px 16px', borderRadius: '100px', border: 'none', whiteSpace: 'nowrap', background: photosSort === 'top' ? '#111' : '#f3f4f6', color: photosSort === 'top' ? 'white' : '#4b5563', fontWeight: 700, fontSize: '14px', transition: 'all 0.2s', cursor: 'pointer' }}>🔥 Популярное</button> 
             <button onClick={() => fetchPhotosFeed('old')} style={{ padding: '8px 16px', borderRadius: '100px', border: 'none', whiteSpace: 'nowrap', background: photosSort === 'old' ? '#111' : '#f3f4f6', color: photosSort === 'old' ? 'white' : '#4b5563', fontWeight: 700, fontSize: '14px', transition: 'all 0.2s', cursor: 'pointer' }}>🕰 Раннее</button> 
          </div> 

          <div style={{background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)', borderRadius: '20px', padding: '20px', marginBottom: '25px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', boxShadow: '0 4px 15px rgba(14, 165, 233, 0.2)'}}> 
            <div style={{background: 'white', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: '50%', marginBottom: '10px', color: '#0ea5e9'}}><PlusCircle size={28} /></div> 
            <h3 style={{margin: '0 0 5px 0', fontSize: '18px', fontWeight: 800, color: '#0369a1'}}>Приготовили по своему рецепту?</h3> 
            <p style={{margin: '0 0 15px 0', fontSize: '13px', color: '#0284c7', lineHeight: 1.4}}>Поделитесь кулинарным шедевром со всем сообществом, даже если не использовали ИИ!</p> 
            <button onClick={() => { setIsStandaloneUploadOpen(true); document.getElementById('standalone-photo-upload')?.click(); }} style={{background: '#0ea5e9', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '100px', fontWeight: 800, fontSize: '14px', cursor: 'pointer', boxShadow: '0 4px 10px rgba(14, 165, 233, 0.3)'}}>Выложить своё блюдо</button> 
            <input id="standalone-photo-upload" type="file" accept="image/*" style={{display: 'none'}} onChange={handleUserPhotoChange} /> 
          </div> 

          {/* Форма загрузки своего блюда */} 
          {isStandaloneUploadOpen && userPhotoPreview && ( 
            <div className="card animate-fade-in" style={{border: '2px solid #0ea5e9'}}> 
              <h3 style={{marginTop: 0, marginBottom: '15px'}}>Публикация своего блюда</h3> 
              <img src={userPhotoPreview} alt="Preview" style={{width: '100%', height: '200px', objectFit: 'cover', borderRadius: '12px', marginBottom: '15px'}} /> 
              
              <textarea 
                placeholder="Название блюда (Обязательно)" 
                value={standaloneTitle} 
                onChange={(e) => {
                  setStandaloneTitle(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = (e.target.scrollHeight) + 'px';
                }} 
                rows={1}
                style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #94a3b8', fontSize: '15px', fontWeight: 700, marginBottom: '10px', outline: 'none', resize: 'none', overflow: 'hidden'}} 
              /> 
               
              <textarea 
                placeholder="Описание / Рецепт от вас" 
                value={userComment} 
                onChange={(e) => {
                  setUserComment(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = (e.target.scrollHeight) + 'px';
                }} 
                rows={2}
                style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', marginBottom: '15px', outline: 'none', resize: 'none', overflow: 'hidden'}} 
              /> 
               
              <div style={{display: 'flex', gap: '10px'}}> 
                <button onClick={() => {setUserPhotoFile(null); setUserPhotoPreview(null); setStandaloneTitle(""); setUserComment(""); setIsStandaloneUploadOpen(false);}} style={{flex: 1, padding: '12px', borderRadius: '8px', background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 700, cursor: 'pointer'}}>Отмена</button> 
                <button onClick={() => submitFeedPost(null)} disabled={isUploadingPhoto} style={{flex: 2, padding: '12px', borderRadius: '8px', background: '#0ea5e9', border: 'none', color: 'white', fontWeight: 700, cursor: isUploadingPhoto ? 'default' : 'pointer'}}> {isUploadingPhoto ? "Загрузка..." : "Отправить в ленту"} </button> 
              </div> 
            </div> 
          )} 

          <div style={{display: 'flex', flexDirection: 'column', gap: '20px'}}> 
            {photosFeed.map((post) => ( 
              <div key={post.id} className="card" style={{padding: '0', overflow: 'hidden', border: '1px solid #e5e7eb'}}> 
                <div style={{padding: '15px', display: 'flex', alignItems: 'center', gap: '10px', background: 'white'}}> 
                   {post.user_avatar ? ( 
                      <img src={post.user_avatar} alt="Avatar" style={{width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover'}} /> 
                   ) : ( 
                      <div style={{width: '36px', height: '36px', borderRadius: '50%', background: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: '16px', flexShrink: 0}}> 
                        {post.user_name?.charAt(0).toUpperCase() || 'Ш'} 
                      </div> 
                   )} 
                   <div style={{flex: 1}}> 
                      <div style={{fontWeight: 800, fontSize: '14px', color: '#111'}}>{post.user_name || 'Анонимный шеф'}</div> 
                      {post.recipe_id ? ( 
                        <div style={{fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px'}}> 
                          Приготовил(а): <span style={{color: '#059669', fontWeight: 600, cursor: 'pointer'}} onClick={() => loadSharedRecipe(post.recipe_id, 'photos')}>{post.recipes?.title || 'Рецепт'}</span> 
                        </div> 
                      ) : ( 
                        <div style={{fontSize: '12px', color: '#0ea5e9', fontWeight: 700}}>По своему рецепту: {post.custom_title}</div> 
                      )} 
                   </div> 
                   {user && user.id === post.user_id && ( 
                      <button onClick={() => handleDeletePost(post.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={18} /></button> 
                   )} 
                </div> 
                 
                <img src={post.photo_url} alt="Блюдо" onClick={() => setFullScreenImage(post.photo_url)} style={{width: '100%', maxHeight: '400px', objectFit: 'cover', display: 'block', background: '#f3f4f6', cursor: 'zoom-in'}} /> 
                 
                <div style={{padding: '15px', background: 'white'}}> 
                  {post.comment && ( <p style={{margin: '0 0 15px 0', fontSize: '14px', color: '#374151', lineHeight: 1.5, wordBreak: 'break-word'}}> <strong>Описание:</strong> {post.comment} </p> )} 
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}> 
                    <div style={{display: 'flex', gap: '10px'}}> 
                      <button onClick={(e) => handlePhotoLike(e, post)} style={{background: post.is_liked ? '#fee2e2' : '#f3f4f6', border: 'none', borderRadius: '100px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', color: post.is_liked ? '#ef4444' : '#4b5563', fontWeight: 700, fontSize: '14px', transition: 'all 0.2s', cursor: 'pointer'}}> 
                        <Heart size={18} fill={post.is_liked ? "#ef4444" : "none"} /> {post.likes_count || 0} 
                      </button> 
                      <button onClick={() => openComments(post.id)} style={{background: '#f3f4f6', border: 'none', borderRadius: '100px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', color: '#4b5563', fontWeight: 700, fontSize: '14px', cursor: 'pointer'}}> 
                        <MessageCircle size={18} /> {post.comments_count || 0} 
                      </button> 
                    </div> 
                    {post.recipe_id && ( 
                      <button onClick={() => loadSharedRecipe(post.recipe_id, 'photos')} style={{background: 'transparent', border: 'none', color: '#0ea5e9', fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', padding: 0}}> 
                         К рецепту <ArrowRight size={16} /> 
                      </button> 
                    )} 
                  </div> 
                </div> 
              </div> 
            ))} 
            {photosFeed.length === 0 && <div style={{textAlign: 'center', padding: '40px', color: '#9ca3af'}}>Здесь пока нет фотографий. Поделитесь своим шедевром первым! 📸</div>} 
          </div> 
        </div> 
      )} 

      {/* === О ПРОЕКТЕ === */} 
      {activeView === 'about' && ( 
        <div className="card" style={{marginTop: '60px', padding: '0', overflow: 'hidden', border: 'none', boxShadow: '0 20px 60px -10px rgba(0,0,0,0.15)'}}> 
          <div style={{background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', padding: '40px 25px', color: 'white', textAlign: 'center'}}> 
            <div style={{fontSize: '50px', marginBottom: '10px'}}>🚀</div> 
            <h1 style={{fontSize: '32px', fontWeight: 900, margin: '0 0 10px 0', lineHeight: 1.1}}>Кухонная революция</h1> 
            <p style={{fontSize: '18px', opacity: 0.9, fontWeight: 500, maxWidth: '400px', margin: '0 auto'}}>Мы превращаем ваше «нечего есть» в гастрономический шедевр.</p> 
          </div> 
          <div style={{padding: '30px 25px'}}> 
            <div style={{background: '#fff1f2', borderRadius: '20px', padding: '20px', marginBottom: '30px', border: '1px solid #fecdd3'}}> 
              <h3 style={{marginTop: 0, color: '#be123c', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: 800}}><span style={{fontSize: '24px'}}>💸</span> Вы теряете 30.000₽</h3> 
              <p style={{marginBottom: 0, color: '#881337', lineHeight: 1.5}}>Именно столько средняя семья выбрасывает в мусорку ежегодно в виде испорченных продуктов.</p> 
            </div> 
            <h3 style={{textAlign: 'center', fontSize: '22px', fontWeight: 800, marginBottom: '20px'}}>Почему это работает?</h3> 
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '40px'}}> 
              <div style={{background: '#f8fafc', padding: '20px 15px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0'}}><div style={{background: '#dbeafe', color: '#2563eb', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px auto'}}><Wallet size={20} /></div><div style={{fontWeight: 800, fontSize: '15px', marginBottom: '5px'}}>Экономия</div><div style={{fontSize: '12px', color: '#64748b'}}>До 5000₽ в месяц</div></div> 
              <div style={{background: '#f8fafc', padding: '20px 15px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0'}}><div style={{background: '#fef3c7', color: '#d97706', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px auto'}}><Zap size={20} /></div><div style={{fontWeight: 800, fontSize: '15px', marginBottom: '5px'}}>Скорость</div><div style={{fontSize: '12px', color: '#64748b'}}>Мгновенный рецепт</div></div> 
              <div style={{background: '#f8fafc', padding: '20px 15px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0'}}><div style={{background: '#dcfce7', color: '#16a34a', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px auto'}}><Leaf size={20} /></div><div style={{fontWeight: 800, fontSize: '15px', marginBottom: '5px'}}>Zero Waste</div><div style={{fontSize: '12px', color: '#64748b'}}>Спасаем еду</div></div> 
              <div style={{background: '#f8fafc', padding: '20px 15px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0'}}><div style={{background: '#f3e8ff', color: '#9333ea', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px auto'}}><Globe size={20} /></div><div style={{fontWeight: 800, fontSize: '15px', marginBottom: '5px'}}>Разнообразие</div><div style={{fontSize: '12px', color: '#64748b'}}>Новые блюда</div></div> 
            </div> 
             
            <div style={{background: '#f8fafc', borderRadius: '24px', padding: '25px 20px', marginBottom: '40px', border: '1px solid #e2e8f0'}}> 
              <h3 style={{margin: '0 0 10px 0', fontSize: '20px', fontWeight: 800, textAlign: 'center'}}>Установите SmartCook как приложение 📲</h3> 
              <p style={{fontSize: '14px', color: '#64748b', textAlign: 'center', marginBottom: '20px', lineHeight: 1.5}}>Быстрый доступ к рецептам в один клик. Не занимает память, не требует скачивания из App Store или Google Play!</p> 
              <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}> 
                <div style={{background: 'white', padding: '15px', borderRadius: '16px', border: '1px solid #f1f5f9'}}> 
                  <div style={{fontWeight: 800, fontSize: '16px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px'}}>🍎 Для iPhone (в Safari)</div> 
                  <ol style={{margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#475569', lineHeight: 1.6}}> <li>Нажмите иконку <strong>«Поделиться»</strong> (квадрат со стрелочкой вверх в самом низу экрана).</li> <li>Пролистайте меню вниз и выберите <strong>«На экран "Домой"»</strong> (со значком ➕).</li> </ol> 
                </div> 
                <div style={{background: 'white', padding: '15px', borderRadius: '16px', border: '1px solid #f1f5f9'}}> 
                  <div style={{fontWeight: 800, fontSize: '16px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px'}}>🤖 Для Android (в Chrome)</div> 
                  <ol style={{margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#475569', lineHeight: 1.6}}> <li>Нажмите на <strong>меню</strong> (три точки в правом верхнем углу экрана).</li> <li>Выберите пункт <strong>«Добавить на гл. экран»</strong> или <strong>«Установить приложение»</strong>.</li> </ol> 
                </div> 
              </div> 
            </div> 
            <div style={{background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', borderRadius: '24px', padding: '30px 20px', textAlign: 'center', color: 'white', boxShadow: '0 10px 25px rgba(2, 132, 199, 0.4)', position: 'relative', overflow: 'hidden'}}> 
              <h3 style={{margin: '0 0 10px 0', fontSize: '22px', fontWeight: 900}}>Telegram канал проекта</h3> 
              <p style={{opacity: 0.9, fontSize: '15px', marginBottom: '25px', lineHeight: 1.5}}>Следите за обновлениями, предлагайте идеи и общайтесь напрямую с разработчиком.</p> 
              <a href="https://t.me/smartcook2026" target="_blank" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: 'white', color: '#0284c7', textDecoration: 'none', padding: '16px 20px', borderRadius: '100px', fontWeight: 800, fontSize: '16px', boxShadow: '0 5px 15px rgba(0,0,0,0.1)', transition: 'transform 0.2s'}}> <Send size={20} /> Подписаться</a> 
            </div> 
          </div> 
        </div> 
      )} 

      {/* === ЛИЧНЫЙ КАБИНЕТ === */} 
      {activeView === 'profile' && ( 
        <div className="card" style={{marginTop: '60px', padding: '30px 20px', textAlign: 'center', minHeight: '60vh'}}> 
          {!user ? ( 
            <> 
              <div style={{background: '#f3f4f6', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto'}}><User size={40} color="#9ca3af" /></div> 
              <h2 style={{fontSize: '24px', fontWeight: 800, marginBottom: '10px'}}>Личный кабинет</h2> 
              <p style={{color: '#6b7280', fontSize: '15px', marginBottom: '25px', lineHeight: 1.5}}>Здесь будут храниться ваши любимые рецепты и фото кулинарных шедевров.</p> 
              <div style={{background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '16px', padding: '20px', marginBottom: '25px'}}> 
                 <h3 style={{margin: '0 0 10px 0', fontSize: '18px', color: '#92400e'}}>Требуется авторизация 🔒</h3> 
                 <p style={{fontSize: '13px', color: '#b45309', marginBottom: '20px', lineHeight: 1.5}}>🛡 Нам не нужны ваши личные данные. Авторизация нужна только для того, чтобы ваши любимые рецепты и фото блюд навсегда сохранились в вашем личном кабинете. Никакого спама, обещаем!</p> 
                 <button className="btn-primary" style={{marginBottom: '10px'}} onClick={() => setIsAuthModalOpen(true)}> Войти или зарегистрироваться </button> 
              </div> 
            </> 
          ) : ( 
            <> 
              {profileView === 'main' && ( 
                <> 
                  <div style={{position: 'relative', width: '80px', height: '80px', margin: '0 auto 20px auto'}}> 
                    {user.user_metadata?.avatar_url ? ( <img src={user.user_metadata.avatar_url} alt="Avatar" style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '3px solid #059669'}} /> ) : ( <div style={{background: '#059669', width: '100%', height: '100%', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '30px', fontWeight: 800}}>{user.email?.charAt(0).toUpperCase() || 'U'}</div> )} 
                    <div style={{position: 'absolute', bottom: 0, right: 0, background: '#10b981', width: '20px', height: '20px', borderRadius: '50%', border: '3px solid white'}}></div> 
                  </div> 
                   
                  <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '5px'}}> 
                    <h2 style={{fontSize: '22px', fontWeight: 800, margin: 0, color: '#111'}}>{user.user_metadata?.full_name || 'Шеф-повар'}</h2> 
                    <button onClick={() => setIsEditingProfile(true)} style={{background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px'}}><Edit3 size={18} /></button> 
                  </div> 
                   
                  <p style={{color: '#6b7280', fontSize: '14px', marginBottom: '30px'}}>{user.email}</p> 

                  {/* НОВЫЙ БЛОК ПРЕДПОЧТЕНИЙ В ЛИЧНОМ КАБИНЕТЕ */}
                  <div style={{background: 'white', padding: '20px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.05)', marginBottom: '30px', textAlign: 'left'}}>
                    <h3 style={{margin: '0 0 15px 0', fontSize: '18px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px'}}>Вкусы и аллергии 🥦</h3>
                    
                    <div style={{marginBottom: '20px'}}>
                      <div style={{fontSize: '13px', fontWeight: 700, color: '#be123c', marginBottom: '8px'}}>Аллергии (Строго исключить)</div>
                      <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px'}}>
                        {allergies.map((item, idx) => (
                          <span key={idx} style={{background: '#ffe4e6', color: '#be123c', padding: '6px 12px', borderRadius: '100px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px'}}>
                            {item} <X size={14} onClick={() => removeAllergy(idx)} style={{cursor: 'pointer'}}/>
                          </span>
                        ))}
                      </div>
                      <div style={{display: 'flex', gap: '8px'}}>
                        <input type="text" placeholder="Например: орехи" value={newAllergy} onChange={e => setNewAllergy(e.target.value)} onKeyPress={e => e.key === 'Enter' && addAllergy()} style={{flex: 1, padding: '10px 15px', borderRadius: '12px', border: '1px solid #fecdd3', outline: 'none', fontSize: '14px'}} />
                        <button onClick={addAllergy} style={{background: '#be123c', color: 'white', border: 'none', padding: '0 15px', borderRadius: '12px', fontWeight: 700}}><PlusCircle size={20}/></button>
                      </div>
                    </div>

                    <div>
                      <div style={{fontSize: '13px', fontWeight: 700, color: '#b45309', marginBottom: '8px'}}>Не люблю (По возможности без этого)</div>
                      <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px'}}>
                        {dislikes.map((item, idx) => (
                          <span key={idx} style={{background: '#ffedd5', color: '#c2410c', padding: '6px 12px', borderRadius: '100px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px'}}>
                            {item} <X size={14} onClick={() => removeDislike(idx)} style={{cursor: 'pointer'}}/>
                          </span>
                        ))}
                      </div>
                      <div style={{display: 'flex', gap: '8px'}}>
                        <input type="text" placeholder="Например: лук" value={newDislike} onChange={e => setNewDislike(e.target.value)} onKeyPress={e => e.key === 'Enter' && addDislike()} style={{flex: 1, padding: '10px 15px', borderRadius: '12px', border: '1px solid #fed7aa', outline: 'none', fontSize: '14px'}} />
                        <button onClick={addDislike} style={{background: '#ea580c', color: 'white', border: 'none', padding: '0 15px', borderRadius: '12px', fontWeight: 700}}><PlusCircle size={20}/></button>
                      </div>
                    </div>
                  </div>

                  <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '30px'}}> 
                     <div onClick={() => setProfileView('history')} style={{background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)', padding: '20px', borderRadius: '24px', cursor: 'pointer', border: '1px solid #e9d5ff', boxShadow: '0 10px 20px -5px rgba(139, 92, 246, 0.1)', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden'}}> 
                       <div style={{position: 'absolute', top: '-10px', right: '-10px', opacity: 0.05, transform: 'scale(2)'}}><Clock size={64} color="#8b5cf6" /></div>
                       <div style={{background: 'white', width: '40px', height: '40px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', color: '#8b5cf6', boxShadow: '0 4px 10px rgba(139, 92, 246, 0.15)'}}><Clock size={20} /></div> 
                       <div style={{fontSize: '32px', fontWeight: 900, color: '#4c1d95', lineHeight: 1}}>{feed?.length || 0}</div> 
                       <div style={{fontSize: '14px', color: '#7c3aed', fontWeight: 700, marginTop: '6px'}}>История</div> 
                     </div> 
                      
                     <div onClick={() => setProfileView('favorites')} style={{background: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)', padding: '20px', borderRadius: '24px', cursor: 'pointer', border: '1px solid #fecdd3', boxShadow: '0 10px 20px -5px rgba(244, 63, 94, 0.1)', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden'}}> 
                       <div style={{position: 'absolute', top: '-10px', right: '-10px', opacity: 0.05, transform: 'scale(2)'}}><Heart size={64} color="#f43f5e" /></div>
                       <div style={{background: 'white', width: '40px', height: '40px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', color: '#f43f5e', boxShadow: '0 4px 10px rgba(244, 63, 94, 0.15)'}}><Heart size={20} /></div> 
                       <div style={{fontSize: '32px', fontWeight: 900, color: '#be123c', lineHeight: 1}}>{feed?.filter(r => r.is_favorite).length || 0}</div> 
                       <div style={{fontSize: '14px', color: '#e11d48', fontWeight: 700, marginTop: '6px'}}>Избранное</div> 
                     </div> 

                     <div onClick={() => setProfileView('photos')} style={{background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', padding: '20px', borderRadius: '24px', cursor: 'pointer', border: '1px solid #bae6fd', boxShadow: '0 10px 20px -5px rgba(14, 165, 233, 0.1)', gridColumn: 'span 2', display: 'flex', alignItems: 'center', textAlign: 'left', gap: '15px', position: 'relative', overflow: 'hidden'}}> 
                       <div style={{position: 'absolute', top: '50%', right: '10px', transform: 'translateY(-50%) scale(1.5)', opacity: 0.05}}><Camera size={64} color="#0ea5e9" /></div>
                       <div style={{background: 'white', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0ea5e9', boxShadow: '0 4px 10px rgba(14, 165, 233, 0.15)'}}><Camera size={24} /></div> 
                       <div style={{flex: 1, zIndex: 1}}> 
                         <div style={{fontSize: '28px', fontWeight: 900, color: '#0369a1', lineHeight: 1}}>{userPhotos.length}</div> 
                         <div style={{fontSize: '14px', color: '#0284c7', fontWeight: 700, marginTop: '4px'}}>Мои фото блюд</div> 
                       </div> 
                       <ChevronRight size={20} color="#38bdf8" style={{zIndex: 1}} /> 
                     </div> 
                  </div> 

                  <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '14px', borderRadius: '12px', background: '#fee2e2', color: '#ef4444', border: 'none', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}> <LogOut size={18} /> Выйти из аккаунта </button> 
                </> 
              )} 

              {/* ВНУТРЕННИЕ СТРАНИЦЫ ПРОФИЛЯ */} 
              {profileView === 'history' && ( 
                <div style={{textAlign: 'left'}}> 
                   <button onClick={() => setProfileView('main')} style={{display: 'flex', alignItems: 'center', gap: '8px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '100px', padding: '8px 16px', color: '#374151', fontSize: '14px', fontWeight: 600, marginBottom: '20px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', transition: 'all 0.2s', width: 'fit-content'}}> <ArrowLeft size={18} /> Назад в профиль </button> 
                   <h2 style={{fontSize: '22px', fontWeight: 900, marginBottom: '20px'}}>История рецептов 📜</h2> 
                   {feed?.length === 0 ? ( 
                      <div style={{textAlign: 'center', color: '#9ca3af', padding: '20px'}}>Ваша история пуста. Сгенерируйте первый рецепт!</div> 
                   ) : ( 
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '15px' }}> 
                        {feed?.map((item) => ( 
                          <div key={item.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '15px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'left', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }} onClick={() => loadFromHistory(item, 'profile_history')}> 
                            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px', lineHeight: 1.3, height: '38px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>{item.title}</div> 
                            <div style={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6b7280'}}> 
                               <div style={{display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap'}}><Clock size={12}/> {formatTime(item.time)}</div> 
                               {item.calories && <div style={{display: 'flex', alignItems: 'center', gap: '3px', color: '#f97316', whiteSpace: 'nowrap'}}><Flame size={12}/> {formatCalories(item.calories)}</div>} 
                            </div> 
                          </div> 
                        ))} 
                      </div> 
                   )} 
                </div> 
              )} 

              {profileView === 'favorites' && ( 
                <div style={{textAlign: 'left'}}> 
                   <button onClick={() => setProfileView('main')} style={{display: 'flex', alignItems: 'center', gap: '8px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '100px', padding: '8px 16px', color: '#374151', fontSize: '14px', fontWeight: 600, marginBottom: '20px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', transition: 'all 0.2s', width: 'fit-content'}}> <ArrowLeft size={18} /> Назад в профиль </button> 
                   <h2 style={{fontSize: '22px', fontWeight: 900, marginBottom: '20px'}}>Моё избранное ❤️</h2> 
                   {feed?.filter(r => r.is_favorite).length === 0 ? ( 
                      <div style={{textAlign: 'center', color: '#9ca3af', padding: '20px'}}>У вас пока нет любимых рецептов.</div> 
                   ) : ( 
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '15px' }}> 
                        {feed?.filter(r => r.is_favorite).map((item) => ( 
                          <div key={item.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '15px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'left', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }} onClick={() => loadFromHistory(item, 'profile_favorites')}> 
                            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px', lineHeight: 1.3, height: '38px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>{item.title}</div> 
                            <div style={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6b7280'}}> 
                               <div style={{display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap'}}><Clock size={12}/> {formatTime(item.time)}</div> 
                               {item.calories && <div style={{display: 'flex', alignItems: 'center', gap: '3px', color: '#f97316', whiteSpace: 'nowrap'}}><Flame size={12}/> {formatCalories(item.calories)}</div>} 
                            </div> 
                          </div> 
                        ))} 
                      </div> 
                   )} 
                </div> 
              )} 

              {profileView === 'photos' && ( 
                <div style={{textAlign: 'left'}}> 
                   <button onClick={() => setProfileView('main')} style={{display: 'flex', alignItems: 'center', gap: '8px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '100px', padding: '8px 16px', color: '#374151', fontSize: '14px', fontWeight: 600, marginBottom: '20px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', transition: 'all 0.2s', width: 'fit-content'}}> <ArrowLeft size={18} /> Назад в профиль </button> 
                   <h2 style={{fontSize: '22px', fontWeight: 900, marginBottom: '20px'}}>Мои фото 📸</h2> 

                   {userPhotos.length === 0 ? ( 
                      <div style={{textAlign: 'center', color: '#9ca3af', padding: '20px'}}>Вы еще не выкладывали фотографии блюд.</div> 
                   ) : ( 
                      <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}> 
                        {userPhotos.map((post) => ( 
                          <div key={post.id} style={{border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', background: 'white'}}> 
                              
                             <div style={{padding: '10px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}> 
                                <div style={{fontSize: '11px', color: '#9ca3af', fontWeight: 600}}> 
                                   {new Date(post.created_at).toLocaleDateString('ru-RU')} 
                                </div> 
                                <button onClick={() => handleDeletePost(post.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button> 
                             </div> 

                             <img src={post.photo_url} alt="Мое фото" onClick={() => setFullScreenImage(post.photo_url)} style={{width: '100%', height: '200px', objectFit: 'cover', display: 'block', cursor: 'zoom-in'}} /> 
                             <div style={{padding: '12px'}}> 
                               {post.recipe_id ? ( 
                                 <div style={{fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '5px'}}>Рецепт: <span style={{color: '#059669', cursor: 'pointer'}} onClick={() => loadSharedRecipe(post.recipe_id, false)}>{post.recipes?.title}</span></div> 
                               ) : ( 
                                 <div style={{fontSize: '13px', fontWeight: 700, color: '#0ea5e9', marginBottom: '5px'}}>Свое блюдо: {post.custom_title}</div> 
                               )} 
                                
                               {post.comment && ( <p style={{margin: '0 0 10px 0', fontSize: '13px', color: '#4b5563', lineHeight: 1.4, wordBreak: 'break-word'}}> <strong>Описание:</strong> {post.comment} </p> )} 

                               <div style={{display: 'flex', gap: '15px', marginTop: '8px'}}> 
                                  <div style={{fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '5px'}}><Heart size={14} fill="#ef4444" color="#ef4444" /> {post.likes_count || 0} лайков</div> 
                                  <div style={{fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '5px'}}><MessageCircle size={14} /> {post.comments_count || 0} комментов</div> 
                               </div> 
                                
                               <div style={{marginTop: '12px'}}> 
                                  {post.status === 'approved' && <span style={{background: '#dcfce7', color: '#16a34a', padding: '4px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: 700}}>✅ Одобрено</span>} 
                                  {post.status === 'rejected' && <span style={{background: '#fee2e2', color: '#dc2626', padding: '4px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: 700}}>❌ Отклонено</span>} 
                                  {post.status === 'pending' && <span style={{background: '#fef3c7', color: '#d97706', padding: '4px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: 700}}>⏳ На проверке</span>} 
                               </div> 
                             </div> 
                          </div> 
                        ))} 
                      </div> 
                   )} 
                </div> 
              )} 
            </> 
          )} 
        </div> 
      )} 

    </div> 
  ); 
}