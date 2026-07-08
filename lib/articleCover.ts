// Обложки статей в стиле Notion (задача Z-3): вместо фото — пастельный цвет +
// типографика + крупная эмодзи/иконка. Цвет детерминированно по хэшу slug из
// палитры 5 сдержанных тонов (в дизайн-языке проекта, без пестроты).
//
// Обычный (НЕ "use client") модуль: используется и серверной страницей статьи,
// и клиентскими карточками — как lib/articles.ts (см. грабли с client-const).

export type CoverTone = {
  key: string;
  bg: string; // пастельный фон плитки
  fg: string; // насыщенный цвет заголовка/иконки — контраст на пастели
};

const TONES: CoverTone[] = [
  { key: "green", bg: "#ecfdf5", fg: "#047857" },
  { key: "blue", bg: "#eff6ff", fg: "#1d4ed8" },
  { key: "amber", bg: "#fffbeb", fg: "#b45309" },
  { key: "rose", bg: "#fff1f2", fg: "#be123c" },
  { key: "violet", bg: "#f5f3ff", fg: "#6d28d9" },
];

export function coverTone(slug: string): CoverTone {
  const s = slug || "";
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return TONES[hash % TONES.length];
}
