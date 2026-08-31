// Разбор голосового ввода продуктов в список покупок. Пользователь называет
// продукты подряд («молоко… хлеб… огурцы»); разделители — паузы, союз «и»,
// запятые.
//
// Чистая функция без побочных эффектов — легко тестируется (voiceParse.test.ts).
// ВАЖНО: одна фраза = одна позиция. Раньше транскрипт резался по пробелам, и
// «куриное филе охлаждённое» превращалось в три позиции — это и был баг
// дробления. Теперь режем ТОЛЬКО по явным разделителям, а количество и
// прилагательные остаются внутри позиции («молоко два литра»).
//
// Границы фраз при живой речи даёт сам браузер: с continuous=true каждая пауза
// закрывает отдельный финальный результат, и вызывающий (useVoiceInput) разбирает
// каждый такой результат этой функцией по отдельности.

// Служебные слова: чистим их ТОЛЬКО с краёв фразы («ещё купи молоко» → «молоко»),
// а внутри не трогаем, чтобы не разорвать название продукта.
const EDGE_STOPWORDS = new Set([
  "и", "да", "а", "но", "ещё", "еще", "потом", "так", "ну", "это", "вот", "же", "бы",
  "купи", "купить", "надо", "нужно", "возьми", "взять", "добавь", "запиши", "плюс",
]);

// Явные разделители позиций: запятая, перевод строки, « и », « ещё », « потом ».
const SPLIT_RE = /[,\n]|\s+(?:и|ещё|еще|потом|также)\s+/g;

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

function trimEdges(words: string[]): string[] {
  let start = 0;
  let end = words.length;
  while (start < end && EDGE_STOPWORDS.has(words[start])) start++;
  while (end > start && EDGE_STOPWORDS.has(words[end - 1])) end--;
  return words.slice(start, end);
}

export function parseVoiceTranscript(text: string): string[] {
  if (typeof text !== "string" || !text.trim()) return [];

  const parts = sentenceBreaksToCommas(text.toLowerCase())
    .replace(/[:«»"()]/g, " ") // остальные знаки препинания → пробел
    .split(SPLIT_RE);

  const out: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    if (!part) continue;
    const words = trimEdges(part.split(/\s+/).filter(Boolean));
    const name = words.join(" ").trim();
    if (name.length < 2) continue; // отсекаем «э» и одиночные буквы-паразиты
    if (seen.has(name)) continue; // дедуп в пределах одной фразы
    seen.add(name);
    out.push(name);
  }

  return out;
}
