"use client";
import { pickImageIntoInputHandler } from "@/lib/native";

import React from "react";
import {
  Search,
  ArrowLeft,
  Share2,
  Heart,
  Flame,
  Clock,
  Sparkles,
  Shuffle,
  ChevronRight,
  Send,
  Camera,
  X,
  ChefHat,
  UtensilsCrossed,
  Volume2,
} from "lucide-react";
import DonateButton from "@/components/DonateButton";
import Button from "@/components/ui/Button";
import CookMode from "@/components/CookMode";
import RecipeImage from "@/components/RecipeImage";
import KuperBuyBlock from "@/components/KuperBuyBlock";
import AiRecipeDisclaimer from "@/components/AiRecipeDisclaimer";
import { formatCookingTime } from "@/lib/utils";

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
  submitFeedPost: (currentRecipeContext: any, showInFeed?: boolean) => void;
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
  // Осознанная публикация в витрину «Приготовили сегодня»: по умолчанию ВЫКЛ.
  // Значение уходит в submitFeedPost вторым аргументом — без прокидывания state
  // через ServiceView.
  const [showInFeed, setShowInFeed] = React.useState(false);
  const [cooking, setCooking] = React.useState(false);
  // Ингредиенты для панели «Состав» в режиме готовки — с учётом текущих порций.
  const cookIngredients = (recipe.detailed_ingredients || []).map((ing: any) => ({
    name: ing.name,
    amount: scaleAmount(ing.amount, actualServings),
  }));
  const hasSteps =
    Array.isArray(recipe.steps) && recipe.steps.filter((s: string) => (s || "").trim()).length > 0;
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
        marginTop: "var(--space-2)",
      }}
    >
      {isSharedView && (
        <button
          onClick={handleBackToSearch}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-full)",
            padding: "var(--space-2) var(--space-3)",
            color: "var(--color-text-secondary)",
            fontSize: "var(--font-size-caption)",
            fontWeight: "var(--font-weight-semibold)",
            marginBottom: "var(--space-4)",
            cursor: "pointer",
            boxShadow: "0 2px 5px rgba(0,0,0,0.05)",
            transition: "all 0.2s",
          }}
        >
          <Search size={18} color="var(--color-accent)" /> К поиску
        </button>
      )}

      {(fromFeed !== false || isHistoryView) && !isSharedView && (
        <button
          onClick={fromFeed ? handleBackToSource : handleBackToSearch}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-full)",
            padding: "var(--space-2) var(--space-3)",
            color: "var(--color-text-secondary)",
            fontSize: "var(--font-size-caption)",
            fontWeight: "var(--font-weight-semibold)",
            marginBottom: "var(--space-4)",
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

      <RecipeImage src={recipe.image_url} alt={recipe.title} status={recipe.image_status} />

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
              flex: 1,
              wordBreak: "break-word",
            }}
          >
            {recipe.title}
          </h2>
          <div
            style={{
              display: "flex",
              gap: "var(--space-4)",
              alignItems: "center",
              flexShrink: 0,
              marginTop: "2px",
            }}
          >
            <div
              onClick={(e) => toggleFavorite(e, recipe.id!, recipe.is_favorite)}
              style={{ cursor: "pointer" }}
            >
              <Heart
                size={30}
                className={recipe.is_favorite ? "fill-red-500 text-red-500" : "text-gray-300"}
                color={recipe.is_favorite ? "#dc2626" : "var(--color-text-muted)"}
                fill={recipe.is_favorite ? "#dc2626" : "none"}
              />
            </div>
          </div>
        </div>

        {recipe.description && (
          <p
            style={{
              fontSize: "var(--font-size-body)",
              color: "var(--color-text-secondary)",
              lineHeight: "1.5",
              margin: "var(--space-1) 0 var(--space-3) 0",
            }}
          >
            {recipe.description}
          </p>
        )}

        {showSmartVariant && (
          <Button
            variant="secondary"
            onClick={handleSmartVariant}
            disabled={loadingRecipe}
          >
            {loadingRecipe ? (
              <Sparkles className="animate-spin" size={20} color="var(--color-accent)" />
            ) : (
              <Shuffle size={20} color="var(--color-accent)" />
            )}
            <span style={{ flex: 1, textAlign: "left" }}>
              {loadingRecipe ? "Ищем идеи..." : "Подобрать другой рецепт"}
            </span>
            <ChevronRight size={18} color="var(--color-text-muted)" />
          </Button>
        )}
      </div>

      <div className="recipe-tags" style={{ marginTop: "var(--space-3)", marginBottom: "var(--space-3)" }}>
        <div className="tag-badge">
          <Clock size={16} /> {formatCookingTime(recipe.cooking_time_minutes) || formatTime(recipe.time)}
        </div>
        {recipe.calories && (
          <div className="tag-badge">
            <Flame size={16} /> {formatCalories(recipe.calories)}
          </div>
        )}
      </div>

      {/* App Store 1.4.1: предупреждение об аллергенах — до состава и до кнопки
          «Готовим!», то есть до момента, когда человек решает готовить. */}
      <AiRecipeDisclaimer />

      <button
        type="button"
        onClick={handleShareRecipe}
        className="recipe-share-btn"
      >
        <Share2 size={18} /> Поделиться рецептом
      </button>

      {recipe.detailed_ingredients && recipe.detailed_ingredients.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            marginBottom: "var(--space-4)",
            background: "var(--color-bg)",
            padding: "var(--space-2) var(--space-3)",
            borderRadius: "var(--radius-sm)",
            width: "fit-content",
          }}
        >
          <span
            style={{
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text-secondary)",
              fontSize: "var(--font-size-body)",
              display: "flex",
              alignItems: "center",
              gap: "var(--space-1)",
            }}
          >
            <UtensilsCrossed size={16} /> Порции:
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
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
                padding: "var(--space-2) var(--space-3)",
                background: "transparent",
                border: "none",
                fontSize: "18px",
                color:
                  servings === 1 || servings === "" ? "var(--color-text-muted)" : "var(--color-text-secondary)",
                cursor:
                  servings === 1 || servings === "" ? "default" : "pointer",
                fontWeight: "var(--font-weight-semibold)",
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
                borderLeft: "1px solid var(--color-border)",
                borderRight: "1px solid var(--color-border)",
                padding: "var(--space-2) 0",
                fontSize: "var(--font-size-body)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-text)",
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
                padding: "var(--space-2) var(--space-3)",
                background: "transparent",
                border: "none",
                fontSize: "18px",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
                fontWeight: "var(--font-weight-semibold)",
              }}
            >
              +
            </button>
          </div>
        </div>
      )}

      {recipe.detailed_ingredients && recipe.detailed_ingredients.length > 0 && (
        <>
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
          {/* Монетизация: заказ продуктов по рецепту через Купер (CPA). Только
              когда есть список ингредиентов — заказывать нечего без него. */}
          <KuperBuyBlock
            ingredients={recipe.detailed_ingredients.map((ing: any) => ing.name)}
          />
        </>
      )}

      {/* Крупная первичная кнопка запуска режима готовки с озвучкой (задача Z). */}
      {hasSteps && (
        <button type="button" className="cook-start-btn" onClick={() => setCooking(true)}>
          <Volume2 size={24} /> Готовим!
        </button>
      )}

      <h3
        style={{
          fontSize: "var(--font-size-heading)",
          fontWeight: "var(--font-weight-semibold)",
          marginBottom: "var(--space-4)",
          color: "var(--color-text)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
        }}
      >
        <ChefHat size={20} /> Рецепт приготовления
      </h3>
      <div>
        {recipe.steps?.map((step: string, i: number) => (
          <div key={i} className="step-row">
            <div className="step-num">{i + 1}</div>
            <div className="step-text">{cleanText(step)}</div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: "center" }}>
        <DonateButton variant="inline" />
      </div>

      <div
        className="chat-box"
      >
        <div
          style={{
            fontWeight: "var(--font-weight-semibold)",
            marginBottom: "var(--space-4)",
            color: "var(--color-text)",
            fontSize: "var(--font-size-heading)",
            textAlign: "center",
          }}
        >
          Спросить шефа
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
            alignItems: "flex-start",
            width: "100%",
          }}
        >
          <div
            style={{
              fontWeight: "var(--font-weight-semibold)",
              fontSize: "var(--font-size-body)",
              color: "var(--color-text-secondary)",
              paddingLeft: "var(--space-1)",
              display: "flex",
              alignItems: "center",
              gap: "var(--space-1)",
            }}
          >
            <Sparkles size={16} /> Ваш вопрос:
          </div>
          <div
            style={{
              display: "flex",
              gap: "var(--space-2)",
              alignItems: "flex-end",
              width: "100%",
            }}
          >
            <textarea
              value={question}
              placeholder="Чем заменить фету?"
              onChange={(e) => {
                setQuestion(e.target.value);
                e.target.style.height = "44px";
                e.target.style.height =
                  (e.target.scrollHeight < 120 ? e.target.scrollHeight : 120) +
                  "px";
              }}
              rows={1}
              disabled={asking}
              className="chat-input"
              style={{
                flex: 1,
                width: "100%",
                background: asking ? "var(--color-bg-subtle)" : "var(--color-bg)",
                resize: "none",
                overflowY: "hidden",
                height: "44px",
                minHeight: "44px",
                maxHeight: "120px",
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
                  asking || !question.trim() ? "var(--color-border)" : "var(--color-accent)",
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
              marginTop: "var(--space-3)",
              color: "var(--color-accent)",
              fontSize: "var(--font-size-caption)",
              fontWeight: "var(--font-weight-medium)",
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
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
              marginTop: "var(--space-4)",
              lineHeight: 1.5,
              background: "var(--color-surface)",
              padding: "var(--space-3)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
            }}
          >
            <strong>Ответ:</strong> {answer}
          </div>
        )}
      </div>

      <div
        id="cooked-photo-zone"
        style={{
          marginTop: "var(--space-5)",
          background: "var(--color-bg)",
          padding: "var(--space-4) var(--space-3)",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--color-border)",
          textAlign: "center",
        }}
      >
        <h3
          style={{
            fontSize: "var(--font-size-body)",
            fontWeight: "var(--font-weight-semibold)",
            marginBottom: "var(--space-1)",
            color: "var(--color-text)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-2)",
          }}
        >
          <Camera size={18} /> Приготовили? Покажите результат!
        </h3>
        <p
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-text-secondary)",
            marginBottom: "var(--space-3)",
            lineHeight: 1.4,
          }}
        >
          Отметьте галочку — и ваше блюдо увидят другие: сразу в{" "}
          <strong>«Приготовили сегодня»</strong> на главной и, после проверки, в{" "}
          <strong>ленте сообщества</strong>.
        </p>
        {!user ? (
          <Button
            variant="primary"
            onClick={() => setIsAuthModalOpen(true)}
          >
            Войти, чтобы опубликовать фото
          </Button>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            {!userPhotoFile ? (
              <div
                style={{
                  border: "2px dashed var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "var(--space-3)",
                  cursor: "pointer",
                  background: "var(--color-surface)",
                }}
                onClick={async () => {
                  setIsStandaloneUploadOpen(false);
                  // В нативе — системный выбор камера/галерея.
                  if (await pickImageIntoInputHandler(handleUserPhotoChange)) return;
                  const input = document.getElementById(
                    "user-photo-upload"
                  ) as HTMLInputElement | null;
                  input?.click();
                }}
              >
                <Camera
                  size={32}
                  color="var(--color-accent)"
                  style={{ margin: "0 auto var(--space-2) auto" }}
                />
                <div
                  style={{
                    fontSize: "var(--font-size-caption)",
                    fontWeight: "var(--font-weight-medium)",
                    color: "var(--color-text-secondary)",
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
                  background: "var(--color-surface)",
                  padding: "var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border)",
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
                      borderRadius: "var(--radius-sm)",
                      marginBottom: "var(--space-3)",
                    }}
                  />
                )}
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "var(--space-2)",
                    marginBottom: "var(--space-3)",
                    cursor: "pointer",
                    fontSize: "var(--font-size-caption)",
                    color: "var(--color-text-secondary)",
                    lineHeight: 1.4,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showInFeed}
                    onChange={(e) => setShowInFeed(e.target.checked)}
                    style={{ marginTop: "2px", width: "18px", height: "18px", accentColor: "var(--color-accent)", flexShrink: 0 }}
                  />
                  <span>Показать в «Приготовили сегодня»</span>
                </label>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setUserPhotoFile(null);
                      setUserPhotoPreview(null);
                      setUserComment("");
                      setShowInFeed(false);
                    }}
                    style={{ flex: 1 }}
                  >
                    Отмена
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => submitFeedPost(recipe, showInFeed)}
                    disabled={isUploadingPhoto || !showInFeed}
                    style={{ flex: 2 }}
                  >
                    {isUploadingPhoto ? "Публикуем..." : "Опубликовать"}
                  </Button>
                </div>
                {/* Честный текст про два адресата: витрина видна сразу, лента —
                    после премодерации. Обещать «сразу везде» нельзя. */}
                <p
                  style={{
                    margin: "var(--space-2) 0 0",
                    fontSize: "var(--font-size-caption)",
                    color: "var(--color-text-secondary)",
                    lineHeight: 1.4,
                  }}
                >
                  Появится на главной сразу, в ленте — после проверки
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {cooking && (
        <CookMode
          title={recipe.title}
          steps={recipe.steps || []}
          ingredients={cookIngredients}
          cookingTimeMinutes={recipe.cooking_time_minutes}
          onClose={() => setCooking(false)}
          // Финал: закрываем режим и подводим к готовому флоу «Приготовили? Покажите».
          onCookedPhoto={() => {
            setCooking(false);
            setTimeout(() => {
              document.getElementById("cooked-photo-zone")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
          }}
        />
      )}
    </div>
  );
}

