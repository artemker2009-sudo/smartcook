"use client";

import { useMemo, useSyncExternalStore } from "react";
import { favoritesStore, parseFavorites } from "./ideasFavorites";

// Сервер избранного не знает — оно лежит на устройстве. Пустая строка здесь
// означает «на сервере и при гидрации избранного нет»: так серверная разметка
// совпадает с первым клиентским рендером, а сразу после гидрации React сам
// перечитает настоящий снимок и перерисует. Отдельный флаг «смонтировано»
// для этого не нужен — это ровно то, что делает useSyncExternalStore.
const serverSnapshot = () => "";

/** Избранное каталога, всегда свежее. Множество slug'ов. */
export function useIdeaFavorites(): Set<string> {
  const raw = useSyncExternalStore(
    favoritesStore.subscribe,
    favoritesStore.snapshot,
    serverSnapshot,
  );
  return useMemo(() => new Set(parseFavorites(raw)), [raw]);
}
