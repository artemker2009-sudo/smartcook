"use client";

import React from "react";
import {
  Flame,
  ArrowRight,
  Camera,
  Search,
  RotateCcw,
  Settings,
  Lock,
  ShoppingBag,
  Sparkles,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Clock,
  Heart,
  X,
} from "lucide-react";
import RecipeView from "@/components/RecipeView";

interface ServiceViewProps {
  isHistoryView: boolean;
  fromFeed: "recipes" | "photos" | "profile_history" | "profile_favorites" | false;
  isSharedView: boolean;
  currentHoliday: any;
  switchView: (view: "service" | "about" | "daily" | "feed" | "profile" | "game") => void;
  dailyRecipe: any;
  searchMode: "photo" | "text";
  setSearchMode: (mode: "photo" | "text") => void;
  setIsPreferencesModalOpen: (open: boolean) => void;
  file: File | null;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  preview: string | null;
  triggerFileInput: () => void;
  cookingMode: "strict" | "extended";
  setCookingMode: (mode: "strict" | "extended") => void;
  handleAnalyze: () => void;
  analyzing: boolean;
  isProcessing: boolean;
  textQuery: string;
  setTextQuery: (v: string) => void;
  handleTextSearch: () => void;
  loadingRecipe: boolean;
  analysisResult: any;
  getRecipeFromPhoto: (dishName: string) => void;
  selectedDish: string | null;
  handleRegenerate: () => void;
  isRegenerating: boolean;
  recipe: any;
  handleBackToSearch: () => void;
  handleBackToSource: () => void;
  handleShareRecipe: () => void;
  toggleFavorite: (e: any, id: number, isFavorite?: boolean) => void;
  handleSmartVariant: () => void;
  formatTime: (t: string) => string;
  formatCalories: (c?: string) => string;
  scaleAmount: (amount: string, multiplier: number) => string;
  cleanText: (text: any) => string;
  actualServings: number;
  servings: number | "";
  setServings: React.Dispatch<React.SetStateAction<number | "">>;
  question: string;
  setQuestion: (v: string) => void;
  handleAskChef: () => void;
  asking: boolean;
  answer: string | null;
  user: any;
  setIsAuthModalOpen: (v: boolean) => void;
  userPhotoFile: File | null;
  userPhotoPreview: string | null;
  userComment: string;
  setUserComment: (v: string) => void;
  handleUserPhotoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  submitFeedPost: (ctx: any) => void;
  isUploadingPhoto: boolean;
  setIsStandaloneUploadOpen: (v: boolean) => void;
  setUserPhotoFile: (v: File | null) => void;
  setUserPhotoPreview: (v: string | null) => void;
  historyExpanded: boolean;
  setHistoryExpanded: (v: boolean) => void;
  filterMode: "all" | "favorites";
  setFilterMode: (mode: "all" | "favorites") => void;
  displayedFeed: any[] | undefined;
  visibleHistory: any[] | undefined;
  loadFromHistory: (item: any, source?: any) => void;
}

