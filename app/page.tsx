"use client";

import { useState, useEffect, ChangeEvent } from "react";
import { supabase } from "@/lib/supabase"; 
// import DailyRecipe from "@/components/DailyRecipe"; // Закомментировали, так как теперь рецепт дня встроен с новым ВАУ-дизайном
import { 
  Menu, X, Flame, Send, Camera, Search, Clock, Heart, 
  ArrowRight, ArrowLeft, RotateCcw, CheckCircle, Sparkles, Image as ImageIcon, 
  Wallet, Zap, Leaf, Globe, ChevronRight, ChevronDown, ChevronUp, Shuffle, ShoppingCart, Lock, ShoppingBag, ExternalLink, Info, ThumbsUp 
} from "lucide-react";

// import imageCompression from 'browser-image-compression'; 

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
  is_liked?: boolean; 
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

export default function Home() {
  const [activeView, setActiveView] = useState<'service' | 'about' | 'daily' | 'feed'>('service');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [dailyRecipe, setDailyRecipe] = useState<DailyRecipeType | null>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<'photo' | 'text'>('photo');
  const [textQuery, setTextQuery] = useState(""); 
  
  const [cookingMode, setCookingMode] = useState<'strict' | 'extended'>('strict');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false); 
  
  const [analysisResult, setAnalysisResult] = useState<AnalysisData | null>(null);
  const [selectedDish, setSelectedDish] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<RecipeData | null>(null);
  
  const [feed, setFeed] = useState<DBRecipe[]>([]); 
  const [publicFeed, setPublicFeed] = useState<DBRecipe[]>([]);
  const [feedSort, setFeedSort] = useState<'new' | 'top'>('new');
  
  const [userId, setUserId] = useState<string | null>(null);
  
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'favorites'>('all');
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const [fromFeed, setFromFeed] = useState(false);
  const [currentHoliday, setCurrentHoliday] = useState<HolidayType | null>(null);

  // Стейт для сохранения рецепта дня
  const [dailyFavoriteId, setDailyFavoriteId] = useState<number | null>(null);

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
    try {
      let storedId = localStorage.getItem("cook_user_id");
      if (!storedId) { 
        storedId = "user_" + Math.random().toString(36).substr(2, 9); 
        localStorage.setItem("cook_user_id", storedId); 
      }
      setUserId(storedId); 
      fetchMyRecipes(storedId); 
    } catch (e) { console.error(e); }

    fetch('/api/daily')
      .then(res => res.json())
      .then(data => {
        if (data && !data.error) {
          setDailyRecipe(data);
        } else {
          console.error("Daily Recipe Error:", data.error);
        }
      })
      .catch(console.error);

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

    if (holidays[key]) {
      setCurrentHoliday(holidays[key]);
    }
  }, []);

  useEffect(() => {
    if (activeView === 'feed') {
      fetchPublicFeed(feedSort);
    }
  }, [activeView]);

  const fetchMyRecipes = async (currentId: string) => {
    if (!currentId) return;
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .eq('session_id', currentId)
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error("History Error:", error);
    } else if (data) {
      setFeed(data);
    }
  };

  const fetchPublicFeed = async (sortType: 'new' | 'top') => {
    setFeedSort(sortType);
    if (!userId) return;
    try {
      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort: sortType, userId: userId })
      });
      const json = await res.json();
      if (json.feed) {
        setPublicFeed(json.feed);
      }
    } catch (e) { console.error("Feed Error:", e); }
  };

  const handlePublicLike = async (e: any, item: DBRecipe) => {
    e.stopPropagation();
    if (!userId) return;

    const action = item.is_liked ? 'unlike' : 'like';
    const newCount = item.is_liked ? (item.likes_count || 0) - 1 : (item.likes_count || 0) + 1;

    const updatedFeed = publicFeed.map(r => 
      r.id === item.id ? { ...r, is_liked: !item.is_liked, likes_count: newCount } : r
    );
    setPublicFeed(updatedFeed);

    try {
      await fetch("/api/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId: item.id, userId: userId, action })
      });
    } catch (err) {
      console.error("Like Error:", err);
    }
  };

  const toggleFavorite = async (e: any, targetId: number, currentStatus: boolean = false) => {
    e.stopPropagation(); 
    if (!targetId) return;
    
    const newStatus = !currentStatus;
    const updatedFeed = feed?.map(r => r.id === targetId ? { ...r, is_favorite: newStatus } : r) || [];
    setFeed(updatedFeed);
    
    if (recipe && recipe.id === targetId) {
      setRecipe({ ...recipe, is_favorite: newStatus });
    }

    try { 
      await fetch("/api/favorite", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ id: targetId, isFavorite: newStatus }) 
      });
    } catch (err) { 
      console.error("Favorite Error:", err); 
    }
  };

  // ФУНКЦИЯ ДЛЯ ДОБАВЛЕНИЯ РЕЦЕПТА ДНЯ В ИЗБРАННОЕ
  const toggleDailyFavorite = async () => {
    if (!dailyRecipe || !userId) return;
    
    if (dailyFavoriteId) {
      // Удаляем из избранного
      const updatedFeed = feed?.map(r => r.id === dailyFavoriteId ? { ...r, is_favorite: false } : r) || [];
      setFeed(updatedFeed);
      setDailyFavoriteId(null);
      try {
        await fetch("/api/favorite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: dailyFavoriteId, isFavorite: false }) });
      } catch(e) { console.error(e); }
    } else {
      // Добавляем в БД
      const { data, error } = await supabase.from('recipes').insert({
        session_id: userId,
        title: dailyRecipe.title,
        description: dailyRecipe.description,
        time: String(dailyRecipe.time),
        calories: String(dailyRecipe.calories),
        ingredients: dailyRecipe.ingredients || dailyRecipe.detailed_ingredients?.map(i => `${i.name} - ${i.amount}`) || [],
        detailed_ingredients: dailyRecipe.detailed_ingredients || [],
        missing_ingredients: dailyRecipe.missing_ingredients || [],
        steps: dailyRecipe.steps,
        is_favorite: true
      }).select('*');
      
      if (data && data.length > 0) {
         setDailyFavoriteId(data[0].id);
         fetchMyRecipes(userId); // Обновляем историю
      }
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; 
    if (!files || files.length === 0) return;
    const rawFile = files[0];
    setPreview(URL.createObjectURL(rawFile));
    setAnalysisResult(null); setRecipe(null); setSelectedDish(null); setQuestion(""); setAnswer(null); 
    setIsProcessing(true);

    try {
      const imageCompression = (await import('browser-image-compression')).default;
      const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, fileType: "image/jpeg" };
      const compressedFile = await imageCompression(rawFile, options);
      const finalFile = new File([compressedFile], "image.jpg", { type: "image/jpeg" });
      setFile(finalFile);
      setPreview(URL.createObjectURL(finalFile)); 
    } catch (error) {
      alert("Не удалось обработать фото.");
      setFile(null); 
    } finally {
      setIsProcessing(false);
    }
  };

  const triggerFileInput = () => {
    document.getElementById('hidden-file-input')?.click();
  };

  const handleAnalyze = async () => {
    if (!file) return; 
    setAnalyzing(true); setRecipe(null);
    try {
      const formData = new FormData(); 
      formData.append("image", file);
      formData.append("mode", cookingMode);

      const response = await fetch("/api/analyze", { method: "POST", body: formData });
      if (!response.ok) throw new Error(`Error: ${response.status}`);
      const json = await response.json(); 
      if (json.error) throw new Error(json.error); 
      setAnalysisResult(json.data);
    } catch (err: any) { 
      alert("Ошибка: " + err.message); 
    } finally { 
      setAnalyzing(false); 
    }
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
    setSelectedDish(dishName); setLoadingRecipe(true); setRecipe(null);
    
    // Скролл вниз, чтобы пользователь видел, что что-то происходит
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

    try {
      const response = await fetch("/api/recipe", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ dish: dishName, ingredients: analysisResult.ingredients, sessionId: userId }) 
      });
      const json = await response.json(); 
      if (json.error) throw new Error(json.error); 
      setRecipe({ ...json.recipe, ingredients: analysisResult.ingredients }); 
      updateLatestRecipeId();
    } catch (err: any) { alert("Ошибка: " + err.message); } finally { setLoadingRecipe(false); }
  };

  const handleSmartVariant = async () => {
    setLoadingRecipe(true);
    try {
      if (analysisResult) {
        const response = await fetch("/api/regenerate", { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify({ ingredients: analysisResult.ingredients }) 
        });
        const json = await response.json(); 
        if (json.error) throw new Error(json.error);
        const newDishes = json.dishes.filter((d: string) => d !== selectedDish);
        const freshIdea = newDishes.length > 0 ? newDishes[0] : json.dishes[0];
        setAnalysisResult({ ...analysisResult, dishes: json.dishes });
        await getRecipeFromPhoto(freshIdea);
      } else if (searchMode === 'text' && textQuery) {
        const response = await fetch("/api/search-recipe", { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify({ query: textQuery, sessionId: userId, isVariant: true }) 
        });
        const json = await response.json(); 
        if (!response.ok) throw new Error(json.error);
        setRecipe({ ...json.recipe, missing_ingredients: json.recipe.missing_ingredients || [] }); 
        updateLatestRecipeId();
      }
    } catch (err: any) { 
      alert("Ошибка: " + err.message); 
    } finally { 
      setLoadingRecipe(false); 
    }
  };

  const handleTextSearch = async () => {
    if (!textQuery.trim() || !userId) return; 
    setLoadingRecipe(true); 
    setRecipe(null); 
    setAnalysisResult(null);
    try {
      const response = await fetch("/api/search-recipe", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ query: textQuery, sessionId: userId })
      });
      const json = await response.json(); 
      if (!response.ok) {
        throw new Error(json.error || "Ошибка поиска");
      }
      setRecipe({ ...json.recipe, missing_ingredients: json.recipe.missing_ingredients || [] }); 
      updateLatestRecipeId();
    } catch (err: any) { 
      alert("🛑 " + err.message); 
    } finally { 
      setLoadingRecipe(false); 
    }
  };

  const updateLatestRecipeId = async () => {
    if (!userId) return;
    const { data } = await supabase.from('recipes').select('*').eq('session_id', userId).order('created_at', { ascending: false }).limit(1);
    if (data && data.length > 0) {
      const latest = data[0];
      setRecipe(prev => prev ? { ...prev, id: latest.id, is_favorite: latest.is_favorite } : prev);
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

  const loadFromHistory = (item: DBRecipe, source: 'feed' | 'history' = 'history') => {
    setAnalysisResult(null); setQuestion(""); setAnswer(null);
    setRecipe({ id: item.id, is_favorite: item.is_favorite, title: item.title, description: item.description, time: item.time, calories: item.calories, steps: item.steps || [], missing_ingredients: item.missing_ingredients || [], ingredients: item.ingredients || [], detailed_ingredients: item.detailed_ingredients || [] });
    
    setFromFeed(source === 'feed');
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
    setActiveView('service'); 
  };

  const handleBackToSource = () => {
    setRecipe(null);
    if (fromFeed) {
      setActiveView('feed');
      setFromFeed(false);
    } else {
      setActiveView('service');
    }
  };

  const switchView = (view: 'service' | 'about' | 'daily' | 'feed') => {
    setActiveView(view);
    setIsMenuOpen(false);
    setQuestion(""); 
    setAnswer(null);
  };

  const displayedFeed = filterMode === 'all' ? feed : feed?.filter(r => r.is_favorite);
  const visibleHistory = historyExpanded ? displayedFeed : displayedFeed?.slice(0, 4);

  return (
    <div className="container">
      
      {/* КНОПКА МЕНЮ */}
      <button 
        className="menu-btn" 
        onClick={() => setIsMenuOpen(true)}
        style={{ 
          position: 'fixed', 
          top: '10px',  
          left: '20px', 
          right: 'auto', 
          zIndex: 50,
          background: 'white',
          borderRadius: '50%', // КРУГЛАЯ
          width: '44px',       
          height: '44px',      
          padding: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          border: 'none',
          cursor: 'pointer'
        }} 
      >
        <Menu size={24} color="#111" />
      </button>

      {/* МЕНЮ (ИСПРАВЛЕНО: ЗАКРУГЛЕНИЯ СПРАВА) */}
      {isMenuOpen && (
        <>
          <div className="menu-overlay" onClick={() => setIsMenuOpen(false)} style={{zIndex: 99}} />
          <div 
            className={`menu-drawer ${isMenuOpen ? 'open' : ''}`}
            style={{ 
              left: 0, 
              right: 'auto', 
              transform: isMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
              zIndex: 100,
              // ИСПРАВЛЕНИЕ: Квадратная слева, круглая справа
              borderTopRightRadius: '24px',
              borderBottomRightRadius: '24px',
              borderTopLeftRadius: '0',
              borderBottomLeftRadius: '0'
            }}
          >
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '40px'}}>
               <span style={{fontSize: '24px', fontWeight: '900', color: '#059669'}}>SmartCook</span>
               <X size={24} onClick={() => setIsMenuOpen(false)} style={{cursor: 'pointer'}} />
            </div>
            <div className="menu-link" onClick={() => switchView('service')}><Search size={20}/> Поиск</div>
            <div className="menu-link" onClick={() => switchView('daily')}><Flame size={20} color="#f97316"/> Рецепт дня</div>
            <div className="menu-link" onClick={() => switchView('feed')}><Globe size={20} color="#8b5cf6"/> Лента</div>
            <div className="menu-link" onClick={() => switchView('about')}><CheckCircle size={20} color="#3b82f6"/> О проекте</div>
          </div>
        </>
      )}

      {/* === СЕРВИС (ГЛАВНАЯ) === */}
      {activeView === 'service' && (
        <>
          {!fromFeed && (
            <>
              <div className="hero">
                <h1 className="brand-name">SmartCook</h1>
                <div className="brand-sub">Ваш личный AI Шеф-повар</div>
                {currentHoliday && (
                  <div className="animate-fade-in" style={{
                    background: currentHoliday.gradient,
                    color: 'white',
                    padding: '20px',
                    borderRadius: '20px',
                    marginTop: '25px',
                    textAlign: 'center',
                    boxShadow: '0 10px 30px -10px rgba(0,0,0,0.3)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                     <div style={{position: 'absolute', top: '-10px', right: '-10px', width: '60px', height: '60px', background: 'white', opacity: 0.1, borderRadius: '50%'}}></div>
                     <div style={{position: 'absolute', bottom: '-20px', left: '-10px', width: '80px', height: '80px', background: 'white', opacity: 0.1, borderRadius: '50%'}}></div>
                     <div style={{fontSize: '22px', marginBottom: '8px', fontWeight: '700', fontFamily: '"Times New Roman", serif', fontStyle: 'italic'}}>
                       {currentHoliday.icon} {currentHoliday.title}
                     </div>
                     <div style={{fontSize: '15px', lineHeight: '1.5', opacity: 0.95, fontWeight: '500'}}>
                       {currentHoliday.text}
                     </div>
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

              <div className="switch-box">
                <button className={`switch-btn ${searchMode === 'photo' ? 'active' : ''}`} onClick={() => setSearchMode('photo')}>📸 Фото</button>
                <button className={`switch-btn ${searchMode === 'text' ? 'active' : ''}`} onClick={() => setSearchMode('text')}>📝 Название</button>
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
                        <button className="btn-replace" onClick={triggerFileInput}>
                          <RotateCcw size={16} /> Заменить фото
                        </button>
                      </div>
                    )}

                    {file && (
                       <div className="mode-toggle-container">
                          <button 
                            className={`mode-btn ${cookingMode === 'strict' ? 'active' : ''}`}
                            onClick={() => setCookingMode('strict')}
                          >
                             <Lock size={16} /> Строго из этого
                          </button>
                          <button 
                            className={`mode-btn ${cookingMode === 'extended' ? 'active' : ''}`}
                            onClick={() => setCookingMode('extended')}
                          >
                             <ShoppingBag size={16} /> Могу докупить
                          </button>
                       </div>
                    )}

                    <button className="btn-primary" onClick={handleAnalyze} disabled={!file || analyzing || isProcessing}>
                      {isProcessing ? "🔄 Обработка фото..." : analyzing ? "🔍 Изучаю продукты..." : "✨ Найти рецепт"}
                    </button>
                  </>
                ) : (
                  <>
                    <input type="text" className="text-search-input" 
                           placeholder="Например: Паста Карбонара" value={textQuery} onChange={(e) => setTextQuery(e.target.value)} />
                    <button className="btn-primary" onClick={handleTextSearch} disabled={loadingRecipe || !textQuery.trim()}>
                      {loadingRecipe ? "🍳 Готовлю..." : "🔍 Найти"}
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {/* Результаты анализа */}
          {analysisResult && (
            <div className="card">
              <h3 style={{textAlign: 'center', marginBottom: '20px'}}>Я вижу продукты:</h3>
              <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginBottom: '25px'}}>
                {analysisResult.ingredients.map((ing, i) => <span key={i} style={{background: '#d1fae5', color: '#065f46', padding: '6px 12px', borderRadius: '100px', fontSize: '14px', fontWeight: 600}}>{ing}</span>)}
              </div>
              
              <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                {analysisResult.dishes.map((dish, i) => (
                  <button 
                    key={i} 
                    onClick={() => getRecipeFromPhoto(dish)} 
                    className="btn-secondary"
                    disabled={loadingRecipe}
                    style={{
                      opacity: loadingRecipe && selectedDish !== dish ? 0.5 : 1,
                      borderColor: selectedDish === dish ? '#f97316' : '#e5e7eb',
                      background: selectedDish === dish ? '#fff7ed' : 'white'
                    }}
                  >
                    <span>{dish}</span>
                    {loadingRecipe && selectedDish === dish ? (
                      <Sparkles className="animate-spin" size={24} color="#f97316" />
                    ) : (
                      <ChevronRight color="#d1d5db" />
                    )}
                  </button>
                ))}
              </div>
              
              <button className="btn-magic" onClick={handleRegenerate} disabled={isRegenerating || loadingRecipe}>
                 <Sparkles size={20} />
                 {isRegenerating ? "Включаю фантазию..." : "✨ Хочу что-то необычное"}
              </button>
            </div>
          )}

          {/* === ПРОСМОТР РЕЦЕПТА === */}
          {recipe && (
            <div className="card" style={{position: 'relative', overflow: 'visible', marginTop: '20px'}}>
              
              {fromFeed && (
                <button 
                  onClick={handleBackToSource}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: 'white', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '100px',
                    padding: '8px 16px',
                    color: '#374151', 
                    fontSize: '14px', fontWeight: 600,
                    marginTop: '40px',
                    marginBottom: '20px', 
                    cursor: 'pointer', 
                    boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                    transition: 'all 0.2s'
                  }}
                >
                  <ArrowLeft size={18} /> Назад в ленту
                </button>
              )}

              <div className="recipe-header" style={{flexDirection: 'column', alignItems: 'flex-start', gap: '15px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center'}}>
                  <h2 className="recipe-title" style={{marginBottom: 0, paddingRight: '10px', fontSize: '24px'}}>{recipe.title}</h2>
                  <div onClick={(e) => toggleFavorite(e, recipe.id!, recipe.is_favorite)} style={{cursor: 'pointer', flexShrink: 0}}>
                    <Heart size={30} 
                      className={recipe.is_favorite ? "fill-red-500 text-red-500" : "text-gray-300"} 
                      color={recipe.is_favorite ? "#ef4444" : "#d1d5db"} 
                      fill={recipe.is_favorite ? "#ef4444" : "none"}
                    />
                  </div>
                </div>

                {recipe.description && (
                  <p style={{fontSize: '15px', color: '#4b5563', lineHeight: '1.5', margin: '5px 0 15px 0'}}>
                    {recipe.description}
                  </p>
                )}
              
                {!fromFeed && (analysisResult || (searchMode === 'text' && recipe)) && (
                  <button 
                    onClick={handleSmartVariant}
                    disabled={loadingRecipe}
                    className="btn-smart-variant"
                  >
                    {loadingRecipe ? (
                      <Sparkles className="animate-spin" size={24} color="#f97316"/>
                    ) : (
                      <Shuffle size={20} color="#f97316"/> 
                    )}
                    <span style={{flex: 1, textAlign: 'left'}}>
                      {loadingRecipe ? "Ищем идеи..." : "Подобрать другой рецепт"}
                    </span>
                    <ChevronRight size={18} color="#9ca3af" />
                  </button>
                )}
              </div>

              <div className="recipe-tags" style={{marginTop: '15px'}}>
                <div className="tag-badge"><Clock size={16}/> {formatTime(recipe.time)}</div>
                {recipe.calories && <div className="tag-badge orange"><Flame size={16}/> {formatCalories(recipe.calories)}</div>}
              </div>

              {(() => {
                const itemsToBuy = (fromFeed && recipe.detailed_ingredients)
                  ? recipe.detailed_ingredients.map(ing => ing.name)
                  : (recipe.missing_ingredients || []);

                if (itemsToBuy.length === 0) return null;

                return (
                  <div style={{
                    background: '#fffbeb', 
                    border: '1px solid #fcd34d', 
                    borderRadius: '12px', 
                    padding: '15px', 
                    margin: '20px 0',
                    color: '#92400e'
                  }}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 800}}>
                      <ShoppingCart size={20} /> {(searchMode === 'text' || fromFeed) ? "Нужно купить:" : "Нужно докупить:"}
                    </div>
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px'}}>
                      {itemsToBuy.map((item, idx) => (
                        <a 
                          key={idx} 
                          href={`https://www.ozon.ru/search/?text=${encodeURIComponent(item)}&from_global=true`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                             background: '#fef3c7', 
                             padding: '6px 12px', 
                             borderRadius: '8px', 
                             fontSize: '14px', 
                             fontWeight: 600,
                             textDecoration: 'none',
                             color: '#92400e',
                             display: 'flex',
                             alignItems: 'center',
                             gap: '6px',
                             border: '1px solid #fcd34d',
                             cursor: 'pointer',
                             transition: 'all 0.2s'
                          }}
                        >
                          {item} <ExternalLink size={12} style={{opacity: 0.6}} />
                        </a>
                      ))}
                    </div>
                    <div style={{fontSize: '12px', color: '#b45309', display: 'flex', alignItems: 'center', gap: '5px'}}>
                       <Info size={14} /> Нажмите на ингредиент, чтобы заказать быструю доставку Ozon Fresh до двери
                    </div>
                  </div>
                );
              })()}

              {recipe.detailed_ingredients && (
                <div className="ing-box">
                  <h3 style={{marginTop: 0, marginBottom: '15px'}}>Ингредиенты</h3>
                  {recipe.detailed_ingredients.map((ing, i) => (
                    <div key={i} className="ing-row">
                      <span>{ing.name}</span> <span className="ing-val">{ing.amount}</span>
                    </div>
                  ))}
                </div>
              )}

              <h3 style={{fontSize: '22px', fontWeight: 800, marginBottom: '20px'}}>👨‍🍳 Рецепт приготовления</h3>
              <div>
                {recipe.steps.map((step, i) => (
                  <div key={i} className="step-row">
                    <div className="step-num">{i + 1}</div>
                    <div className="step-text">{cleanText(step)}</div>
                  </div>
                ))}
              </div>

              <div className="chat-box">
                <div style={{fontWeight: 800, marginBottom: '20px', color: '#1e40af', fontSize: '18px', textAlign: 'center'}}>
                   Задайте вопрос AI шеф-повару!
                </div>
                <div className="chat-layout">
                  <input className="chat-input" placeholder="Например: чем заменить сливки?" value={question} onChange={(e) => setQuestion(e.target.value)} />
                  <button className="chat-btn-center" onClick={handleAskChef}>
                    <Send size={18}/> Спросить
                  </button>
                </div>
                {answer && <div style={{marginTop: '20px', lineHeight: 1.5, background: 'white', padding: '15px', borderRadius: '16px'}}><strong>Ответ:</strong> {answer}</div>}
              </div>
            </div>
          )}

          {/* ИСТОРИЯ */}
          {!fromFeed && (
            <>
              <div className="history-bar" style={{marginTop: '40px'}}>
                <span className="history-title">📜 История рецептов</span>
                <div className="history-filters">
                  <button className={`filter-pill ${filterMode === 'all' ? 'active' : ''}`} onClick={() => setFilterMode('all')}>Все</button>
                  <button className={`filter-pill ${filterMode === 'favorites' ? 'active' : ''}`} onClick={() => setFilterMode('favorites')}>❤️ Избранное</button>
                </div>
              </div>
              
              {historyExpanded && displayedFeed && displayedFeed.length > 4 && (
                <button 
                  className="btn-expand-history"
                  onClick={() => setHistoryExpanded(false)}
                  style={{marginTop: '0', marginBottom: '15px'}}
                >
                  Свернуть историю <ChevronUp size={16}/>
                </button>
              )}
              
              {displayedFeed?.length === 0 && filterMode === 'favorites' ? (
                 <div className="empty-msg">В избранном пока пусто 💔<br/>Добавьте рецепты лайком!</div>
              ) : (
                <>
                  <div style={{
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', 
                    gap: '15px', 
                    marginBottom: '10px'
                  }}>
                    {visibleHistory?.map((item) => (
                      <div 
                        key={item.id} 
                        className="card" 
                        style={{
                          padding: '15px', 
                          cursor: 'pointer', 
                          marginBottom: 0,
                          height: '100%', 
                          display: 'flex', 
                          flexDirection: 'column', 
                          justifyContent: 'space-between'
                        }} 
                        onClick={() => loadFromHistory(item, 'history')}
                      >
                        <div style={{
                          fontWeight: 700, 
                          fontSize: '14px', 
                          marginBottom: '8px', 
                          lineHeight: 1.3, 
                          height: '38px', 
                          overflow: 'hidden', 
                          display: '-webkit-box', 
                          WebkitLineClamp: 2, 
                          WebkitBoxOrient: 'vertical',
                          wordBreak: 'break-word' 
                        }}>
                          {item.title}
                        </div>
                        
                        <div style={{display: 'flex', gap: '10px', fontSize: '11px', color: '#6b7280'}}>
                           <div style={{display: 'flex', alignItems: 'center', gap: '3px'}}><Clock size={12}/> {formatTime(item.time)}</div>
                           {item.calories && <div style={{display: 'flex', alignItems: 'center', gap: '3px', color: '#f97316'}}><Flame size={12}/> {formatCalories(item.calories)}</div>}
                        </div>

                      </div>
                    ))}
                  </div>

                  {!historyExpanded && displayedFeed && displayedFeed.length > 4 && (
                    <button 
                      className="btn-expand-history"
                      onClick={() => setHistoryExpanded(true)}
                    >
                      Показать еще ({displayedFeed.length - 4}) <ChevronDown size={16}/>
                    </button>
                  )}
                </>
              )}
            </>
          )}

          <section style={{marginTop: '40px', padding: '20px', background: '#f9fafb', borderRadius: '16px', color: '#6b7280', fontSize: '14px', lineHeight: '1.6'}}>
            <h2 style={{fontSize: '18px', color: '#1f2937', marginBottom: '10px', fontWeight: '700'}}>
              SmartCook: Генератор рецептов по фото
            </h2>
            <p>
              SmartCook использует искусственный интеллект для распознавания продуктов и создания рецептов за секунды.
            </p>
          </section>

        </>
      )}

      {/* === ЛЕНТА (ФИД) === */}
      {activeView === 'feed' && (
        <div style={{marginTop: '60px'}}>
          <div style={{textAlign: 'center', marginBottom: '25px'}}>
            <h1 style={{fontSize: '28px', fontWeight: '900', margin: '0 0 10px 0'}}>Лента 🌍</h1>
            <p style={{color: '#6b7280', margin: 0}}>Что готовят другие прямо сейчас</p>
          </div>

          <div style={{fontSize: '14px', fontWeight: 600, color: '#6b7280', marginBottom: '8px', paddingLeft: '5px'}}>
            Сортировать по:
          </div>

          <div style={{display: 'flex', background: '#f3f4f6', padding: '4px', borderRadius: '12px', marginBottom: '25px'}}>
            <button 
              onClick={() => fetchPublicFeed('new')}
              style={{
                flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                background: feedSort === 'new' ? 'white' : 'transparent',
                fontWeight: 700, fontSize: '16px',
                boxShadow: feedSort === 'new' ? '0 2px 10px rgba(0,0,0,0.05)' : 'none',
                color: feedSort === 'new' ? '#111' : '#6b7280',
                transition: 'all 0.2s'
              }}
            >
              ✨ Новое
            </button>
            <button 
              onClick={() => fetchPublicFeed('top')}
              style={{
                flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                background: feedSort === 'top' ? 'white' : 'transparent',
                fontWeight: 700, fontSize: '16px',
                boxShadow: feedSort === 'top' ? '0 2px 10px rgba(0,0,0,0.05)' : 'none',
                color: feedSort === 'top' ? '#111' : '#6b7280',
                transition: 'all 0.2s'
              }}
            >
              🔥 Популярное
            </button>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
            {publicFeed.map((item) => (
              <div 
                key={item.id} 
                className="card" 
                style={{padding: '0', overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.1s'}}
                onClick={() => loadFromHistory(item, 'feed')}
              >
                <div style={{
                  height: '100px', 
                  background: 'linear-gradient(135deg, #fce7f3 0%, #e0f2fe 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative'
                }}>
                   <div style={{fontSize: '40px', opacity: 0.2}}>🍲</div>
                   
                   <div style={{position: 'absolute', bottom: '10px', left: '15px', display: 'flex', gap: '8px'}}>
                      <div style={{background: 'rgba(255,255,255,0.9)', padding: '4px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'}}>
                        <Clock size={12}/> {formatTime(item.time)}
                      </div>
                      {item.calories && (
                         <div style={{background: 'rgba(255,255,255,0.9)', padding: '4px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', color: '#ea580c'}}>
                           <Flame size={12}/> {formatCalories(item.calories)}
                         </div>
                      )}
                   </div>
                </div>

                <div style={{padding: '20px'}}>
                  <h3 style={{margin: '0 0 10px 0', fontSize: '18px', fontWeight: 700, lineHeight: 1.3}}>{item.title}</h3>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px'}}>
                    <button 
                      onClick={(e) => handlePublicLike(e, item)}
                      style={{
                        background: item.is_liked ? '#fee2e2' : '#f3f4f6',
                        border: 'none',
                        borderRadius: '100px',
                        padding: '8px 16px',
                        display: 'flex', alignItems: 'center', gap: '6px',
                        color: item.is_liked ? '#ef4444' : '#4b5563',
                        fontWeight: 700,
                        fontSize: '14px',
                        transition: 'all 0.2s'
                      }}
                    >
                      <Heart size={18} fill={item.is_liked ? "#ef4444" : "none"} /> 
                      {item.likes_count || 0}
                    </button>

                    <span style={{fontSize: '13px', fontWeight: 600, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '4px'}}>
                      Открыть рецепт <ArrowRight size={14}/>
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {publicFeed.length === 0 && (
              <div style={{textAlign: 'center', padding: '40px', color: '#9ca3af'}}>
                Пока пусто. Станьте первым, кто создаст рецепт! 👨‍🍳
              </div>
            )}
          </div>
        </div>
      )}

      {/* === РЕЦЕПТ ДНЯ (Встроенный ВАУ-дизайн) === */}
      {activeView === 'daily' && (
        <div style={{marginTop: '60px'}}>
          {dailyRecipe ? (
            <div className="card" style={{padding: 0, overflow: 'hidden', border: 'none', boxShadow: '0 20px 50px -10px rgba(249, 115, 22, 0.25)'}}>
              
              {/* Вау-заголовок */}
              <div style={{background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', padding: '40px 20px', color: 'white', textAlign: 'center', position: 'relative'}}>
                 <div style={{fontSize: '60px', marginBottom: '15px', textShadow: '0 10px 20px rgba(0,0,0,0.2)'}}>🔥</div>
                 <div style={{textTransform: 'uppercase', fontSize: '13px', fontWeight: 800, letterSpacing: '2px', opacity: 0.8, marginBottom: '10px'}}>Рецепт дня</div>
                 <h1 style={{fontSize: '30px', fontWeight: 900, margin: '0 0 15px 0', lineHeight: 1.2, textShadow: '0 2px 10px rgba(0,0,0,0.1)'}}>{dailyRecipe.title}</h1>
                 {dailyRecipe.description && <p style={{opacity: 0.95, fontSize: '16px', margin: 0, fontWeight: 500}}>{dailyRecipe.description}</p>}
                 
                 <button 
                    onClick={toggleDailyFavorite}
                    style={{
                      marginTop: '25px',
                      background: 'white',
                      color: dailyFavoriteId ? '#ef4444' : '#ea580c',
                      border: 'none',
                      padding: '12px 25px',
                      borderRadius: '100px',
                      fontWeight: 800,
                      fontSize: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      margin: '25px auto 0 auto',
                      cursor: 'pointer',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                      transition: 'transform 0.2s'
                    }}
                 >
                    <Heart size={22} fill={dailyFavoriteId ? "#ef4444" : "none"} color={dailyFavoriteId ? "#ef4444" : "currentColor"} /> 
                    {dailyFavoriteId ? "В избранном" : "В избранное"}
                 </button>
              </div>
              
              <div style={{padding: '25px'}}>
                  <div className="recipe-tags" style={{justifyContent: 'center', marginBottom: '30px'}}>
                    <div className="tag-badge" style={{fontSize: '15px', padding: '8px 16px'}}><Clock size={18}/> {formatTime(String(dailyRecipe.time))}</div>
                    {dailyRecipe.calories && <div className="tag-badge orange" style={{fontSize: '15px', padding: '8px 16px'}}><Flame size={18}/> {formatCalories(String(dailyRecipe.calories))}</div>}
                  </div>

                  {dailyRecipe.detailed_ingredients && (
                    <div className="ing-box" style={{background: '#fff7ed', border: '1px solid #ffedd5'}}>
                      <h3 style={{marginTop: 0, marginBottom: '15px', color: '#9a3412'}}>Ингредиенты</h3>
                      {dailyRecipe.detailed_ingredients.map((ing, i) => (
                        <div key={i} className="ing-row">
                          <span style={{fontWeight: 600}}>{ing.name}</span> <span className="ing-val" style={{color: '#ea580c'}}>{ing.amount}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <h3 style={{fontSize: '24px', fontWeight: 900, marginBottom: '20px', marginTop: '30px'}}>👨‍🍳 Как приготовить</h3>
                  <div>
                    {dailyRecipe.steps.map((step, i) => (
                      <div key={i} className="step-row">
                        <div className="step-num">{i + 1}</div>
                        <div className="step-text">{cleanText(step)}</div>
                      </div>
                    ))}
                  </div>
              </div>
            </div>
          ) : (
            <div style={{textAlign: 'center', padding: '50px', color: '#6b7280'}}>
               Загружаем рецепт дня... <Sparkles className="animate-spin" style={{display: 'inline', marginLeft: '10px'}} />
            </div>
          )}
          
          <div className="chat-box" style={{marginBottom: '40px'}}>
            <div style={{fontWeight: 800, marginBottom: '20px', color: '#1e40af', fontSize: '18px', textAlign: 'center'}}>
               Задайте вопрос AI шеф-повару!
            </div>
            <div className="chat-layout">
              <input className="chat-input" placeholder="Например: можно ли готовить без лука?" value={question} onChange={(e) => setQuestion(e.target.value)} />
              <button className="chat-btn-center" onClick={handleAskChef}>
                <Send size={18}/> Спросить
              </button>
            </div>
            {answer && <div style={{marginTop: '20px', lineHeight: 1.5, background: 'white', padding: '15px', borderRadius: '16px'}}><strong>Ответ:</strong> {answer}</div>}
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
              <h3 style={{marginTop: 0, color: '#be123c', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '20px', fontWeight: 800}}>
                <span style={{fontSize: '24px'}}>💸</span> Вы теряете 30.000₽
              </h3>
              <p style={{marginBottom: 0, color: '#881337', lineHeight: 1.5}}>Именно столько средняя семья выбрасывает в мусорку ежегодно в виде испорченных продуктов.</p>
            </div>
            <h3 style={{textAlign: 'center', fontSize: '22px', fontWeight: 800, marginBottom: '20px'}}>Почему это работает?</h3>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '40px'}}>
              <div style={{background: '#f8fafc', padding: '20px 15px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0'}}><div style={{background: '#dbeafe', color: '#2563eb', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px auto'}}><Wallet size={20} /></div><div style={{fontWeight: 800, fontSize: '15px', marginBottom: '5px'}}>Экономия</div><div style={{fontSize: '12px', color: '#64748b'}}>До 5000₽ в месяц</div></div>
              <div style={{background: '#f8fafc', padding: '20px 15px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0'}}><div style={{background: '#fef3c7', color: '#d97706', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px auto'}}><Zap size={20} /></div><div style={{fontWeight: 800, fontSize: '15px', marginBottom: '5px'}}>Скорость</div><div style={{fontSize: '12px', color: '#64748b'}}>Мгновенный рецепт</div></div>
              <div style={{background: '#f8fafc', padding: '20px 15px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0'}}><div style={{background: '#dcfce7', color: '#16a34a', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px auto'}}><Leaf size={20} /></div><div style={{fontWeight: 800, fontSize: '15px', marginBottom: '5px'}}>Zero Waste</div><div style={{fontSize: '12px', color: '#64748b'}}>Спасаем еду</div></div>
              <div style={{background: '#f8fafc', padding: '20px 15px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0'}}><div style={{background: '#f3e8ff', color: '#9333ea', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px auto'}}><Globe size={20} /></div><div style={{fontWeight: 800, fontSize: '15px', marginBottom: '5px'}}>Разнообразие</div><div style={{fontSize: '12px', color: '#64748b'}}>Новые блюда</div></div>
            </div>
            <div style={{background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', borderRadius: '24px', padding: '30px 20px', textAlign: 'center', color: 'white', boxShadow: '0 10px 25px rgba(2, 132, 199, 0.4)', position: 'relative', overflow: 'hidden'}}>
              <h3 style={{margin: '0 0 10px 0', fontSize: '22px', fontWeight: 900}}>Telegram канал проекта</h3>
              <p style={{opacity: 0.9, fontSize: '15px', marginBottom: '25px', lineHeight: 1.5}}>Следите за обновлениями, предлагайте идеи и общайтесь напрямую с разработчиком.</p>
              <a href="https://t.me/smartcook2026" target="_blank" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: 'white', color: '#0284c7', textDecoration: 'none', padding: '16px 20px', borderRadius: '100px', fontWeight: 800, fontSize: '16px', boxShadow: '0 5px 15px rgba(0,0,0,0.1)', transition: 'transform 0.2s'}}> <Send size={20} /> Подписаться</a>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}