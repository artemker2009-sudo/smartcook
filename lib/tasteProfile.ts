import { supabase } from "@/lib/supabase";

// Профиль вкуса (аллергии и нелюбимые продукты) живёт в localStorage у всех, а
// у залогиненных ещё и в user_metadata аккаунта. Отдельной таблицы нет.
//
// Этот модуль существует из-за конкретной потери. Перенос профиля в аккаунт был
// подключён ТОЛЬКО в SearchApp. У того, кто регистрировался на /profile, эффект
// ProfileApp по появлению user делает
//     setAllergies(user.user_metadata.allergies || [])
// — у свежего аккаунта метаданные пустые, состояние обнулялось, и при первом же
// добавлении/удалении savePreferences записывал укороченный список обратно в
// localStorage. То есть аллергии, набранные до регистрации, не «не переезжали»,
// а СТИРАЛИСЬ. Для аллергий это вопрос безопасности еды, поэтому перенос обязан
// жить в общей точке авторизации (useAuthModal), а не в одном из экранов.

export const ALLERGIES_KEY = "sc_allergies";
export const DISLIKES_KEY = "sc_dislikes";

function readLocalList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function accountList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

type AccountUser = {
  user_metadata?: { allergies?: unknown; dislikes?: unknown } | null;
};

/**
 * МЁРДЖ профиля вкуса из localStorage в аккаунт при входе/регистрации.
 *
 * Именно мёрдж, а не перезапись в любую сторону: то, что уже сохранено в
 * аккаунте, остаётся; добавляется только новое с устройства. Ни одна ветка
 * здесь не укорачивает список — потерять аллергию нельзя.
 *
 * Запись в аккаунт идёт только когда localStorage реально что-то добавил: лишний
 * updateUser дёргает onAuthStateChange у всех подписчиков без всякой пользы.
 */
export async function mergeTasteProfileIntoAccount(accountUser: AccountUser | null | undefined) {
  try {
    const localAllergies = readLocalList(ALLERGIES_KEY);
    const localDislikes = readLocalList(DISLIKES_KEY);
    const accAllergies = accountList(accountUser?.user_metadata?.allergies);
    const accDislikes = accountList(accountUser?.user_metadata?.dislikes);

    const allergies = Array.from(new Set([...accAllergies, ...localAllergies]));
    const dislikes = Array.from(new Set([...accDislikes, ...localDislikes]));

    if (allergies.length !== accAllergies.length || dislikes.length !== accDislikes.length) {
      await supabase.auth.updateUser({ data: { allergies, dislikes } });
    }

    // Локальную копию приводим к слитому состоянию — она источник для анонимных
    // экранов и для следующего запуска.
    try {
      localStorage.setItem(ALLERGIES_KEY, JSON.stringify(allergies));
      localStorage.setItem(DISLIKES_KEY, JSON.stringify(dislikes));
    } catch {}

    return { allergies, dislikes };
  } catch {
    return null;
  }
}
