"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChefHat, Heart, Minus, Plus, Share2 } from "lucide-react";
import { toast } from "sonner";
import CookMode from "@/components/CookMode";
import IdeaCardLink from "@/components/IdeaCardLink";
import AiRecipeDisclaimer from "@/components/AiRecipeDisclaimer";
import { reachGoal } from "@/lib/metrika";
import { copyText } from "@/lib/clipboard";
import { shareUrl } from "@/lib/site";
import { addNamesToDefaultList } from "@/lib/shoppingLists";
import type { IdeaCard } from "@/lib/ideasFeed";
import type { IdeaRecipeData } from "@/lib/ideaRecipe";
import {
  SERVINGS_MAX,
  SERVINGS_MIN,
  clampServings,
  formatServings,
  ingredientLine,
  scaleIdeaAmount,
} from "@/lib/ideaServings";
import { putHave, readHave, writeHave } from "@/lib/ideasLocal";
import { favoritesStore } from "@/lib/ideasFavorites";
import { useIdeaFavorites } from "@/lib/useIdeaFavorites";

// Имя списка для человека, у которого нет ни одного. Молча, без вопросов: на
// экране рецепта диалог «как назвать список» — лишний шаг ни о чём. То же имя,
// что на экране рецепта из поиска.
const FALLBACK_LIST_NAME = "Мой список";

