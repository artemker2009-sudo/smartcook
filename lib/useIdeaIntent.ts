"use client";

import { useMemo, useSyncExternalStore } from "react";
import { intentStore, parseIntent, type IdeaIntent } from "./ideasIntent";

// Сервер о намерении не знает — оно на устройстве. Пустая строка означает «при
// гидрации записи нет»: серверная разметка совпадает с первым клиентским
// рендером, а сразу после гидрации React перечитает настоящий снимок и
// дорисует плашку. Отдельный флаг «смонтировано» для этого не нужен — это
// ровно то, что делает useSyncExternalStore.
const serverSnapshot = () => "";

/** Последнее «собирался приготовить», если оно свежее недели. Иначе null. */
export function useIdeaIntent(): IdeaIntent | null {
  const raw = useSyncExternalStore(intentStore.subscribe, intentStore.snapshot, serverSnapshot);
  // Разбор зависит от времени, но пересчитывать его чаще, чем меняется строка,
  // незачем: неделя — не та точность, ради которой стоит будить рендер.
  return useMemo(() => parseIntent(raw), [raw]);
}
