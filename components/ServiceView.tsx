"use client";
import { pickImageIntoInputHandler, isNativePlatform } from "@/lib/native";

import React from "react";
import {
  Flame,
  Camera,
  Image as ImageIcon,
  ImageOff,
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
  Loader2,
  History,
  Share2,
  BookOpen,
  Plus,
  Pencil,
} from "lucide-react";
import RecipeView from "@/components/RecipeView";
import Button from "@/components/ui/Button";
import { MAX_PRODUCT_LENGTH } from "@/lib/products";
import { shareOrCopy } from "@/lib/share";
import { formatCookingTime } from "@/lib/utils";

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
  allergies: string[];
  dislikes: string[];
  file: File | null;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  preview: string | null;
  triggerFileInput: () => void;
  handlePhotoAreaTap: () => void;
  cookingMode: "strict" | "extended";
  setCookingMode: (mode: "strict" | "extended") => void;
  handleAnalyze: () => void;
  analyzing: boolean;
  isProcessing: boolean;
  textQuery: string;
  setTextQuery: (v: string) => void;
  handleTextSearch: (opts?: { cacheOnly?: boolean; queryOverride?: string }) => void;
  loadingRecipe: boolean;
  analysisResult: any;
  productsDirty: boolean;
  onAddProduct: (raw: string) => boolean;
  onRemoveProduct: (index: number) => void;
  onNoFoodManualEntry: () => void;
  onNoFoodSwitchToText: () => void;
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

