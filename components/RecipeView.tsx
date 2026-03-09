"use client";

import React from "react";
import {
  Search,
  ArrowLeft,
  Share2,
  Heart,
  Flame,
  Clock,
  ShoppingCart,
  ExternalLink,
  Info,
  Sparkles,
  Shuffle,
  ChevronRight,
  Send,
  Camera,
  X,
} from "lucide-react";

interface RecipeViewProps {
  recipe: any;
  isSharedView: boolean;
  fromFeed: "recipes" | "photos" | "profile_history" | "profile_favorites" | false;
  isHistoryView: boolean;
  handleBackToSearch: () => void;
  handleBackToSource: () => void;
  handleShareRecipe: () => void;
  toggleFavorite: (e: any, id: number, isFavorite?: boolean) => void;
  analysisResult: any;
  searchMode: "photo" | "text";
  handleSmartVariant: () => void;
  loadingRecipe: boolean;
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
  handleUserPhotoChange: (e: any) => void;
  submitFeedPost: (currentRecipeContext: any) => void;
  isUploadingPhoto: boolean;
  setIsStandaloneUploadOpen: (v: boolean) => void;
  setUserPhotoFile: (v: File | null) => void;
  setUserPhotoPreview: (v: string | null) => void;
}

export default function RecipeView({
  recipe,
  isSharedView,
  fromFeed,
  isHistoryView,
  handleBackToSearch,
  handleBackToSource,
  handleShareRecipe,
  toggleFavorite,
  analysisResult,
  searchMode,
  handleSmartVariant,
  loadingRecipe,
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
}: RecipeViewProps) {
  const itemsToBuy = (() => {
    const baseItems =
      fromFeed && recipe.detailed_ingredients
        ? recipe.detailed_ingredients.map((ing: any) => ing.name)
        : recipe.missing_ingredients || [];
    return baseItems || [];
  })();

  const showSmartVariant =
    !fromFeed &&
    !isSharedView &&
    !isHistoryView &&
    (analysisResult || (searchMode === "text" && recipe));

  return (
    <div
      className="card"
      style={{
        position: "relative",
        overflow: "visible",
        marginTop: isSharedView || fromFeed || isHistoryView ? "60px" : "20px",
      }}
    >
      {isSharedView && (
        <button
          onClick={handleBackToSearch}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "100px",
            padding: "8px 16px",
            color: "#374151",
            fontSize: "14px",
            fontWeight: 600,
            marginBottom: "20px",
            cursor: "pointer",
            boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
            transition: "all 0.2s",
          }}
        >
          <Search size={18} color="#059669" /> К поиску
        </button>
      )}

      {(fromFeed !== false || isHistoryView) && !isSharedView && (
        <button
          onClick={fromFeed ? handleBackToSource : handleBackToSearch}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "100px",
            padding: "8px 16px",
            color: "#374151",
            fontSize: "14px",
            fontWeight: 600,
            marginBottom: "20px",
            cursor: "pointer",
            boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
            transition: "all 0.2s",
          }}
        >
          <ArrowLeft size={18} />
          {fromFeed === "photos"
            ? "Назад к ленте"
            : fromFeed === "profile_history"
            ? "Назад в историю"
            : fromFeed === "profile_favorites"
            ? "Назад в избранное"
            : "Назад к истории"}
        </button>
      )}

      <div
        className="recipe-header"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: "15px" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            width: "100%",
            alignItems: "flex-start",
            gap: "10px",
          }}
        >
          <h2
            className="recipe-title"
            style={{
              marginBottom: 0,
              fontSize: "24px",
              flex: 1,
              wordBreak: "break-word",
              lineHeight: 1.2,
            }}
          >
            {recipe.title}
          </h2>
          <div
            style={{
              display: "flex",
              gap: "15px",
              alignItems: "center",
              flexShrink: 0,
              marginTop: "2px",
            }}
          >
            <div
              onClick={handleShareRecipe}
              style={{ cursor: "pointer", display: "flex" }}
            >
              <Share2
                size={30}
                color="#d1d5db"
                style={{ transition: "color 0.2s" }}
              />
            </div>
            <div
              onClick={(e) => toggleFavorite(e, recipe.id!, recipe.is_favorite)}
              style={{ cursor: "pointer" }}
            >
              <Heart
                size={30}
                className={recipe.is_favorite ? "fill-red-500 text-red-500" : "text-gray-300"}
                color={recipe.is_favorite ? "#ef4444" : "#d1d5db"}
                fill={recipe.is_favorite ? "#ef4444" : "none"}
              />
            </div>
          </div>
        </div>

        {recipe.description && (
          <p
            style={{
              fontSize: "15px",
              color: "#4b5563",
              lineHeight: "1.5",
              margin: "5px 0 15px 0",
            }}
          >
            {recipe.description}
          </p>
        )}

        {showSmartVariant && (
          <button
            onClick={handleSmartVariant}
            disabled={loadingRecipe}
            className="btn-smart-variant"
          >
            {loadingRecipe ? (
              <Sparkles className="animate-spin" size={24} color="#f97316" />
            ) : (
              <Shuffle size={20} color="#f97316" />
            )}
            <span style={{ flex: 1, textAlign: "left" }}>
              {loadingRecipe ? "Ищем идеи..." : "Подобрать другой рецепт"}
            </span>
            <ChevronRight size={18} color="#9ca3af" />
          </button>
        )}
      </div>

      <div className="recipe-tags" style={{ marginTop: "15px", marginBottom: "15px" }}>
        <div className="tag-badge">
          <Clock size={16} /> {formatTime(recipe.time)}
        </div>
        {recipe.calories && (
          <div className="tag-badge orange">
            <Flame size={16} /> {formatCalories(recipe.calories)}
          </div>
        )}
      </div>

      {recipe.estimated_cost !== undefined && (() => {
        const totalCost = (recipe.estimated_cost || 0) * actualServings;
        const deliveryCost = 800 * actualServings;
        const savings = deliveryCost - totalCost;
        const tier = recipe.budget_tier || 2;
        const tierConfig = {
          1: { label: "Почти бесплатно", bg: "linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)", border: "#86efac", color: "#166534", icon: "🤑" },
          2: { label: "Экономно", bg: "linear-gradient(135deg, #fef9c3 0%, #fde68a 100%)", border: "#fcd34d", color: "#854d0e", icon: "💰" },
          3: { label: "Ресторан дома", bg: "linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)", border: "#fdba74", color: "#9a3412", icon: "👨‍🍳" },
        }[tier as 1 | 2 | 3] || { label: "Экономно", bg: "linear-gradient(135deg, #fef9c3 0%, #fde68a 100%)", border: "#fcd34d", color: "#854d0e", icon: "💰" };

        return (
          <div style={{
            background: tierConfig.bg,
            border: `1px solid ${tierConfig.border}`,
            borderRadius: "24px",
            padding: "16px 20px",
            marginBottom: "20px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span style={{ fontSize: "24px" }}>{tierConfig.icon}</span>
              <span style={{
                fontSize: "13px",
                fontWeight: 800,
                background: `${tierConfig.border}80`,
                color: tierConfig.color,
                padding: "4px 12px",
                borderRadius: "100px",
              }}>
                {tierConfig.label}
              </span>
            </div>
            {totalCost === 0 ? (
              <div style={{ fontSize: "16px", fontWeight: 800, color: tierConfig.color, lineHeight: 1.4 }}>
                Ужин за 0 рублей! Полная экономия 🎉
              </div>
            ) : (
              <>
                <div style={{ fontSize: "16px", fontWeight: 800, color: tierConfig.color, lineHeight: 1.4 }}>
                  Стоимость{actualServings > 1 ? ` (${actualServings} порц.)` : ""}: ~{totalCost} руб.
                </div>
                {savings > 0 && (
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#059669", marginTop: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                    Экономия vs доставка: {savings} руб.
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {recipe.detailed_ingredients && recipe.detailed_ingredients.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "20px",
            background: "#f9fafb",
            padding: "10px 15px",
            borderRadius: "12px",
            width: "fit-content",
          }}
        >
          <span
            style={{
              fontWeight: 700,
              color: "#374151",
              fontSize: "15px",
            }}
          >
            🍽 Порции:
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "white",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            <button
              onClick={() =>
                setServings((prev) =>
                  typeof prev === "number" && prev > 1 ? prev - 1 : 1
                )
              }
              disabled={servings === 1 || servings === ""}
              style={{
                padding: "6px 12px",
                background: "transparent",
                border: "none",
                fontSize: "18px",
                color:
                  servings === 1 || servings === "" ? "#d1d5db" : "#374151",
                cursor:
                  servings === 1 || servings === "" ? "default" : "pointer",
                fontWeight: 600,
              }}
            >
              -
            </button>
            <input
              type="number"
              value={servings}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "") setServings("");
                else {
                  const num = parseInt(val);
                  if (!isNaN(num) && num > 0 && num <= 100) setServings(num);
                }
              }}
              onBlur={() => {
                if (servings === "") setServings(1);
              }}
              style={{
                width: "40px",
                textAlign: "center",
                border: "none",
                borderLeft: "1px solid #d1d5db",
                borderRight: "1px solid #d1d5db",
                padding: "6px 0",
                fontSize: "16px",
                fontWeight: 700,
                color: "#111",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={() =>
                setServings((prev) =>
                  typeof prev === "number" ? prev + 1 : 2
                )
              }
              style={{
                padding: "6px 12px",
                background: "transparent",
                border: "none",
                fontSize: "18px",
                color: "#374151",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              +
            </button>
          </div>
        </div>
      )}

      {itemsToBuy.length > 0 && (
        <div
          style={{
            background: "#fffbeb",
            border: "1px solid #fcd34d",
            borderRadius: "12px",
            padding: "15px",
            margin: "20px 0",
            color: "#92400e",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "8px",
              fontWeight: 800,
            }}
          >
            <ShoppingCart size={20} />{" "}
            {searchMode === "text" || fromFeed || isSharedView
              ? "Нужно купить:"
              : "Нужно докупить:"}
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "10px",
            }}
          >
            {itemsToBuy.map((item: string, idx: number) => (
              <a
                key={idx}
                href={`https://www.ozon.ru/search/?text=${encodeURIComponent(
                  item
                )}&from_global=true`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: "#fef3c7",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  textDecoration: "none",
                  color: "#92400e",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  border: "1px solid #fcd34d",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {item} <ExternalLink size={12} style={{ opacity: 0.6 }} />
              </a>
            ))}
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "#b45309",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <Info size={14} /> Нажмите на ингредиент, чтобы заказать быструю
            доставку Ozon Fresh до двери
          </div>
        </div>
      )}

      {recipe.detailed_ingredients && (
        <div className="ing-box">
          <h3 style={{ marginTop: 0, marginBottom: "15px" }}>Ингредиенты</h3>
          {recipe.detailed_ingredients.map((ing: any, i: number) => (
            <div key={i} className="ing-row">
              <span>{ing.name}</span>
              <span className="ing-val">
                {scaleAmount(ing.amount, actualServings)}
              </span>
            </div>
          ))}
        </div>
      )}

      <h3
        style={{
          fontSize: "22px",
          fontWeight: 800,
          marginBottom: "20px",
        }}
      >
        👨‍🍳 Рецепт приготовления
      </h3>
      <div>
        {recipe.steps?.map((step: string, i: number) => (
          <div key={i} className="step-row">
            <div className="step-num">{i + 1}</div>
            <div className="step-text">{cleanText(step)}</div>
          </div>
        ))}
      </div>

      <div
        className="chat-box"
        style={{
          marginTop: "30px",
          background: "#e0f2fe",
          padding: "20px",
          borderRadius: "24px",
          border: "2px solid #93c5fd",
        }}
      >
        <div
          style={{
            fontWeight: 800,
            marginBottom: "20px",
            color: "#0369a1",
            fontSize: "18px",
            textAlign: "center",
          }}
        >
          Задайте вопрос AI шеф-повару!
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "15px",
            alignItems: "flex-start",
            width: "100%",
          }}
        >
          <div
            style={{
              fontWeight: 800,
              fontSize: "15px",
              color: "#0284c7",
              paddingLeft: "5px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Sparkles size={16} /> Спросить AI Шефа:
          </div>
          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "flex-end",
              width: "100%",
            }}
          >
            <textarea
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                e.target.style.height = "44px";
                e.target.style.height =
                  (e.target.scrollHeight < 120 ? e.target.scrollHeight : 120) +
                  "px";
              }}
              rows={1}
              disabled={asking}
              style={{
                flex: 1,
                width: "100%",
                padding: "12px 16px",
                borderRadius: "22px",
                border: "1px solid #93c5fd",
                fontSize: "15px",
                outline: "none",
                background: asking ? "#f8fafc" : "white",
                resize: "none",
                overflowY: "auto",
                height: "44px",
                minHeight: "44px",
                maxHeight: "120px",
                boxSizing: "border-box",
                lineHeight: "18px",
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={handleAskChef}
              disabled={asking || !question.trim()}
              style={{
                flexShrink: 0,
                padding: 0,
                width: "44px",
                height: "44px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                background:
                  asking || !question.trim() ? "#bae6fd" : "#3b82f6",
                color: "white",
                border: "none",
                cursor:
                  asking || !question.trim() ? "default" : "pointer",
              }}
            >
              <Send size={18} style={{ marginLeft: "-2px" }} />
            </button>
          </div>
        </div>
        {asking && (
          <div
            style={{
              marginTop: "15px",
              color: "#0ea5e9",
              fontSize: "14px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              justifyContent: "center",
            }}
          >
            <Sparkles className="animate-spin" size={16} /> Шеф-повар думает над
            ответом...
          </div>
        )}
        {answer && !asking && (
          <div
            style={{
              marginTop: "20px",
              lineHeight: 1.5,
              background: "white",
              padding: "15px",
              borderRadius: "16px",
            }}
          >
            <strong>Ответ:</strong> {answer}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: "30px",
          background: "#f8fafc",
          padding: "25px 20px",
          borderRadius: "16px",
          border: "1px solid #e2e8f0",
          textAlign: "center",
        }}
      >
        <h3
          style={{
            fontSize: "18px",
            fontWeight: 800,
            marginBottom: "5px",
            color: "#1f2937",
          }}
        >
          📸 Приготовили? Покажите результат!
        </h3>
        <p
          style={{
            fontSize: "13px",
            color: "#64748b",
            marginBottom: "15px",
            lineHeight: 1.4,
          }}
        >
          Ваше фото появится в разделе <strong>«Лента»</strong>, где его смогут
          оценить другие пользователи!
        </p>
        {!user ? (
          <button
            className="btn-primary"
            onClick={() => setIsAuthModalOpen(true)}
          >
            Войти, чтобы опубликовать фото
          </button>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "15px",
            }}
          >
            {!userPhotoFile ? (
              <div
                style={{
                  border: "2px dashed #cbd5e1",
                  borderRadius: "12px",
                  padding: "20px",
                  cursor: "pointer",
                  background: "white",
                }}
                onClick={() => {
                  setIsStandaloneUploadOpen(false);
                  const input = document.getElementById(
                    "user-photo-upload"
                  ) as HTMLInputElement | null;
                  input?.click();
                }}
              >
                <Camera
                  size={32}
                  color="#f97316"
                  style={{ margin: "0 auto 10px auto" }}
                />
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#4b5563",
                  }}
                >
                  Нажмите, чтобы загрузить фото блюда
                </div>
                <input
                  id="user-photo-upload"
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleUserPhotoChange}
                />
              </div>
            ) : (
              <div
                style={{
                  background: "white",
                  padding: "15px",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                }}
              >
                {userPhotoPreview && (
                  <img
                    src={userPhotoPreview}
                    alt="Preview"
                    style={{
                      width: "100%",
                      height: "200px",
                      objectFit: "cover",
                      borderRadius: "8px",
                      marginBottom: "15px",
                    }}
                  />
                )}
                <textarea
                  placeholder="Описание (как получилось?)"
                  value={userComment}
                  onChange={(e) => {
                    setUserComment(e.target.value);
                    e.target.style.height = "44px";
                    e.target.style.height = e.target.scrollHeight + "px";
                  }}
                  rows={1}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    borderRadius: "12px",
                    border: "1px solid #fdba74",
                    fontSize: "15px",
                    marginBottom: "15px",
                    outline: "none",
                    resize: "none",
                    overflow: "hidden",
                    minHeight: "44px",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                    lineHeight: "18px",
                  }}
                />
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={() => {
                      setUserPhotoFile(null);
                      setUserPhotoPreview(null);
                      setUserComment("");
                    }}
                    style={{
                      flex: 1,
                      padding: "12px",
                      borderRadius: "8px",
                      background: "#f3f4f6",
                      border: "none",
                      color: "#4b5563",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => submitFeedPost(recipe)}
                    disabled={isUploadingPhoto}
                    style={{
                      flex: 2,
                      padding: "12px",
                      borderRadius: "8px",
                      background: "#ea580c",
                      border: "none",
                      color: "white",
                      fontWeight: 700,
                      cursor: isUploadingPhoto ? "default" : "pointer",
                    }}
                  >
                    {isUploadingPhoto ? "Отправка..." : "Отправить в ленту"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

