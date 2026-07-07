"use client";

import { Suspense } from "react";
import SearchApp from "@/components/SearchApp";

// Раздел «Поиск» — весь текущий поисковый апп (фото/текст, фильтры, профиль
// вкуса, история/избранное) как реальный роут /search. Suspense — на случай
// клиентских хуков, читающих URL, чтобы сборка не ругалась.
export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchApp />
    </Suspense>
  );
}
