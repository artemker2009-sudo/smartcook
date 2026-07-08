// Транслитерация заголовка (рус.) → человекочитаемый латинский slug для ЧПУ
// ссылок /articles/<slug> (SEO). Совпадает по формату с БД-констрейнтом
// articles_slug_fmt: ^[a-z0-9]+(?:-[a-z0-9]+)*$.

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya",
};

export function slugify(input: string): string {
  const lower = (input || "").toLowerCase().trim();
  let out = "";
  for (const ch of lower) {
    if (Object.prototype.hasOwnProperty.call(TRANSLIT, ch)) {
      out += TRANSLIT[ch];
    } else if (/[a-z0-9]/.test(ch)) {
      out += ch;
    } else {
      out += "-";
    }
  }
  // Схлопываем повторяющиеся дефисы и обрезаем по краям; ограничиваем длину.
  return out
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
