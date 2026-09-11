import { describe, it, expect } from "vitest";
// Внутри lib/ импортируем соседей относительным путём: алиас @/ в тестах не резолвится.
import { stageFromStream, splitStreamPayload, STREAM_META_SEPARATOR } from "./photoStream";

describe("stageFromStream", () => {
  it("в начале ответа — этап «смотрю, что есть»", () => {
    expect(stageFromStream('{"no_food": false, "ingred')).toBe("look");
    expect(stageFromStream('{"no_food": false, "ingredients": ["яйцо", "молоко"')).toBe("look");
  });

  it("появился ключ dishes — этап подбора блюд", () => {
    expect(stageFromStream('{"ingredients": ["яйцо"], "uncertain": [], "dishes": ["Оме')).toBe("dishes");
  });

  it("появился ключ recipe — этап написания рецепта", () => {
    expect(
      stageFromStream('{"ingredients": [], "dishes": ["Омлет"], "recipe": {"title": "Ом'),
    ).toBe("recipe");
  });

  it("название продукта со словом dishes внутри не сдвигает этап раньше времени", () => {
    // Ключ ищется с кавычками, поэтому обычный текст в значении не считается.
    expect(stageFromStream('{"ingredients": ["соус для dishes"')).toBe("look");
  });
});

describe("splitStreamPayload", () => {
  it("делит тело на JSON модели и служебный хвост", () => {
    const body = `{"no_food":false}${STREAM_META_SEPARATOR}{"recipeId":42,"error":null}`;
    const { modelText, meta } = splitStreamPayload(body);
    expect(modelText).toBe('{"no_food":false}');
    expect(meta).toEqual({ recipeId: 42, error: null });
  });

  it("обрыв без хвоста — meta null, текст модели сохраняется", () => {
    const { modelText, meta } = splitStreamPayload('{"no_food":fal');
    expect(modelText).toBe('{"no_food":fal');
    expect(meta).toBeNull();
  });

  it("битый хвост не роняет разбор", () => {
    const { modelText, meta } = splitStreamPayload(`{"a":1}${STREAM_META_SEPARATOR}{не json`);
    expect(modelText).toBe('{"a":1}');
    expect(meta).toBeNull();
  });

  it("ошибка после начала стрима приезжает в meta", () => {
    const body = `{"partial":true}${STREAM_META_SEPARATOR}{"recipeId":null,"error":"Timeout"}`;
    expect(splitStreamPayload(body).meta).toEqual({ recipeId: null, error: "Timeout" });
  });
});
