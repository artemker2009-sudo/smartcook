"use client";

import { useState, useEffect, ChangeEvent } from "react";
import { supabase } from "@/lib/supabase"; 
import DailyRecipe from "@/components/DailyRecipe";
import { Menu, X, Flame, Send, Camera, Search, Clock, Heart, ArrowRight, RotateCcw, CheckCircle, Sparkles, Image as ImageIcon } from "lucide-react";

// ВАЖНО: Если будет ошибка "Module not found", напиши в терминале: npm install browser-image-compression
import imageCompression from 'browser-image-compression';

/* --- ТИПЫ ДАННЫХ --- */
interface AnalysisData { ingredients: string[]; dishes: string[]; }
interface DetailedIngredient { name: string; amount: string; }
interface RecipeData { 
  id?: number; is_favorite?: boolean; title: string; time: string; calories?: string; 
  steps: string[]; missing_ingredients?: string[]; ingredients?: string[]; detailed_ingredients?: DetailedIngredient[]; 
}
interface DBRecipe { 
  id: number; title: string; time: string; calories?: string; is_favorite: boolean; 
  created_at: string; steps: string[]; ingredients: string[]; detailed_ingredients?: DetailedIngredient[]; session_id: string; 
}
interface DailyRecipeType { title: string; description: string; time: string; calories: string; ingredients: string[]; steps: string[]; date: string; }

