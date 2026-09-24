// Серверное зеркало исправленных отделов (таблица user_product_departments).
// Клиент пишет в неё напрямую под своим JWT — RLS пускает только к своим
// строкам (supabase_user_product_departments.sql).
//
// ИСТОЧНИК ПРАВДЫ — устройство, как и у списков покупок. Отсюда те же правила:
//   1) исправление сначала ложится в localStorage, интерфейс не ждёт сети;
//   2) неудача синхронизации молчит — ни тостов, ни блокировок;
//   3) ни одна ветка не удаляет локальное исправление из-за ответа сервера.
//
// Отличие от lib/shoppingSync.ts — в цене ошибки, и поэтому здесь НЕТ ни карты
// сведённых версий, ни очереди, ни копий при расхождении. Там расходятся списки
// покупок, и потеря списка недопустима; здесь расходится словарь предпочтений,
// и худшее, что бывает при конфликте, — «хумус» окажется в том отделе, куда его
// положили на другом телефоне. Строить ради этого вторую машину слияния значило
// бы усложнить систему там, где нечего терять.
//
// Часы устройств не участвуют в сравнении: сразу после отправки локальная
// отметка времени заменяется серверной (updated_at ставит триггер в БД), и обе
// стороны сравниваются по одним часам.
//
// Гость в эту таблицу не ходит вовсе: исправления живут на устройстве.

import { supabase } from "./supabase";
import { FEATURE_SHOPPING_SYNC } from "./features";
import { isDepartment } from "./shoppingDepartments";
import {
  MAX_DEPARTMENT_PINS,
  loadPins,
  mergePins,
  pinKey,
  savePins,
  type DepartmentPin,
} from "./shoppingDepartmentPins";

const TABLE = "user_product_departments";

type Row = { name: string; department: string; updated_at: string };

function toPin(row: Row): DepartmentPin | null {
  const name = pinKey(row.name);
  if (!name || !isDepartment(row.department)) return null;
  const at = Date.parse(row.updated_at);
  return { name, department: row.department, at: Number.isFinite(at) ? at : 0 };
}

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Исправления аккаунта, самые свежие. Больше капа устройству не нужно. */
async function pullPins(): Promise<DepartmentPin[] | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("name,department,updated_at")
    .order("updated_at", { ascending: false })
    .limit(MAX_DEPARTMENT_PINS);
  if (error) {
    // Сюда же попадает «таблица не создана» (PGRST205), если миграцию ещё не
    // прогнали: раздел от этого не ломается, исправления просто остаются
    // локальными.
    console.warn("[departmentPins] pull failed", error.message);
    return null;
  }
  return ((data ?? []) as Row[]).map(toPin).filter((p): p is DepartmentPin => p !== null);
}

/** Отправка. Возвращает серверное время по каждой записи или null при неудаче. */
async function pushPins(userId: string, pins: DepartmentPin[]): Promise<Map<string, number> | null> {
  if (pins.length === 0) return new Map();
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      pins.map((p) => ({ user_id: userId, name: p.name, department: p.department })),
      { onConflict: "user_id,name" },
    )
    .select("name,updated_at");
  if (error || !data) {
    console.warn("[departmentPins] push failed", error?.message);
    return null;
  }
  const out = new Map<string, number>();
  for (const row of data as Array<{ name: string; updated_at: string }>) {
    const at = Date.parse(row.updated_at);
    if (Number.isFinite(at)) out.set(pinKey(row.name), at);
  }
  return out;
}

let running = false;

/**
 * Полный цикл: забрать серверное → свести → отправить расхождения.
 * Best-effort, исключений не бросает.
 *
 * Порядок тот же, что у списков, и переставлять его нельзя: сначала забрать,
 * потом свести, и только потом отправлять.
 */
export async function syncDepartmentPins(reason: string): Promise<void> {
  if (!FEATURE_SHOPPING_SYNC) return;
  if (typeof window === "undefined") return;
  if (running) return;
  running = true;

  try {
    const userId = await currentUserId();
    if (!userId) return; // гость: исправления живут на устройстве

    const remote = await pullPins();
    if (!remote) return; // сеть моргнула или таблицы ещё нет

    // Перечитываем ПОСЛЕ сетевого ожидания: человек мог поправить отдел, пока
    // шёл запрос, и слияние поверх устаревшего набора потеряло бы эту правку.
    const remoteByName = new Map(remote.map((p) => [p.name, p]));
    const merged = mergePins(loadPins(), remote).map((pin) => {
      const row = remoteByName.get(pin.name);
      // Отдел тот же — берём серверное время, чтобы дальше сравнивать по одним
      // часам. Отдел другой — наше исправление свежее, время своё, оно уедет.
      return row && row.department === pin.department ? { ...pin, at: row.at } : pin;
    });

    const toPush = merged.filter((pin) => remoteByName.get(pin.name)?.department !== pin.department);
    const serverTimes = await pushPins(userId, toPush);

    savePins(
      serverTimes
        ? merged.map((pin) => {
            const at = serverTimes.get(pin.name);
            return at ? { ...pin, at } : pin;
          })
        : merged,
    );

    if (toPush.length > 0) {
      console.info(`[departmentPins] ${reason}: отправлено исправлений: ${toPush.length}`);
    }
  } catch (e) {
    console.warn("[departmentPins] cycle failed", e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

/**
 * Перенос исправлений в аккаунт сразу после входа/регистрации.
 *
 * Живёт рядом с переносом списков покупок в useAuthModal — по той же причине:
 * хук зовут из четырёх мест, и всё, что подключено к одному экрану, молча не
 * срабатывает у тех, кто регистрируется на другом.
 */
export function syncDepartmentPinsAfterAuth(): void {
  if (!FEATURE_SHOPPING_SYNC) return;
  // Намеренно не ждём: после регистрации показывается код восстановления, и
  // задерживать этот экран сетевым запросом нельзя.
  void syncDepartmentPins("auth");
}
