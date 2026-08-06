import { describe, it, expect } from "vitest";
import { parseVoiceTranscript } from "./voiceParse";

describe("parseVoiceTranscript", () => {
  it("разбивает продукты по паузам (пробелам)", () => {
    expect(parseVoiceTranscript("молоко хлеб огурцы")).toEqual(["молоко", "хлеб", "огурцы"]);
  });

  it("понимает союз «и» и запятые как разделители", () => {
    expect(parseVoiceTranscript("молоко и хлеб, огурцы")).toEqual(["молоко", "хлеб", "огурцы"]);
  });

  it("дедуплицирует повторы", () => {
    expect(parseVoiceTranscript("молоко молоко хлеб")).toEqual(["молоко", "хлеб"]);
  });

  it("выкидывает служебные слова и одиночные буквы", () => {
    expect(parseVoiceTranscript("ну вот молоко а хлеб")).toEqual(["молоко", "хлеб"]);
  });

  it("пустая строка и мусор → пустой массив", () => {
    expect(parseVoiceTranscript("")).toEqual([]);
    expect(parseVoiceTranscript("   ")).toEqual([]);
    expect(parseVoiceTranscript("и")).toEqual([]);
  });

  it("нормализует регистр и убирает пунктуацию", () => {
    expect(parseVoiceTranscript("Молоко. Хлеб!")).toEqual(["молоко", "хлеб"]);
  });
});
