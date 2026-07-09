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
}: {
  src?: string | null;
  alt: string;
  style?: React.CSSProperties;
}) {
  if (!src) return null;
  return (
    <div className="recipe-image" style={style}>
      <img src={src} alt={alt} loading="lazy" decoding="async" width={1024} height={640} />
      <span className="recipe-image-badge" aria-label="Изображение сгенерировано искусственным интеллектом">
        Изображение: ИИ
      </span>
    </div>
  );
}
