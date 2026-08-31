// Разбор голосового ввода продуктов в список покупок.
//
// Чистая функция без побочных эффектов — легко тестируется (voiceParse.test.ts).
//
// История: сначала транскрипт резался по пробелам (каждое слово = продукт) —
// «куриное филе охлаждённое» превращалось в три позиции. Потом резали только по
// явным разделителям — и слиплась диктовка без пауз («молоко огурцы» одной
// позицией). Теперь границу позиций определяет СЛОВАРЬ продуктов
// (lib/productSplit), одинаково для голоса и для текста; здесь остаётся только
// разбор явных разделителей и дедупликация.

import { splitPhraseIntoItems } from "./productSplit";

// Явные разделители позиций: запятая и перевод строки.
const SPLIT_RE = /[,\n]/g;

// Точка/восклицательный/вопросительный — конец фразы, тоже разделитель. Но не
// внутри числа: «1.5 кг» должно остаться одной позицией. Лукбехайнд не
// используем — он падает синтаксической ошибкой на старых iOS.
function sentenceBreaksToCommas(text: string): string {
  return text.replace(/[.!?;]/g, (mark, offset: number, source: string) => {
    const prev = source[offset - 1] ?? "";
    const next = source[offset + 1] ?? "";
    return /\d/.test(prev) && /\d/.test(next) ? mark : ",";
  });
}

export function parseVoiceTranscript(text: string): string[] {
  if (typeof text !== "string" || !text.trim()) return [];

  const parts = sentenceBreaksToCommas(text.toLowerCase())
    .replace(/[:«»"()]/g, " ") // остальные знаки препинания → пробел
    .split(SPLIT_RE);

  const out: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    for (const name of splitPhraseIntoItems(part)) {
      if (name.length < 2) continue; // «э» и одиночные буквы-паразиты
      if (seen.has(name)) continue; // дедуп в пределах одной диктовки
      seen.add(name);
      out.push(name);
    }
  }

  return out;
}
