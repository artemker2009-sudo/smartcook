// Общие тип и список колонок для «Кухонных заметок».
//
// ВАЖНО: держим их в обычном (НЕ "use client") модуле. Раньше ARTICLE_COLUMNS
// экспортировался из ArticlesBoard.tsx ("use client"), и при импорте в серверный
// компонент (app/page.tsx, /articles) Next отдавал не строку, а client-reference
// заглушку → select-параметр ломался, PostgREST отвечал 400, и заметки
// «пропадали» из SSR. Значения, которые нужны и серверу, и клиенту, обязаны
// жить в модуле без "use client".

export type Article = {
  id: string;
  created_at: string;
  published_at: string | null;
  title: string;
  slug: string;
  excerpt: string;
  emoji_icon: string | null;
  read_minutes: number;
  likes_count: number;
  liked_by_me: boolean;
};

export const ARTICLE_COLUMNS =
  "id,created_at,published_at,title,slug,excerpt,emoji_icon,read_minutes,likes_count,liked_by_me";