export default function Home() {
  /* --- СОСТОЯНИЕ --- */
  const [activeView, setActiveView] = useState<'service' | 'about' | 'daily'>('service');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [dailyRecipe, setDailyRecipe] = useState<DailyRecipeType | null>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<'photo' | 'text'>('photo');
  const [textQuery, setTextQuery] = useState(""); 
  
  const [isProcessing, setIsProcessing] = useState(false); // Для сжатия фото
  const [analyzing, setAnalyzing] = useState(false);     // Для запроса к AI
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false); 
  
  const [analysisResult, setAnalysisResult] = useState<AnalysisData | null>(null);
  const [recipe, setRecipe] = useState<RecipeData | null>(null);
  const [feed, setFeed] = useState<DBRecipe[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  
  const [showHistory, setShowHistory] = useState(true);
  const [filterMode, setFilterMode] = useState<'all' | 'favorites'>('all');
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  // Очистка текста от нумерации
  const cleanText = (text: string) => text.replace(/^\d+[\.\)]\s*/, '');

  useEffect(() => {
    try {
      let storedId = localStorage.getItem("cook_user_id");
      if (!storedId) { 
        storedId = "user_" + Math.random().toString(36).substr(2, 9); 
        localStorage.setItem("cook_user_id", storedId); 
      }
      setUserId(storedId); fetchMyRecipes(storedId); 
    } catch (e) { console.error(e); }
    fetch('/api/daily').then(res => res.json()).then(data => setDailyRecipe(data)).catch(console.error);
  }, []);

  const fetchMyRecipes = async (currentId: string) => {
    if (!currentId) return;
    const { data } = await supabase.from('recipes').select('*').eq('session_id', currentId).order('created_at', { ascending: false });
    if (data) setFeed(data);
  };

  const toggleFavorite = async (e: any, targetId: number, currentStatus: boolean = false) => {
    e.stopPropagation(); const newStatus = !currentStatus;
    const updatedFeed = feed?.map(r => r.id === targetId ? { ...r, is_favorite: newStatus } : r) || [];
    setFeed(updatedFeed);
    if (recipe && recipe.id === targetId) setRecipe({ ...recipe, is_favorite: newStatus });
    try { await fetch("/api/favorite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: targetId, isFavorite: newStatus }) }); } catch (err) { console.error(err); }
  };

  // --- ЛОГИКА ЗАГРУЗКИ С КОНВЕРТЕРОМ (HEIC -> JPG) ---
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; 
    if (!files || files.length === 0) return;
    
    const rawFile = files[0];
    
    // Сразу показываем превью оригинала (пока сжимаем)
    setPreview(URL.createObjectURL(rawFile));
    setAnalysisResult(null); setRecipe(null); setQuestion(""); setAnswer(null); 
    
    // Включаем индикатор обработки
    setIsProcessing(true);

    try {
      // Опции для сжатия и конвертации
      const options = {
        maxSizeMB: 1,             // Сжимаем до 1 МБ
        maxWidthOrHeight: 1920,   // Уменьшаем размер
        useWebWorker: true,
        fileType: "image/jpeg"    // ПРИНУДИТЕЛЬНО КОНВЕРТИРУЕМ В JPG (Для HEIC)
      };

      const compressedFile = await imageCompression(rawFile, options);
      
      // Создаем новый файл с правильным именем и типом
      const finalFile = new File([compressedFile], "image.jpg", { type: "image/jpeg" });
      
      setFile(finalFile);
      setPreview(URL.createObjectURL(finalFile)); // Обновляем превью на сжатое

    } catch (error) {
      console.error("Ошибка конвертации:", error);
      alert("Не удалось обработать фото. Попробуйте другое.");
      setFile(null); // Сбрасываем, если ошибка
    } finally {
      setIsProcessing(false);
    }
  };

  const triggerFileInput = () => {
    document.getElementById('hidden-file-input')?.click();
  };

  const handleAnalyze = async () => {
    if (!file) return; 
    setAnalyzing(true); 
    setRecipe(null);
    try {
      const formData = new FormData(); 
      formData.append("image", file);
      
      const response = await fetch("/api/analyze", { method: "POST", body: formData });
      
      if (!response.ok) {
        throw new Error(`Ошибка сервера: ${response.status}`);
      }

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
    if (!analysisResult || !userId) return; setLoadingRecipe(true); setRecipe(null);
    try {
      const response = await fetch("/api/recipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dish: dishName, ingredients: analysisResult.ingredients, sessionId: userId }) });
      const json = await response.json(); if (json.error) throw new Error(json.error); setRecipe({ ...json.recipe, ingredients: analysisResult.ingredients }); fetchMyRecipes(userId); 
    } catch (err: any) { alert("Ошибка: " + err.message); } finally { setLoadingRecipe(false); }
  };

  const handleTextSearch = async () => {
    if (!textQuery.trim() || !userId) return; setLoadingRecipe(true); setRecipe(null); setAnalysisResult(null);
    try {
      const response = await fetch("/api/search-recipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: textQuery, sessionId: userId }) });
      const json = await response.json(); if (json.error) throw new Error(json.error); setRecipe({ ...json.recipe, missing_ingredients: [] }); fetchMyRecipes(userId);
    } catch (err: any) { alert("Ошибка: " + err.message); } finally { setLoadingRecipe(false); }
  };

  const handleAskChef = async () => {
    const currentContext = activeView === 'daily' ? dailyRecipe : recipe;
    if (!question.trim() || !currentContext) return;
    setAsking(true); setAnswer(null);
    try {
      const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: question, recipeContext: currentContext }) });
      const json = await response.json(); if (json.error) throw new Error(json.error); setAnswer(json.answer);
    } catch (err: any) { alert("Ошибка: " + err.message); } finally { setAsking(false); }
  };

  const loadFromHistory = (item: DBRecipe) => {
    setAnalysisResult(null); setQuestion(""); setAnswer(null);
    setRecipe({ id: item.id, is_favorite: item.is_favorite, title: item.title, time: item.time, calories: item.calories, steps: item.steps || [], missing_ingredients: [], ingredients: item.ingredients || [], detailed_ingredients: item.detailed_ingredients || [] });
    window.scrollTo({ top: 0, behavior: 'smooth' }); setActiveView('service');
  };

  const displayedFeed = filterMode === 'all' ? feed : feed?.filter(r => r.is_favorite);

  return (
    <div className="container">
      
      <button className="menu-btn" onClick={() => setIsMenuOpen(true)}>
        <Menu size={24} color="#111" />
      </button>

      {/* МЕНЮ ШТОРКА (ФИКСИРОВАННАЯ ШИРИНА) */}
      {isMenuOpen && (
        <>
          <div className="menu-overlay" onClick={() => setIsMenuOpen(false)} />
          <div className={`menu-drawer ${isMenuOpen ? 'open' : ''}`}>
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '40px'}}>
               <span style={{fontSize: '24px', fontWeight: '900', color: '#059669'}}>SmartCook</span>
               <X size={24} onClick={() => setIsMenuOpen(false)} style={{cursor: 'pointer'}} />
            </div>
            <div className="menu-link" onClick={() => {setActiveView('service'); setIsMenuOpen(false)}}><Search size={20}/> Поиск</div>
            <div className="menu-link" onClick={() => {setActiveView('daily'); setIsMenuOpen(false)}}><Flame size={20} color="#f97316"/> Рецепт дня</div>
            <div className="menu-link" onClick={() => {setActiveView('about'); setIsMenuOpen(false)}}><CheckCircle size={20} color="#3b82f6"/> О проекте</div>
          </div>
        </>
      )}

      {/* === СЕРВИС === */}
      {activeView === 'service' && (
        <>
          <div className="hero">
            <div className="brand-name">SmartCook</div>
            <div className="brand-sub">Ваш личный AI Шеф-повар</div>
          </div>

          <div className="daily-teaser" onClick={() => setActiveView('daily')}>
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
                    <input id="hidden-file-input" type="file" accept="image/*,.heic,.HEIC" className="upload-input" onChange={handleFileChange} />
                    <Camera size={48} color="#059669" style={{marginBottom: '15px'}} />
                    <div style={{fontWeight: '700', fontSize: '18px', color: '#374151', marginBottom: '5px'}}>Выберите фото</div>
                    <div style={{fontSize: '14px', color: '#9ca3af'}}>HEIC, JPG, PNG</div>
                  </div>
                ) : (
                  <div className="upload-compact">
                    {preview && <img src={preview} className="preview-img" alt="Preview" />}
                    
                    {/* Скрытый инпут для замены */}
                    <input id="hidden-file-input" type="file" accept="image/*,.heic,.HEIC" style={{display: 'none'}} onChange={handleFileChange} />
                    
                    <button className="btn-replace" onClick={triggerFileInput}>
                      <RotateCcw size={16} /> Заменить фото
                    </button>
                  </div>
                )}

                <button className="btn-primary" onClick={handleAnalyze} disabled={!file || analyzing || isProcessing}>
                  {isProcessing ? "🔄 Обработка фото..." : analyzing ? "🔍 Изучаю продукты..." : "✨ Найти рецепт"}
                </button>
              </>
            ) : (
              <>
                <input type="text" className="upload-zone" style={{width: '90%', padding: '20px', textAlign: 'left', border: '2px solid #e5e7eb', cursor: 'text', fontSize: '18px'}} 
                       placeholder="Например: Паста" value={textQuery} onChange={(e) => setTextQuery(e.target.value)} />
                <button className="btn-primary" onClick={handleTextSearch} disabled={loadingRecipe || !textQuery.trim()}>
                  {loadingRecipe ? "🍳 Готовлю..." : "🔍 Найти"}
                </button>
              </>
            )}
          </div>

          {/* Результаты анализа */}
          {analysisResult && (
            <div className="card">
              <h3 style={{textAlign: 'center', marginBottom: '20px'}}>Я вижу продукты:</h3>
              <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginBottom: '25px'}}>
                {analysisResult.ingredients.map((ing, i) => <span key={i} style={{background: '#d1fae5', color: '#065f46', padding: '6px 12px', borderRadius: '100px', fontSize: '14px', fontWeight: 600}}>{ing}</span>)}
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                {analysisResult.dishes.map((dish, i) => (
                  <button key={i} onClick={() => getRecipeFromPhoto(dish)} className="btn-secondary" style={{textAlign: 'left', display: 'flex', justifyContent: 'space-between'}}>
                    {dish} {loadingRecipe && <Sparkles className="animate-spin"/>}
                  </button>
                ))}
              </div>
              <button className="btn-secondary" onClick={handleRegenerate} style={{marginTop: '20px', color: '#6b7280'}}>🔄 Другие варианты</button>
            </div>
          )}

          {/* РЕЦЕПТ */}
          {recipe && (
            <div className="card">
              <div className="recipe-header">
                <h2 className="recipe-title">{recipe.title}</h2>
                <div onClick={(e) => toggleFavorite(e, recipe.id!, recipe.is_favorite)} style={{cursor: 'pointer'}}>
                  <Heart size={32} 
                    className={recipe.is_favorite ? "fill-red-500 text-red-500" : "text-gray-300"} 
                    color={recipe.is_favorite ? "#ef4444" : "#d1d5db"} 
                    fill={recipe.is_favorite ? "#ef4444" : "none"}
                  />
                </div>
              </div>

              <div className="recipe-tags">
                <div className="tag-badge"><Clock size={16}/> {recipe.time}</div>
                {recipe.calories && <div className="tag-badge orange"><Flame size={16}/> {recipe.calories}</div>}
              </div>

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
                <div style={{fontWeight: 700, marginBottom: '10px', color: '#1e40af'}}>Есть вопрос шефу?</div>
                <div className="chat-input-row">
                  <input className="chat-input" placeholder="Спросить..." value={question} onChange={(e) => setQuestion(e.target.value)} />
                  <button className="chat-btn" onClick={handleAskChef}><Send size={20}/></button>
                </div>
                {answer && <div style={{marginTop: '15px', lineHeight: 1.5}}><strong>Ответ:</strong> {answer}</div>}
              </div>
            </div>
          )}

          <div className="history-bar">
            <span className="history-title">📜 История рецептов</span>
            <div className="history-filters">
              <button className={`filter-pill ${filterMode === 'all' ? 'active' : ''}`} onClick={() => setFilterMode('all')}>Все</button>
              <button className={`filter-pill ${filterMode === 'favorites' ? 'active' : ''}`} onClick={() => setFilterMode('favorites')}>❤️ Избранное</button>
            </div>
          </div>
          
          {displayedFeed?.length === 0 && filterMode === 'favorites' ? (
             <div className="empty-msg">В избранном пока пусто 💔<br/>Добавьте рецепты лайком!</div>
          ) : (
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px'}}>
              {displayedFeed?.map((item) => (
                <div key={item.id} className="card" style={{padding: '15px', cursor: 'pointer', marginBottom: 0}} onClick={() => loadFromHistory(item)}>
                  <div style={{fontWeight: 700, fontSize: '15px', marginBottom: '5px', lineHeight: 1.2}}>{item.title}</div>
                  <div style={{fontSize: '12px', color: '#9ca3af'}}>{item.time}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* === ДРУГИЕ СТРАНИЦЫ === */}
      {activeView === 'daily' && <div style={{marginTop: '60px'}}><DailyRecipe data={dailyRecipe} /></div>}
      {activeView === 'about' && (
        <div className="card" style={{textAlign: 'center', marginTop: '60px'}}>
          <h1>О проекте</h1>
          <p>SmartCook помогает экономить продукты и деньги.</p>
          <a href="https://t.me/smartcook2026" className="btn-primary" style={{display: 'block', textDecoration: 'none'}}>Telegram</a>
        </div>
      )}

    </div>
  );
}