export default function IdeaRecipe({
  recipe,
  family,
  similar,
}: {
  recipe: IdeaRecipeData;
  family: IdeaCard[];
  similar: IdeaCard[];
}) {
  const router = useRouter();

  const [servings, setServings] = useState(recipe.servings);
  // Текущее число порций дублируется в ref, и обработчик читает ЕГО.
  //
  // Поймано живым прогоном: три быстрых тапа по «+» давали не +3, а +1. Между
  // синхронными нажатиями React не успевает перерисовать компонент, поэтому все
  // три обработчика видят в замыкании одно и то же старое значение и считают
  // от него. Функция-обновлятор (setServings(prev => ...)) читала бы свежее
  // значение, но внутрь неё нельзя класть reachGoal: такие функции обязаны
  // быть чистыми, React выполняет их повторно. Поэтому ref.
  const servingsRef = useRef(recipe.servings);
  const [have, setHave] = useState<Set<string>>(new Set());
  const [addedListId, setAddedListId] = useState<string | null>(null);
  const [cooking, setCooking] = useState(false);

  // Галочки «есть дома» читаются из localStorage, то есть НА СЕРВЕРЕ
  // неизвестны. Первый клиентский рендер обязан совпасть с серверным, иначе
  // React выбросит разметку целиком. Поэтому «смонтировано» — отдельный флаг,
  // и до него галочки сняты.
  const [mounted, setMounted] = useState(false);

  // Избранное — НЕ копия в состоянии, а подписка на хранилище. Раньше здесь
  // был useState, и сердечко показывало то, что сказал обработчик нажатия, а
  // не то, что реально записалось: при упавшей записи оно закрашивалось, а
  // в хранилище не было ничего. Теперь сердечко закрашено ровно тогда, когда
  // рецепт действительно лежит в избранном. Гидрацию хук держит сам: до неё
  // снимок пустой, как на сервере.
  const favorites = useIdeaFavorites();
  const favorite = favorites.has(recipe.slug);

  useEffect(() => {
    setHave(new Set(readHave()[recipe.slug] ?? []));
    setMounted(true);
    reachGoal("ideas_recipe_view", { slug: recipe.slug });
  }, [recipe.slug]);

  // Количества под выбранное число порций. Считаем один раз на изменение, а не
  // в каждой строке при каждом рендере.
  const scaled = useMemo(
    () =>
      recipe.ingredients.map((ing) => ({
        name: ing.name,
        amount: scaleIdeaAmount(ing.amount, servings, recipe.servings),
      })),
    [recipe.ingredients, recipe.servings, servings],
  );

  const missing = useMemo(() => scaled.filter((ing) => !have.has(ing.name)), [scaled, have]);
  const allAtHome = mounted && missing.length === 0;

  const changeServings = (delta: number) => {
    const value = clampServings(servingsRef.current + delta);
    if (value === servingsRef.current) return;
    servingsRef.current = value;
    setServings(value);
    reachGoal("ideas_servings_change", { servings: value });
  };

  const toggleHave = (name: string) => {
    setHave((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      writeHave(putHave(readHave(), recipe.slug, [...next]));
      return next;
    });
  };

  const toggleFavorite = () => {
    const result = favoritesStore.toggle(recipe.slug);
    if (!result.ok) {
      // Отчёт в error_reports уже ушёл из хранилища. Человеку говорим честно:
      // успехом притворяться нельзя, иначе он найдёт пустое избранное потом
      // и решит, что оно сломано вообще.
      toast.error("Не удалось сохранить избранное на этом устройстве");
      return;
    }
    reachGoal("ideas_fav", { on: result.on ? 1 : 0 });
    toast.success(result.on ? "Добавлено в избранное" : "Убрано из избранного");
  };

  const addToList = () => {
    if (missing.length === 0) return;
    const result = addNamesToDefaultList(
      missing.map((ing) => ingredientLine(ing.name, ing.amount)),
      { source: recipe.title, fallbackListName: FALLBACK_LIST_NAME },
    );

    if (result.added === 0 && result.limited) {
      toast.error("Список покупок полон");
      return;
    }

    reachGoal("ideas_add_to_list", { count: result.added });
    setAddedListId(result.listId);
  };

  const openShopping = () => {
    window.location.href = addedListId ? `/shopping/${addedListId}` : "/shopping";
  };

  const startCooking = () => {
    reachGoal("ideas_cook_start", { slug: recipe.slug });
    setCooking(true);
  };

  // Прямой заход по ссылке из мессенджера истории не имеет, и router.back()
  // увёл бы человека из приложения. Запасной выход — лента.
  const goBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/ideas");
  }, [router]);

  const share = async () => {
    const url = shareUrl(`/ideas/${recipe.slug}`);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: recipe.title, url });
        return;
      }
    } catch {
      // Человек закрыл системное окно — это не ошибка, просто молчим.
      return;
    }
    if (await copyText(url)) toast.success("Ссылка скопирована");
  };

  const portrait = recipe.imageAspect === "portrait";

  return (
    <div className="idea-page">
      <div className="idea-hero">
        <img
          src={recipe.imageUrl}
          alt={recipe.title}
          width={1024}
          height={portrait ? 1536 : 1024}
          // Картинка — главный элемент первого экрана, грузим её приоритетно.
          fetchPriority="high"
          decoding="async"
          className={`idea-hero-img${portrait ? " idea-hero-img-portrait" : ""}`}
        />
        <button type="button" className="idea-round idea-round-back" onClick={goBack} aria-label="Назад">
          <ArrowLeft size={22} />
        </button>
        <div className="idea-hero-actions">
          <button type="button" className="idea-round" onClick={share} aria-label="Поделиться">
            <Share2 size={20} />
          </button>
          <button
            type="button"
            className={`idea-round${favorite ? " is-on" : ""}`}
            onClick={toggleFavorite}
            aria-pressed={favorite}
            aria-label={favorite ? "Убрать из избранного" : "В избранное"}
          >
            <Heart size={20} fill={favorite ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      <p className="idea-hero-note">Изображение создано ИИ. Ваше блюдо может выглядеть иначе.</p>

      <h1 className="idea-title">{recipe.title}</h1>

      <div className="idea-badges">
        {recipe.cookingTimeMinutes > 0 && (
          <span className="idea-badge">{recipe.cookingTimeMinutes} мин</span>
        )}
        {recipe.meals.map((meal) => (
          <span className="idea-badge" key={meal}>
            {meal}
          </span>
        ))}
      </div>

      {recipe.description && <p className="idea-description">{recipe.description}</p>}

      <div className="idea-servings">
        <button
          type="button"
          className="idea-step-btn"
          onClick={() => changeServings(-1)}
          disabled={servings <= SERVINGS_MIN}
          aria-label="Меньше порций"
        >
          <Minus size={20} />
        </button>
        <span className="idea-servings-value" aria-live="polite">
          {formatServings(servings)}
        </span>
        <button
          type="button"
          className="idea-step-btn"
          onClick={() => changeServings(1)}
          disabled={servings >= SERVINGS_MAX}
          aria-label="Больше порций"
        >
          <Plus size={20} />
        </button>
      </div>

      <section className="idea-section">
        <h2 className="idea-h2">Продукты</h2>
        <p className="idea-hint">Отметьте то, что уже есть дома</p>

        <ul className="idea-products">
          {scaled.map((ing) => {
            const checked = have.has(ing.name);
            return (
              <li key={ing.name} className={`idea-product${checked ? " is-have" : ""}`}>
                <label className="idea-product-label">
                  <input
                    type="checkbox"
                    className="idea-product-check"
                    checked={checked}
                    onChange={() => toggleHave(ing.name)}
                  />
                  <span className="idea-product-name">{ing.name}</span>
                  <span className="idea-product-qty">{ing.amount}</span>
                </label>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          className="btn-secondary idea-add"
          onClick={addToList}
          disabled={allAtHome}
        >
          {allAtHome ? "Всё есть дома" : `Добавить в список · ${missing.length} из ${scaled.length}`}
        </button>

        {addedListId && (
          <div className="idea-added">
            <span>Добавлено в список</span>
            <button type="button" className="idea-added-link" onClick={openShopping}>
              Открыть список
            </button>
          </div>
        )}
      </section>

      <section className="idea-section">
        <h2 className="idea-h2">Как готовить</h2>
        <ol className="idea-steps">
          {recipe.steps.map((step, index) => (
            <li className="idea-step" key={index}>
              <span className="idea-step-num">{index + 1}</span>
              <span className="idea-step-text">{step}</span>
            </li>
          ))}
        </ol>
        <button type="button" className="btn-primary idea-cook" onClick={startCooking}>
          <ChefHat size={20} /> Готовим!
        </button>
      </section>

      <AiRecipeDisclaimer className="idea-disclaimer" />

      {family.length > 0 && (
        <section className="idea-section">
          <h2 className="idea-h2">Другие варианты</h2>
          <div className="idea-related">
            {family.map((card) => (
              <IdeaCardLink key={card.slug} card={card} />
            ))}
          </div>
        </section>
      )}

      {similar.length > 0 && (
        <section className="idea-section">
          <h2 className="idea-h2">Похожие идеи</h2>
          <div className="idea-related">
            {similar.map((card) => (
              <IdeaCardLink key={card.slug} card={card} />
            ))}
          </div>
        </section>
      )}

      {cooking && (
        <CookMode
          title={recipe.title}
          steps={recipe.steps}
          // В режим готовки уходят ПЕРЕСЧИТАННЫЕ количества: человек выбрал
          // шесть порций — на плите должно быть шесть, а не четыре.
          ingredients={scaled}
          cookingTimeMinutes={recipe.cookingTimeMinutes}
          onClose={() => setCooking(false)}
        />
      )}
    </div>
  );
}
