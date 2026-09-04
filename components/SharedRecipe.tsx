"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Clock,
  Flame,
  ChefHat,
  Share2,
  Camera,
  ArrowRight,
  Volume2,
} from "lucide-react";
import { formatTime, formatCookingTime, formatCalories, scaleAmount, cleanText } from "@/lib/utils";
import { shareOrCopy } from "@/lib/share";
import type { RecipeData } from "@/lib/types";
import CookMode from "@/components/CookMode";
import AiRecipeDisclaimer from "@/components/AiRecipeDisclaimer";
import RecipeImage from "@/components/RecipeImage";
import KuperBuyBlock from "@/components/KuperBuyBlock";

/**
 * Лёгкий read-only просмотр расшаренного рецепта. Рендерится на выделенном
 * серверном маршруте /recipe/[id] (задача T): данные приходят пропом из
 * серверного компонента → рецепт есть в HTML сразу, без ожидания монолита
 * SearchApp (~800 КБ) и клиентской дозагрузки. Интерактив, требующий аккаунта
 * (спросить шефа, избранное, публикация фото), сюда не тащим — гость читает
 * рецепт и конвертируется в «своё блюдо» через CTA. Классы те же, что в
 * RecipeView, чтобы вид совпадал.
 */
export default function SharedRecipe({ recipe }: { recipe: RecipeData }) {
  const [cooking, setCooking] = useState(false);

  const share = () =>
    shareOrCopy({
      title: recipe.title,
      text: `${recipe.title} — рецепт из SmartCook`,
      url: typeof window !== "undefined" ? window.location.href : "",
      goal: "share_recipe",
    });

  const detailed = recipe.detailed_ingredients || [];
  const hasSteps = Array.isArray(recipe.steps) && recipe.steps.filter((s) => (s || "").trim()).length > 0;

  return (
    <div className="container">
      <header className="shared-recipe-topbar">
        <Link href="/" className="shared-recipe-brand">SmartCook</Link>
        <Link href="/search?focus=photo" className="shared-recipe-open">
          Открыть приложение <ArrowRight size={16} />
        </Link>
      </header>

      <article className="card" style={{ marginTop: "var(--space-3)" }}>
        <RecipeImage src={recipe.image_url} alt={recipe.title} />
        <h1 className="recipe-title" style={{ marginBottom: "var(--space-2)", wordBreak: "break-word" }}>
          {recipe.title}
        </h1>

        {recipe.description && (
          <p
            style={{
              fontSize: "var(--font-size-body)",
              color: "var(--color-text-secondary)",
              lineHeight: 1.5,
              margin: "0 0 var(--space-3) 0",
            }}
          >
            {recipe.description}
          </p>
        )}

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

        {/* App Store 1.4.1 — та же строка, что в карточке рецепта (RecipeView).
            Расшаренный рецепт — это тот же ИИ-текст, просто на своём маршруте;
            предупреждение об аллергенах обязано быть и здесь. */}
        <AiRecipeDisclaimer />

        <button type="button" onClick={share} className="recipe-share-btn">
          <Share2 size={18} /> Поделиться рецептом
        </button>

        {detailed.length > 0 && (
          <>
            <div className="ing-box">
              <h3 style={{ marginTop: 0, marginBottom: "15px" }}>Ингредиенты</h3>
              {detailed.map((ing, i) => (
                <div key={i} className="ing-row">
                  <span>{ing.name}</span>
                  <span className="ing-val">{scaleAmount(ing.amount, 1)}</span>
                </div>
              ))}
            </div>
            {/* Монетизация: заказ продуктов по рецепту через Купер (CPA). */}
            <KuperBuyBlock ingredients={detailed.map((ing) => ing.name)} />
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
          {recipe.steps?.map((step, i) => (
            <div key={i} className="step-row">
              <div className="step-num">{i + 1}</div>
              <div className="step-text">{cleanText(step)}</div>
            </div>
          ))}
        </div>

        {/* Конверсия гостя: сделать своё блюдо. Тот же вход, что CTA на Главной. */}
        <div className="shared-recipe-cta">
          <div className="shared-recipe-cta-title">Готовите из того, что есть дома?</div>
          <div className="shared-recipe-cta-text">
            Сфотографируйте свои продукты — SmartCook подберёт рецепт за минуту.
          </div>
          <Link href="/search?focus=photo" className="btn-primary shared-recipe-cta-btn">
            <Camera size={20} /> Приготовить своё
          </Link>
        </div>
      </article>

      {cooking && (
        <CookMode
          title={recipe.title}
          steps={recipe.steps || []}
          ingredients={detailed}
          cookingTimeMinutes={recipe.cooking_time_minutes}
          onClose={() => setCooking(false)}
          // Гость на /recipe/[id]: публикация фото требует аккаунта — ведём в
          // приложение к готовому флоу «Приготовили? Покажите» (тот же вход).
          onCookedPhoto={() => {
            window.location.href = "/search?focus=photo";
          }}
        />
      )}
    </div>
  );
}
