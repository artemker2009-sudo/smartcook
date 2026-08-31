import { describe, it, expect } from "vitest";
import { parseVoiceTranscript } from "./voiceParse";

describe("parseVoiceTranscript", () => {
  it("одна фраза = одна позиция (не дробит по пробелам)", () => {
    expect(parseVoiceTranscript("куриное филе охлаждённое")).toEqual(["куриное филе охлаждённое"]);
    expect(parseVoiceTranscript("молоко два литра")).toEqual(["молоко два литра"]);
  });

  // Диктовка предложением без пауз — то, на чём провалилась приёмка.
  it("диктовка без пауз режется по словарю продуктов", () => {
    expect(parseVoiceTranscript("молоко огурцы")).toEqual(["молоко", "огурцы"]);
    expect(parseVoiceTranscript("яйца молоко 3 л молоко 2 л")).toEqual([
      "яйца",
      "молоко 3 л",
      "молоко 2 л",
    ]);
    expect(parseVoiceTranscript("гречка макароны тефтели")).toEqual([
      "гречка",
      "макароны",
      "тефтели",
    ]);
    expect(parseVoiceTranscript("молоко яйца хлеб тефтели")).toEqual([
      "молоко",
      "яйца",
      "хлеб",
      "тефтели",
    ]);
  });

  it("понимает союз «и» и запятые как разделители", () => {
    expect(parseVoiceTranscript("молоко и хлеб, огурцы")).toEqual(["молоко", "хлеб", "огурцы"]);
  });

  it("«ещё» и «потом» между продуктами тоже делят фразу", () => {
    expect(parseVoiceTranscript("сметана ещё творог потом кефир")).toEqual(["сметана", "творог", "кефир"]);
  });

  it("дедуплицирует повторы", () => {
    expect(parseVoiceTranscript("молоко, молоко, хлеб")).toEqual(["молоко", "хлеб"]);
  });

  it("чистит служебные слова с краёв, но не рвёт середину", () => {
    expect(parseVoiceTranscript("ну вот молоко")).toEqual(["молоко"]);
    expect(parseVoiceTranscript("купи батон нарезной")).toEqual(["батон нарезной"]);
  });

  it("пустая строка и мусор → пустой массив", () => {
    expect(parseVoiceTranscript("")).toEqual([]);
    expect(parseVoiceTranscript("   ")).toEqual([]);
    expect(parseVoiceTranscript("и")).toEqual([]);
  });

  it("нормализует регистр, точка в конце фразы делит позиции", () => {
    expect(parseVoiceTranscript("Молоко. Хлеб!")).toEqual(["молоко", "хлеб"]);
  });

  it("точка внутри числа позицию не рвёт", () => {
    expect(parseVoiceTranscript("сыр 1.5 кг")).toEqual(["сыр 1.5 кг"]);
  });
});
