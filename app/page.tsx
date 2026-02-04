"use client";

import { useState, useEffect, ChangeEvent } from "react";
import { supabase } from "@/lib/supabase"; 

interface AnalysisData {
  ingredients: string[];
  dishes: string[];
}

interface DetailedIngredient {
  name: string;
  amount: string;
}

interface RecipeData {
  id?: number; 
  is_favorite?: boolean; 
  title: string;
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
  session_id: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  
  const [searchMode, setSearchMode] = useState<'photo' | 'text'>('photo');
  const [textQuery, setTextQuery] = useState(""); 

  const [isProcessing, setIsProcessing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false); 
  
  const [analysisResult, setAnalysisResult] = useState<AnalysisData | null>(null);
  const [recipe, setRecipe] = useState<RecipeData | null>(null);
  const [selectedDish, setSelectedDish] = useState<string | null>(null);

  const [feed, setFeed] = useState<DBRecipe[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);
  
  const [filterMode, setFilterMode] = useState<'all' | 'favorites'>('all');

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let storedId = localStorage.getItem("cook_user_id");
    if (!storedId) {
      storedId = "user_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("cook_user_id", storedId);
    }
    setUserId(storedId);
    fetchMyRecipes(storedId); 
  }, []);

  const fetchMyRecipes = async (currentId: string) => {
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .eq('session_id', currentId)
      .order('created_at', { ascending: false });

    if (error) console.error("Ошибка:", error);
    else if (data) setFeed(data);
  };

  const loadFromHistory = (item: DBRecipe) => {
    setAnalysisResult(null);
    setSelectedDish(null);
    setQuestion("");
    setAnswer(null);

    setRecipe({
      id: item.id, 
      is_favorite: item.is_favorite, 
      title: item.title,
      time: item.time,
      calories: item.calories,
      steps: item.steps,
      missing_ingredients: [], 
      ingredients: item.ingredients,
      detailed_ingredients: item.detailed_ingredients
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleFavorite = async (e: any, targetId: number, currentStatus: boolean = false) => {
    e.stopPropagation(); 
    
    const newStatus = !currentStatus;

    // 1. Обновляем в ленте истории
    const updatedFeed = feed.map(r => 
      r.id === targetId ? { ...r, is_favorite: newStatus } : r
    );
    setFeed(updatedFeed);

    // 2. Обновляем в текущем открытом рецепте (если это он)
    if (recipe && recipe.id === targetId) {
      setRecipe({ ...recipe, is_favorite: newStatus });
    }

    // 3. Отправляем в базу
    try {
      await fetch("/api/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: targetId, isFavorite: newStatus }),
      });
    } catch (err) {
      console.error("Не удалось лайкнуть", err);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const originalFile = files[0];
    setAnalysisResult(null);
    setRecipe(null);
    setSelectedDish(null);
    setQuestion("");
    setAnswer(null);
    setIsProcessing(true);

    try {
      const imageCompression = (await import("browser-image-compression")).default;
      const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, fileType: "image/jpeg" };
      const compressedFile = await imageCompression(originalFile, options);
      const finalFile = new File([compressedFile], "processed_image.jpg", { type: "image/jpeg" });

      setFile(finalFile);
      setPreview(URL.createObjectURL(finalFile));
    } catch (error) {
      console.error("Ошибка обработки:", error);
      alert("Не удалось обработать фото.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setAnalyzing(true);
    setRecipe(null);
    setSelectedDish(null);
    setAnswer(null);

    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch("/api/analyze", { method: "POST", body: formData });
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
    if (!analysisResult) return;
    setIsRegenerating(true);
    try {
      const response = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients: analysisResult.ingredients }),
      });
      const json = await response.json();
      if (json.error) throw new Error(json.error);
      setAnalysisResult({ ...analysisResult, dishes: json.dishes });
    } catch (err: any) {
      alert("Ошибка: " + err.message);
    } finally {
      setIsRegenerating(false);
    }
  };

  const getRecipeFromPhoto = async (dishName: string) => {
    if (!analysisResult || !userId) return;
    setSelectedDish(dishName);
    setLoadingRecipe(true);
    setRecipe(null);
    setAnswer(null);
    setQuestion("");

    try {
      const response = await fetch("/api/recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dish: dishName,
          ingredients: analysisResult.ingredients,
          sessionId: userId 
        }),
      });
      const json = await response.json();
      if (json.error) throw new Error(json.error);
      
      setRecipe({ ...json.recipe, ingredients: analysisResult.ingredients });
      fetchMyRecipes(userId); 
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
    setAnswer(null);
    setQuestion("");

    try {
      const response = await fetch("/api/search-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: textQuery,
          sessionId: userId 
        }),
      });
      
      const json = await response.json();
      if (json.error) throw new Error(json.error);
      
      setRecipe({ ...json.recipe, missing_ingredients: [] });
      fetchMyRecipes(userId);

    } catch (err: any) {
      alert("Ошибка: " + err.message);
    } finally {
      setLoadingRecipe(false);
    }
  };

  const handleAskChef = async () => {
    if (!question.trim() || !recipe) return;
    setAsking(true);
    setAnswer(null);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question, recipeContext: recipe }),
      });
      const json = await response.json();
      if (json.error) throw new Error(json.error);
      setAnswer(json.answer);
    } catch (err: any) {
      alert("Ошибка чата: " + err.message);
    } finally {
      setAsking(false);
    }
  };

  const displayedFeed = filterMode === 'all' 
    ? feed 
    : feed.filter(r => r.is_favorite);

  return (
    <div className="container">
      {/* --- ШАПКА БРЕНДА: SMARTCOOK --- */}
      <div style={{
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        marginBottom: '40px',
        marginTop: '20px'
      }}>
        <div style={{
          fontSize: '2.5rem', 
          fontWeight: '900', 
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '10px',
          letterSpacing: '-1px'
        }}>
          SmartCook
        </div>
        
        <div style={{
          display: 'flex', 
          alignItems: 'center', 
          gap: '10px', 
          fontSize: '1.2rem', 
          fontWeight: '600',
          color: '#374151'
        }}>
          <span>🧑‍🍳</span>
          <span>Твой AI Шеф-повар</span>
        </div>

        <p className="subtitle" style={{marginTop: '10px', maxWidth: '400px'}}>
          Загрузи фото продуктов или введи название блюда — я придумаю рецепт.
        </p>
      </div>
      
      <div className="mode-switch">
        <button 
          className={`mode-btn ${searchMode === 'photo' ? 'active' : ''}`}
          onClick={() => setSearchMode('photo')}
        >
          📸 По фото
        </button>
        <button 
          className={`mode-btn ${searchMode === 'text' ? 'active' : ''}`}
          onClick={() => setSearchMode('text')}
        >
          📝 По названию
        </button>
      </div>
      
      <div className="upload-card">
        {searchMode === 'photo' && (
          <>
            <input 
              type="file" 
              accept="image/*,.heic,.HEIC" 
              onChange={handleFileChange} 
            />
            {isProcessing && (
              <p style={{color: '#f59e0b', fontWeight: 'bold', marginTop: '10px'}}>
                📸 Готовлю фото для Шефа...
              </p>
            )}
            {preview && !isProcessing && <img src={preview} alt="Preview" className="preview-image" />}
            
            <button 
              className="btn-primary" 
              onClick={handleAnalyze} 
              disabled={!file || analyzing || isProcessing}
            >
              {analyzing ? "🔍 Изучаю продукты..." : "✨ Найти рецепты"}
            </button>
          </>
        )}

        {searchMode === 'text' && (
          <>
            <input 
              type="text" 
              className="search-input"
              placeholder="Например: Лазанья, Борщ, Тирамису..."
              value={textQuery}
              onChange={(e) => setTextQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTextSearch()}
            />
            <button 
              className="btn-primary" 
              onClick={handleTextSearch} 
              disabled={loadingRecipe || !textQuery.trim()}
            >
              {loadingRecipe ? "🍳 Пишу рецепт..." : "🔍 Найти рецепт"}
            </button>
          </>
        )}
      </div>

      {analysisResult && searchMode === 'photo' && (
        <div style={{ marginTop: "40px", animation: "slideUp 0.5s ease-out" }}>
          <h3 style={{ textAlign: "center", marginBottom: "20px" }}>Я вижу эти продукты:</h3>
          <div className="ingredients-list">
            {analysisResult.ingredients.map((item, idx) => (
              <span key={idx} className="tag">{item}</span>
            ))}
          </div>
          <h3 style={{ textAlign: "center", marginBottom: "20px" }}>Что приготовим?</h3>
          <div className="dishes-grid">
            {analysisResult.dishes.map((dish, idx) => (
              <button
                key={idx}
                onClick={() => getRecipeFromPhoto(dish)}
                disabled={loadingRecipe && selectedDish === dish}
                className={`dish-btn ${selectedDish === dish ? 'active' : ''}`}
              >
                <span>{dish}</span>
                {selectedDish === dish && loadingRecipe && <span>⏳</span>}
                {selectedDish === dish && !loadingRecipe && <span>👉</span>}
              </button>
            ))}
          </div>
          <button 
            className="btn-regenerate" 
            onClick={handleRegenerate}
            disabled={isRegenerating || loadingRecipe}
          >
            {isRegenerating ? "🤔 Думаю..." : "🔄 Придумать другие варианты"}
          </button>
        </div>
      )}

      {recipe && (
        <>
          <div className="recipe-card">
            {/* ЗАГОЛОВОК С КНОПКОЙ ИЗБРАННОГО */}
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', marginBottom: '10px'}}>
              <h2 className="recipe-title" style={{margin: 0}}>{recipe.title}</h2>
              
              {recipe.id && (
                <button 
                  className={`btn-heart ${recipe.is_favorite ? 'active' : 'inactive'}`}
                  onClick={(e) => toggleFavorite(e, recipe.id!, recipe.is_favorite)}
                  title={recipe.is_favorite ? "Убрать из избранного" : "В избранное"}
                  style={{fontSize: '2rem'}}
                >
                  ♥
                </button>
              )}
            </div>
            
            <div className="recipe-meta">
              <span>⏱ {recipe.time}</span>
              {recipe.calories && (
                <span style={{ marginLeft: "15px", color: "#f97316" }}>
                  🔥 {recipe.calories}
                </span>
              )}
            </div>
            
            {recipe.missing_ingredients && recipe.missing_ingredients.length > 0 && (
              <div className="missing-box">
                <strong>🛒 Нужно докупить:</strong> {recipe.missing_ingredients.join(", ")}
              </div>
            )}
            
            {recipe.detailed_ingredients && (
              <div className="ingredients-box">
                <h3 className="ingredients-title">🥗 Ингредиенты:</h3>
                {recipe.detailed_ingredients.map((ing, idx) => (
                  <div key={idx} className="ingredient-row">
                    <span className="ing-name">{ing.name}</span>
                    <span className="ing-amount">{ing.amount}</span>
                  </div>
                ))}
              </div>
            )}
            
            <h3>Как готовить:</h3>
            <ol>
              {recipe.steps.map((step, idx) => (
                <li key={idx} className="step-item">{step}</li>
              ))}
            </ol>
          </div>

          <div className="chat-section">
            <h3 className="chat-title">👨‍🍳 Вопросы Шеф-повару</h3>
            <div className="chat-input-group">
              <input 
                type="text" 
                className="chat-input"
                placeholder="Например: Чем запить?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAskChef()}
              />
              <button 
                className="btn-ask" 
                onClick={handleAskChef}
                disabled={asking || !question.trim()}
              >
                {asking ? "..." : "Спросить"}
              </button>
            </div>
            {answer && (
              <div className="chat-answer-box">
                <strong>Су-шеф:</strong> {answer}
              </div>
            )}
          </div>
        </>
      )}

      {/* ИСТОРИЯ */}
      <div className="feed-section">
        <div className="history-header">
          <h3>📜 Твоя история рецептов</h3>
          
          <div className="filter-tabs">
            <button 
              className={`filter-tab ${filterMode === 'all' ? 'active' : ''}`}
              onClick={() => setFilterMode('all')}
            >
              Все
            </button>
            <button 
              className={`filter-tab ${filterMode === 'favorites' ? 'active' : ''}`}
              onClick={() => setFilterMode('favorites')}
            >
              ❤️ Избранное
            </button>
          </div>

          <button className="btn-toggle" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? "Свернуть ▲" : "Развернуть ▼"}
          </button>
        </div>
        
        {showHistory && (
          <>
             {displayedFeed.length === 0 ? (
              <p style={{textAlign: 'center', color: '#9ca3af', padding: '20px'}}>
                {filterMode === 'favorites' ? "В избранном пока пусто 💔" : "История пуста"}
              </p>
            ) : (
              <div className="feed-grid">
                {displayedFeed.map((item) => (
                  <div key={item.id} className="mini-card" onClick={() => loadFromHistory(item)}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'start'}}>
                      <h4 style={{marginBottom: '5px'}}>{item.title}</h4>
                      
                      <button 
                        className={`btn-heart ${item.is_favorite ? 'active' : 'inactive'}`}
                        onClick={(e) => toggleFavorite(e, item.id, item.is_favorite)}
                      >
                        ♥
                      </button>
                    </div>
                    
                    <div className="mini-info">
                      <span>⏱ {item.time}</span>
                      <span>📅 {new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}