// Примеры для ротации в плейсхолдере текстового поиска. Строго чередуются
// продукт/блюдо (первый — продуктовый), чтобы за первые ~6 сек пользователь
// увидел ОБА типа запроса. Поле объясняет себя примерами, а не инструкцией.
const TEXT_SEARCH_PLACEHOLDERS = ["яйца, хлеб, сыр…", "борщ", "курица, картошка, рис", "сырники"];

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
  allergies,
  dislikes,
  file,
  handleFileChange,
  preview,
  triggerFileInput,
  handlePhotoAreaTap,
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
  productsDirty,
  onAddProduct,
  onRemoveProduct,
  onNoFoodManualEntry,
  onNoFoodSwitchToText,
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
  // Мягкая ротация примеров в плейсхолдере (fade), при фокусе на поле — стоп.
  // Старт ротации примеров — со случайного, чтобы при каждом заходе на /search
  // первым мелькал разный пример (этап 8, находка №3).
  const [phIndex, setPhIndex] = React.useState(() => Math.floor(Math.random() * TEXT_SEARCH_PLACEHOLDERS.length));
  const [phFocused, setPhFocused] = React.useState(false);
  const [phVisible, setPhVisible] = React.useState(true);
  React.useEffect(() => {
    if (phFocused) return;
    const id = setInterval(() => {
      setPhVisible(false);
      setTimeout(() => {
        setPhIndex((i) => (i + 1) % TEXT_SEARCH_PLACEHOLDERS.length);
        setPhVisible(true);
      }, 300);
    }, 3000);
    return () => clearInterval(id);
  }, [phFocused]);

  // Поле «+ Добавить продукт» под чипами. Автодополнения нет: только текст,
  // Enter или кнопка. Запятая — разделитель («сметана, укроп» = два продукта).
  const [newProduct, setNewProduct] = React.useState("");
  const products: string[] = analysisResult?.ingredients ?? [];

  const submitNewProduct = (e: React.FormEvent) => {
    e.preventDefault();
    // Список правится локально — OpenAI тут не дёргается. Поле чистим только
    // если продукт реально добавлен (иначе на лимите текст исчез бы молча).
    if (onAddProduct(newProduct)) setNewProduct("");
  };

  // Enter обрабатываем явно: на неявную отправку формы полагаться нельзя —
  // мобильные клавиатуры («Готово») её не всегда запускают.
  const onProductKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submitNewProduct(e);
  };

  return (
    <>
      {!isHistoryView && fromFeed === false && !isSharedView && (
        <>
          {currentHoliday && (
            <div
              className="animate-fade-in"
              style={{
                background: currentHoliday.gradient,
                  color: "white",
                  padding: "var(--space-4)",
                  borderRadius: "var(--radius-md)",
                  marginTop: "var(--space-4)",
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
                    fontSize: "var(--font-size-heading)",
                    marginBottom: "var(--space-2)",
                    fontWeight: "var(--font-weight-semibold)",
                    fontFamily: '"Times New Roman", serif',
                    fontStyle: "italic",
                  }}
                >
                  {currentHoliday.icon} {currentHoliday.title}
                </div>
                <div
                  style={{
                    fontSize: "var(--font-size-body)",
                    lineHeight: "1.5",
                    opacity: 0.95,
                    fontWeight: "var(--font-weight-regular)",
                  }}
                >
                  {currentHoliday.text}
                </div>
              </div>
            )}

          {/* Блок «Рецепт дня» убран из /search (H7/#37): он остаётся только на
              Главной, чтобы поиск начинался сразу с выбора фото/текста. */}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              marginBottom: "var(--space-3)",
            }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                background: "var(--color-bg-subtle)",
                padding: "var(--space-1)",
                borderRadius: "var(--radius-sm)",
                boxShadow: "inset 0 2px 4px rgba(0,0,0,0.05)",
              }}
            >
              <button
                onClick={() => setSearchMode("photo")}
                style={{
                  flex: 1,
                  padding: "var(--space-2) var(--space-1)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  background: searchMode === "photo" ? "var(--color-surface)" : "transparent",
                  fontWeight: "var(--font-weight-semibold)",
                  fontSize: "var(--font-size-body)",
                  boxShadow:
                    searchMode === "photo"
                      ? "0 4px 15px rgba(0,0,0,0.05)"
                      : "none",
                  color: searchMode === "photo" ? "var(--color-text)" : "var(--color-text-secondary)",
                  transition:
                    "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "var(--space-2)",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    background:
                      searchMode === "photo" ? "var(--color-accent-subtle)" : "var(--color-bg-subtle)",
                    color:
                      searchMode === "photo" ? "var(--color-accent)" : "var(--color-text-muted)",
                    width: "32px",
                    height: "32px",
                    borderRadius: "var(--radius-sm)",
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
                  padding: "var(--space-2) var(--space-1)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  background: searchMode === "text" ? "var(--color-surface)" : "transparent",
                  fontWeight: "var(--font-weight-semibold)",
                  fontSize: "var(--font-size-body)",
                  boxShadow:
                    searchMode === "text"
                      ? "0 4px 15px rgba(0,0,0,0.05)"
                      : "none",
                  color: searchMode === "text" ? "var(--color-text)" : "var(--color-text-secondary)",
                  transition:
                    "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "var(--space-2)",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    background:
                      searchMode === "text" ? "var(--color-accent-subtle)" : "var(--color-bg-subtle)",
                    color:
                      searchMode === "text" ? "var(--color-accent)" : "var(--color-text-muted)",
                    width: "32px",
                    height: "32px",
                    borderRadius: "var(--radius-sm)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.3s",
                    flexShrink: 0,
                  }}
                >
                  <Search size={18} />
                </div>
                Продукты или блюдо
              </button>
            </div>

            <button
              onClick={() => setIsPreferencesModalOpen(true)}
              aria-label="Фильтры для рецепта"
              style={{
                background: "var(--color-surface)",
                border: "none",
                borderRadius: "var(--radius-full)",
                height: "52px",
                width: "52px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                color: "var(--color-text-secondary)",
                flexShrink: 0,
              }}
            >
              <Settings size={22} />
            </button>
          </div>

          <div className="card" id="sc-search-card">
            {searchMode === "photo" ? (
              <>
                {!file ? (
                  <div
                    className="upload-zone"
                    id="photo-upload-zone"
                    role="button"
                    tabIndex={0}
                    aria-label="Выберите фото из галереи"
                    onClick={handlePhotoAreaTap}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handlePhotoAreaTap();
                      }
                    }}
                  >
                    <div className="upload-cam-chip">
                      <Camera size={30} color="var(--color-accent)" />
                    </div>
                    <div
                      style={{
                        fontWeight: "var(--font-weight-semibold)",
                        fontSize: "var(--font-size-body)",
                        color: "var(--color-text)",
                        marginBottom: "var(--space-1)",
                      }}
                    >
                      Выберите фото
                    </div>
                    <div
                      style={{
                        fontSize: "var(--font-size-caption)",
                        color: "var(--color-text-muted)",
                        marginBottom: "var(--space-4)",
                      }}
                    >
                      HEIC, JPG, PNG
                    </div>
                    {/* Две явные кнопки: Android-меню «Выберите фото» открывало только
                        галерею — камера была недоступна. capture="environment" открывает
                        заднюю камеру; на десктопе/iOS-галерее capture игнорируется. Оба
                        input'а ведут в один handleFileChange → preparePhoto. */}
                    <div className="upload-actions">
                      <label
                        className="upload-action-btn upload-action-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          // preventDefault обязан быть СИНХРОННЫМ: после await
                          // событие уже обработано и <label> успевает открыть
                          // системный пикер WebView поверх нативного.
                          if (!isNativePlatform()) return;
                          e.preventDefault();
                          void pickImageIntoInputHandler(handleFileChange, "camera");
                        }}
                      >
                        <Camera size={18} /> Снять фото
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="upload-action-input"
                          onChange={handleFileChange}
                        />
                      </label>
                      <label
                        className="upload-action-btn upload-action-secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isNativePlatform()) return;
                          e.preventDefault();
                          void pickImageIntoInputHandler(handleFileChange, "photos");
                        }}
                      >
                        <ImageIcon size={18} /> Из галереи
                        <input
                          id="hidden-file-input"
                          type="file"
                          accept="image/png, image/jpeg, image/jpg, .heic, .HEIC"
                          className="upload-action-input"
                          onChange={handleFileChange}
                        />
                      </label>
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

                <Button
                  variant="primary"
                  onClick={handleAnalyze}
                  disabled={!file || analyzing || isProcessing}
                  style={{ marginTop: "var(--space-4)" }}
                >
                  {isProcessing ? (
                    <><Loader2 className="animate-spin" size={18} /> Обработка фото...</>
                  ) : analyzing ? (
                    <><Loader2 className="animate-spin" size={18} /> Изучаю продукты...</>
                  ) : (
                    <><Sparkles size={18} /> Найти рецепт</>
                  )}
                </Button>
              </>
            ) : (
              <>
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    marginBottom: "var(--space-2)",
                  }}
                >
                  <input
                    type="text"
                    className="text-search-input"
                    placeholder=""
                    value={textQuery}
                    onChange={(e) => setTextQuery(e.target.value)}
                    onFocus={() => setPhFocused(true)}
                    onBlur={() => setPhFocused(false)}
                    style={{
                      paddingRight: textQuery ? "40px" : "var(--space-3)",
                      marginBottom: 0,
                      boxSizing: "border-box",
                    }}
                  />
                  {!textQuery && (
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        left: "var(--space-3)",
                        right: "var(--space-3)",
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: "var(--font-size-body)",
                        color: "var(--color-text-muted)",
                        pointerEvents: "none",
                        opacity: phVisible ? 1 : 0,
                        transition: "opacity 0.3s ease",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {TEXT_SEARCH_PLACEHOLDERS[phIndex]}
                    </span>
                  )}
                  {textQuery && (
                    <button
                      onClick={() => setTextQuery("")}
                      style={{
                        position: "absolute",
                        right: "var(--space-3)",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "transparent",
                        border: "none",
                        padding: "var(--space-1)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
                <p
                  style={{
                    fontSize: "var(--font-size-caption)",
                    color: "var(--color-text-muted)",
                    margin: "0 0 var(--space-3)",
                  }}
                >
                  Перечислите продукты через запятую — или введите название блюда
                </p>
                <Button
                  variant="primary"
                  onClick={() => handleTextSearch()}
                  disabled={loadingRecipe || !textQuery.trim()}
                >
                  {loadingRecipe ? (
                    <><Loader2 className="animate-spin" size={18} /> Готовлю...</>
                  ) : (
                    <><Search size={18} /> Найти рецепт</>
                  )}
                </Button>
              </>
            )}
          </div>

          {(allergies.length > 0 || dislikes.length > 0) && (
            <button
              type="button"
              className="taste-indicator"
              onClick={() => setIsPreferencesModalOpen(true)}
              aria-label="Изменить учитываемые вкусы"
            >
              <span className="taste-indicator-label">
                <Settings size={14} /> Учитываем:
              </span>
              {allergies.map((a, i) => (
                <span key={"a" + i} className="taste-chip taste-chip-allergy">
                  {a}
                </span>
              ))}
              {dislikes.map((d, i) => (
                <span key={"d" + i} className="taste-chip taste-chip-dislike">
                  {d}
                </span>
              ))}
              <ChevronRight size={15} className="taste-indicator-arrow" />
            </button>
          )}
        </>
      )}

      {analysisResult && !isSharedView && !isHistoryView && analysisResult.no_food && (
        <div className="card no-food-card">
          <div className="no-food-icon">
            <ImageOff size={26} />
          </div>
          <div className="no-food-title">Не нашли продуктов на фото</div>
          <div className="no-food-text">
            Попробуйте снять продукты крупнее и при хорошем свете — или перечислите
            их текстом.
          </div>
          <div className="no-food-actions">
            <button type="button" className="btn-primary no-food-btn" onClick={onNoFoodManualEntry}>
              <Pencil size={18} /> Ввести продукты вручную
            </button>
            <button type="button" className="no-food-btn-secondary" onClick={onNoFoodSwitchToText}>
              <Search size={16} /> Искать по названию блюда
            </button>
          </div>
        </div>
      )}

      {analysisResult && !isSharedView && !isHistoryView && !analysisResult.no_food && (
        <div className="card">
          <h3 className="products-title">
            {analysisResult.manual ? "Ваши продукты" : "Я вижу продукты:"}
          </h3>
          <p className="products-hint">
            {products.length === 0
              ? "Добавьте продукты — по одному или через запятую."
              : analysisResult.manual
                ? "Уберите лишнее крестиком или допишите ещё продукты."
                : "Уберите лишнее крестиком и допишите то, чего нет на фото."}
          </p>

          <div className="products-chips">
            {products.map((ing: string, i: number) => (
              <span key={ing + i} className="product-chip">
                {ing}
                {/* Крестик — вторичное действие: иконка заметно мельче текста
                    чипа (12 против 16) и тоньше. Размер зоны тапа задаёт CSS,
                    а не эта иконка: кнопка 40×40 «выпущена» за габарит чипа
                    отрицательными margin. */}
                <button
                  type="button"
                  className="product-chip-remove"
                  aria-label={`Убрать «${ing}»`}
                  onClick={() => onRemoveProduct(i)}
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </span>
            ))}
          </div>

          <form className="product-add-row" onSubmit={submitNewProduct}>
            <input
              type="text"
              className="product-add-input"
              value={newProduct}
              onChange={(e) => setNewProduct(e.target.value)}
              onKeyDown={onProductKeyDown}
              placeholder="например: сметана, укроп"
              aria-label="Добавить продукт"
              maxLength={MAX_PRODUCT_LENGTH * 3}
              enterKeyHint="done"
              autoComplete="off"
            />
            <button
              type="submit"
              className="product-add-btn"
              disabled={!newProduct.trim()}
            >
              <Plus size={18} strokeWidth={2.5} /> Добавить
            </button>
          </form>

          {/* Пока список правили — блюда из распознавания устарели: не показываем
              их, а предлагаем подобрать рецепты под ИТОГОВЫЙ список (1 запрос). */}
          {productsDirty || !analysisResult.dishes?.length ? (
            /* Отступ сверху даёт margin-bottom формы — одинаковый и здесь, и
               перед списком блюд. Свой marginTop добавлял бы его вторым разом. */
            <Button
              onClick={handleRegenerate}
              disabled={isRegenerating || loadingRecipe || products.length === 0}
            >
              <Sparkles size={20} />{" "}
              {isRegenerating ? "Подбираю рецепты..." : "Подобрать рецепты"}
            </Button>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {analysisResult.dishes?.map((dish: string, i: number) => (
                  <Button
                    key={i}
                    onClick={() => getRecipeFromPhoto(dish)}
                    variant="secondary"
                    disabled={loadingRecipe}
                    style={{
                      justifyContent: "space-between",
                      opacity: loadingRecipe && selectedDish !== dish ? 0.5 : 1,
                      borderColor:
                        selectedDish === dish ? "var(--color-accent)" : "var(--color-border)",
                      background:
                        selectedDish === dish ? "var(--color-accent-subtle)" : "var(--color-surface)",
                    }}
                  >
                    <span>{dish}</span>
                    {loadingRecipe && selectedDish === dish ? (
                      <Sparkles className="animate-spin" size={24} color="var(--color-accent)" />
                    ) : (
                      <ChevronRight color="var(--color-text-muted)" />
                    )}
                  </Button>
                ))}
              </div>
              <Button
                variant="secondary"
                onClick={handleRegenerate}
                disabled={isRegenerating || loadingRecipe}
                style={{ marginTop: "var(--space-4)" }}
              >
                <Sparkles size={20} color="var(--color-accent)" />{" "}
                {isRegenerating ? "Включаю фантазию..." : "Хочу что-то необычное"}
              </Button>
            </>
          )}
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
          <div className="history-bar" style={{ marginTop: "var(--space-5)" }}>
            <span className="history-title" style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
              <History size={20} /> История рецептов
            </span>
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
                style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}
              >
                <Heart size={14} /> Избранное
              </button>
            </div>
          </div>

          {historyExpanded && displayedFeed && displayedFeed.length > 4 && (
            <Button
              variant="secondary"
              onClick={() => setHistoryExpanded(false)}
              style={{ marginTop: "0", marginBottom: "var(--space-3)", fontSize: "var(--font-size-caption)" }}
            >
              Свернуть историю <ChevronUp size={16} />
            </Button>
          )}

          {displayedFeed?.length === 0 ? (
            filterMode === "favorites" ? (
              <div className="history-empty">
                <div className="history-empty-icon">
                  <Heart size={26} />
                </div>
                <div className="history-empty-text">
                  Понравился рецепт — нажмите сердечко, и он сохранится здесь.
                </div>
              </div>
            ) : (
              <div className="history-empty">
                <div className="history-empty-icon">
                  <BookOpen size={26} />
                </div>
                <div className="history-empty-text">
                  Здесь появятся ваши рецепты. Сфотографируйте продукты или
                  напишите, что есть дома, — первый рецепт займёт минуту.
                </div>
                <button
                  type="button"
                  className="btn-primary history-empty-btn"
                  onClick={() => {
                    setSearchMode("photo");
                    setTimeout(() => {
                      const zone = document.getElementById("photo-upload-zone");
                      if (!zone) return;
                      zone.scrollIntoView({ behavior: "smooth", block: "center" });
                      zone.classList.add("upload-zone-pulse");
                      setTimeout(() => zone.classList.remove("upload-zone-pulse"), 1800);
                    }, 100);
                  }}
                >
                  <Camera size={20} /> Сфотографировать продукты
                </button>
              </div>
            )
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "var(--space-3)",
                  marginBottom: "var(--space-2)",
                }}
              >
                {visibleHistory?.map((item: any) => (
                  <div
                    key={item.id}
                    className="card"
                    style={{
                      padding: "var(--space-3)",
                      cursor: "pointer",
                      marginBottom: 0,
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      border: "1px solid var(--color-border)",
                      position: "relative",
                      overflow: "hidden",
                      background: item.is_favorite ? "var(--color-danger-subtle)" : "var(--color-surface)",
                    }}
                    onClick={() => loadFromHistory(item, "history")}
                  >
                    {item.is_favorite && (
                      <div
                        style={{
                          position: "absolute",
                          top: "var(--space-2)",
                          right: "var(--space-2)",
                          color: "#dc2626",
                        }}
                      >
                        <Heart
                          size={18}
                          className="fill-red-500"
                          fill="#dc2626"
                        />
                      </div>
                    )}
                    <div
                      style={{
                        fontWeight: "var(--font-weight-semibold)",
                        fontSize: "var(--font-size-caption)",
                        marginBottom: "var(--space-2)",
                        lineHeight: 1.3,
                        height: "38px",
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        wordBreak: "break-word",
                        position: "relative",
                        color: "var(--color-text)",
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
                        gap: "var(--space-1)",
                        fontSize: "var(--font-size-caption)",
                        color: "var(--color-text-muted)",
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
                        <Clock size={12} /> {formatCookingTime(item.cooking_time_minutes) || formatTime(item.time)}
                      </div>
                      {item.calories && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "3px",
                            color: "var(--color-text-muted)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <Flame size={12} />{" "}
                          {formatCalories(item.calories)}
                        </div>
                      )}
                      <button
                        type="button"
                        className="history-share-btn"
                        aria-label="Поделиться рецептом"
                        onClick={(e) => {
                          e.stopPropagation();
                          const url = item.id
                            ? `${window.location.origin}/?recipeId=${item.id}`
                            : window.location.origin;
                          shareOrCopy({
                            title: item.title,
                            text: `«${item.title}» • ${formatTime(item.time)}`,
                            url,
                            goal: "share_recipe_history",
                          });
                        }}
                      >
                        <Share2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {!historyExpanded && displayedFeed && displayedFeed.length > 4 && (
                <Button
                  variant="secondary"
                  onClick={() => setHistoryExpanded(true)}
                >
                  Показать еще ({displayedFeed.length - 4}){" "}
                  <ChevronDown size={16} />
                </Button>
              )}
            </>
          )}
        </>
      )}

    </>
  );
}