export default function ServiceView({
  isHistoryView,
  fromFeed,
  isSharedView,
  currentHoliday,
  switchView,
  dailyRecipe,
  searchMode,
  setSearchMode,
  setIsPreferencesModalOpen,
  file,
  handleFileChange,
  preview,
  triggerFileInput,
  cookingMode,
  setCookingMode,
  handleAnalyze,
  analyzing,
  isProcessing,
  textQuery,
  setTextQuery,
  handleTextSearch,
  loadingRecipe,
  analysisResult,
  getRecipeFromPhoto,
  selectedDish,
  handleRegenerate,
  isRegenerating,
  recipe,
  handleBackToSearch,
  handleBackToSource,
  handleShareRecipe,
  toggleFavorite,
  handleSmartVariant,
  formatTime,
  formatCalories,
  scaleAmount,
  cleanText,
  actualServings,
  servings,
  setServings,
  question,
  setQuestion,
  handleAskChef,
  asking,
  answer,
  user,
  setIsAuthModalOpen,
  userPhotoFile,
  userPhotoPreview,
  userComment,
  setUserComment,
  handleUserPhotoChange,
  submitFeedPost,
  isUploadingPhoto,
  setIsStandaloneUploadOpen,
  setUserPhotoFile,
  setUserPhotoPreview,
  historyExpanded,
  setHistoryExpanded,
  filterMode,
  setFilterMode,
  displayedFeed,
  visibleHistory,
  loadFromHistory,
}: ServiceViewProps) {
  return (
    <>
      {!isHistoryView && fromFeed === false && !isSharedView && (
        <>
          <div className="hero">
            <h1 className="brand-name">SmartCook</h1>
            <div className="brand-sub">Ваш личный AI Шеф-повар</div>
            {currentHoliday && (
              <div
                className="animate-fade-in"
                style={{
                  background: currentHoliday.gradient,
                  color: "white",
                  padding: "20px",
                  borderRadius: "20px",
                  marginTop: "25px",
                  textAlign: "center",
                  boxShadow: "0 10px 30px -10px rgba(0,0,0,0.3)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "-10px",
                    right: "-10px",
                    width: "60px",
                    height: "60px",
                    background: "white",
                    opacity: 0.1,
                    borderRadius: "50%",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: "-20px",
                    left: "-10px",
                    width: "80px",
                    height: "80px",
                    background: "white",
                    opacity: 0.1,
                    borderRadius: "50%",
                  }}
                />
                <div
                  style={{
                    fontSize: "22px",
                    marginBottom: "8px",
                    fontWeight: "700",
                    fontFamily: '"Times New Roman", serif',
                    fontStyle: "italic",
                  }}
                >
                  {currentHoliday.icon} {currentHoliday.title}
                </div>
                <div
                  style={{
                    fontSize: "15px",
                    lineHeight: "1.5",
                    opacity: 0.95,
                    fontWeight: "500",
                  }}
                >
                  {currentHoliday.text}
                </div>
              </div>
            )}
          </div>

          <div className="daily-teaser" onClick={() => switchView("daily")}>
            <div
              style={{
                background: "#fff7ed",
                padding: "12px",
                borderRadius: "12px",
              }}
            >
              <Flame color="#f97316" size={24} />
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: "bold",
                  color: "#f97316",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                🔥 Рецепт дня
              </div>
              <div style={{ fontWeight: "800", fontSize: "18px" }}>
                {dailyRecipe ? dailyRecipe.title : "Секрет от шефа..."}
              </div>
            </div>
            <ArrowRight size={20} color="#cbd5e1" />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "15px",
            }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                background: "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)",
                padding: "6px",
                borderRadius: "20px",
                boxShadow: "inset 0 2px 4px rgba(0,0,0,0.05)",
              }}
            >
              <button
                onClick={() => setSearchMode("photo")}
                style={{
                  flex: 1,
                  padding: "8px 5px",
                  borderRadius: "16px",
                  border: "none",
                  background: searchMode === "photo" ? "white" : "transparent",
                  fontWeight: 800,
                  fontSize: "15px",
                  boxShadow:
                    searchMode === "photo"
                      ? "0 4px 15px rgba(0,0,0,0.05)"
                      : "none",
                  color: searchMode === "photo" ? "#111" : "#64748b",
                  transition:
                    "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    background:
                      searchMode === "photo" ? "#dcfce7" : "#f1f5f9",
                    color:
                      searchMode === "photo" ? "#10b981" : "#94a3b8",
                    width: "32px",
                    height: "32px",
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.3s",
                    flexShrink: 0,
                  }}
                >
                  <Camera size={18} />
                </div>
                По фото
              </button>
              <button
                onClick={() => setSearchMode("text")}
                style={{
                  flex: 1,
                  padding: "8px 5px",
                  borderRadius: "16px",
                  border: "none",
                  background: searchMode === "text" ? "white" : "transparent",
                  fontWeight: 800,
                  fontSize: "15px",
                  boxShadow:
                    searchMode === "text"
                      ? "0 4px 15px rgba(0,0,0,0.05)"
                      : "none",
                  color: searchMode === "text" ? "#111" : "#64748b",
                  transition:
                    "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    background:
                      searchMode === "text" ? "#e0f2fe" : "#f1f5f9",
                    color:
                      searchMode === "text" ? "#0ea5e9" : "#94a3b8",
                    width: "32px",
                    height: "32px",
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.3s",
                    flexShrink: 0,
                  }}
                >
                  <Search size={18} />
                </div>
                По названию
              </button>
            </div>

            <button
              onClick={() => setIsPreferencesModalOpen(true)}
              style={{
                background: "white",
                border: "1px solid #e2e8f0",
                borderRadius: "20px",
                height: "52px",
                width: "52px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
                color: "#475569",
                flexShrink: 0,
              }}
            >
              <Settings size={22} />
            </button>
          </div>

          <div className="card">
            {searchMode === "photo" ? (
              <>
                {!file ? (
                  <div className="upload-zone">
                    <input
                      id="hidden-file-input"
                      type="file"
                      accept="image/png, image/jpeg, image/jpg, .heic, .HEIC"
                      className="upload-input"
                      onChange={handleFileChange}
                    />
                    <div className="flex flex-col items-center justify-center text-center w-full">
                      <Camera
                        size={48}
                        color="#059669"
                        className="mx-auto mb-3"
                      />
                      <div
                        style={{
                          fontWeight: "700",
                          fontSize: "18px",
                          color: "#374151",
                          marginBottom: "5px",
                        }}
                      >
                        Выберите фото
                      </div>
                      <div
                        style={{
                          fontSize: "14px",
                          color: "#9ca3af",
                        }}
                      >
                        HEIC, JPG, PNG
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="upload-compact">
                    {preview && (
                      <img
                        src={preview}
                        className="preview-img"
                        alt="Preview"
                      />
                    )}
                    <input
                      id="hidden-file-input"
                      type="file"
                      accept="image/png, image/jpeg, image/jpg, .heic, .HEIC"
                      style={{ display: "none" }}
                      onChange={handleFileChange}
                    />
                    <button
                      className="btn-replace"
                      onClick={triggerFileInput}
                    >
                      <RotateCcw size={16} /> Заменить фото
                    </button>
                  </div>
                )}

                {file && (
                  <div className="mode-toggle-container">
                    <button
                      className={`mode-btn ${
                        cookingMode === "strict" ? "active" : ""
                      }`}
                      onClick={() => setCookingMode("strict")}
                    >
                      <Lock size={16} /> Строго из этого
                    </button>
                    <button
                      className={`mode-btn ${
                        cookingMode === "extended" ? "active" : ""
                      }`}
                      onClick={() => setCookingMode("extended")}
                    >
                      <ShoppingBag size={16} /> Могу докупить
                    </button>
                  </div>
                )}

                <button
                  className="btn-primary"
                  onClick={handleAnalyze}
                  disabled={!file || analyzing || isProcessing}
                >
                  {isProcessing
                    ? "🔄 Обработка фото..."
                    : analyzing
                    ? "🔍 Изучаю продукты..."
                    : "✨ Найти рецепт"}
                </button>
              </>
            ) : (
              <>
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    marginBottom: "15px",
                  }}
                >
                  <input
                    type="text"
                    className="text-search-input"
                    placeholder="Например: Паста Карбонара"
                    value={textQuery}
                    onChange={(e) => setTextQuery(e.target.value)}
                    style={{
                      paddingRight: textQuery ? "40px" : "15px",
                      marginBottom: 0,
                      boxSizing: "border-box",
                    }}
                  />
                  {textQuery && (
                    <button
                      onClick={() => setTextQuery("")}
                      style={{
                        position: "absolute",
                        right: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "transparent",
                        border: "none",
                        padding: "4px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#9ca3af",
                      }}
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
                <button
                  className="btn-primary"
                  onClick={handleTextSearch}
                  disabled={loadingRecipe || !textQuery.trim()}
                >
                  {loadingRecipe ? "🍳 Готовлю..." : "🔍 Найти рецепт"}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {analysisResult && !isSharedView && !isHistoryView && (
        <div className="card">
          <h3 style={{ textAlign: "center", marginBottom: "20px" }}>
            Я вижу продукты:
          </h3>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              justifyContent: "center",
              marginBottom: "25px",
            }}
          >
            {analysisResult.ingredients?.map((ing: string, i: number) => (
              <span
                key={i}
                style={{
                  background: "#d1fae5",
                  color: "#065f46",
                  padding: "6px 12px",
                  borderRadius: "100px",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                {ing}
              </span>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {analysisResult.dishes?.map((dish: string, i: number) => (
              <button
                key={i}
                onClick={() => getRecipeFromPhoto(dish)}
                className="btn-secondary"
                disabled={loadingRecipe}
                style={{
                  opacity:
                    loadingRecipe && selectedDish !== dish ? 0.5 : 1,
                  borderColor:
                    selectedDish === dish ? "#f97316" : "#e5e7eb",
                  background:
                    selectedDish === dish ? "#fff7ed" : "white",
                }}
              >
                <span>{dish}</span>
                {loadingRecipe && selectedDish === dish ? (
                  <Sparkles
                    className="animate-spin"
                    size={24}
                    color="#f97316"
                  />
                ) : (
                  <ChevronRight color="#d1d5db" />
                )}
              </button>
            ))}
          </div>
          <button
            className="btn-magic"
            onClick={handleRegenerate}
            disabled={isRegenerating || loadingRecipe}
          >
            <Sparkles size={20} />{" "}
            {isRegenerating
              ? "Включаю фантазию..."
              : "✨ Хочу что-то необычное"}
          </button>
        </div>
      )}

      {recipe && (
        <RecipeView
          recipe={recipe}
          isSharedView={isSharedView}
          fromFeed={fromFeed}
          isHistoryView={isHistoryView}
          handleBackToSearch={handleBackToSearch}
          handleBackToSource={handleBackToSource}
          handleShareRecipe={handleShareRecipe}
          toggleFavorite={toggleFavorite}
          analysisResult={analysisResult}
          searchMode={searchMode}
          handleSmartVariant={handleSmartVariant}
          loadingRecipe={loadingRecipe}
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
        />
      )}

      {!isHistoryView && !fromFeed && !isSharedView && (
        <>
          <div className="history-bar" style={{ marginTop: "40px" }}>
            <span className="history-title">📜 История рецептов</span>
            <div className="history-filters">
              <button
                className={`filter-pill ${
                  filterMode === "all" ? "active" : ""
                }`}
                onClick={() => setFilterMode("all")}
              >
                Все
              </button>
              <button
                className={`filter-pill ${
                  filterMode === "favorites" ? "active" : ""
                }`}
                onClick={() => setFilterMode("favorites")}
              >
                ❤️ Избранное
              </button>
            </div>
          </div>

          {historyExpanded && displayedFeed && displayedFeed.length > 4 && (
            <button
              className="btn-expand-history"
              onClick={() => setHistoryExpanded(false)}
              style={{ marginTop: "0", marginBottom: "15px" }}
            >
              Свернуть историю <ChevronUp size={16} />
            </button>
          )}

          {displayedFeed?.length === 0 && filterMode === "favorites" ? (
            <div className="empty-msg">
              В избранном пока пусто 💔
              <br />
              Добавьте рецепты лайком!
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "15px",
                  marginBottom: "10px",
                }}
              >
                {visibleHistory?.map((item: any) => (
                  <div
                    key={item.id}
                    className="card"
                    style={{
                      padding: "15px",
                      cursor: "pointer",
                      marginBottom: 0,
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      border: "1px solid #e5e7eb",
                      position: "relative",
                      overflow: "hidden",
                      background: item.is_favorite ? "#fff5f5" : "white",
                    }}
                    onClick={() => loadFromHistory(item, "history")}
                  >
                    {item.is_favorite && (
                      <div
                        style={{
                          position: "absolute",
                          top: "10px",
                          right: "10px",
                          color: "#ef4444",
                        }}
                      >
                        <Heart
                          size={18}
                          className="fill-red-500"
                          fill="#ef4444"
                        />
                      </div>
                    )}
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "14px",
                        marginBottom: "8px",
                        lineHeight: 1.3,
                        height: "38px",
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        wordBreak: "break-word",
                        position: "relative",
                        paddingRight: item.is_favorite ? "22px" : 0,
                      }}
                    >
                      {item.title}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "11px",
                        color: "#6b7280",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "3px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <Clock size={12} /> {formatTime(item.time)}
                      </div>
                      {item.calories && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "3px",
                            color: "#f97316",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <Flame size={12} />{" "}
                          {formatCalories(item.calories)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {!historyExpanded && displayedFeed && displayedFeed.length > 4 && (
                <button
                  className="btn-expand-history"
                  onClick={() => setHistoryExpanded(true)}
                >
                  Показать еще ({displayedFeed.length - 4}){" "}
                  <ChevronDown size={16} />
                </button>
              )}
            </>
          )}
        </>
      )}

    </>
  );
}

