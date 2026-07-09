import React from "react";

/**
 * Сгенерированная ИИ картинка блюда + ОБЯЗАТЕЛЬНАЯ плашка «Изображение: ИИ».
 * Показывается везде, где есть image_url (страница рецепта, share, вид рецепта в
 * приложении). Нет image_url → компонент ничего не рендерит (вёрстка как раньше).
 *
 * Против layout shift: контейнер держит фиксированное соотношение сторон
 * (aspect-ratio), поэтому место под картинку зарезервировано до её загрузки.
 * loading=lazy, alt = название блюда.
 */
export default function RecipeImage({
  src,
  alt,
  style,
  status,
}: {
  src?: string | null;
  alt: string;
  style?: React.CSSProperties;
  // Этап 2: статус фоновой генерации картинки блюда из кэша. Пока 'generating'
  // и картинки ещё нет — показываем красивый плейсхолдер вместо пустоты.
  status?: "none" | "generating" | "ready" | "failed";
}) {
  if (!src) {
    if (status === "generating") {
      return (
        <div className="recipe-image-placeholder" style={style} aria-live="polite">
          <span>Рисуем ваше блюдо… 🎨</span>
        </div>
      );
    }
    return null;
  }
  return (
    <div className="recipe-image" style={style}>
      <img src={src} alt={alt} loading="lazy" decoding="async" width={1024} height={640} />
      <span className="recipe-image-badge" aria-label="Изображение сгенерировано искусственным интеллектом">
        Изображение: ИИ
      </span>
    </div>
  );
}
