import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

// Кэш «кто это» на ОДИН запрос.
//
// Проверка токена — это поход в Supabase, а за время одного подбора её просят
// дважды: сперва общий лимитер (checkAndConsumeAiRateLimit), следом недельный
// лимит подборов (lib/podbor.ts). Два одинаковых сетевых вызова подряд на самом
// горячем пути продукта — плата ни за что.
//
// Ключ — сам объект Request: он существует ровно один запрос, живёт в одном
// процессе и никогда не переиспользуется между пользователями. WeakMap не
// держит его в памяти: как только запрос отработал, запись уходит сама.
//
// Храним ПРОМИС, а не результат: если две проверки стартуют одновременно
// (Promise.all), обе дождутся одного и того же похода, а не двух.
const verifiedUserCache = new WeakMap<Request, Promise<string | null>>();

// Пользователь считается "залогиненным" только если фронтенд прислал
// реальный Supabase access token, который мы тут же проверяем на сервере.
// Любое поле из тела запроса (sessionId, userId и т.п.) для этого не годится —
// его легко подделать, это не проверенная сервером личность.
export async function getVerifiedUserId(req: Request): Promise<string | null> {
  const cached = verifiedUserCache.get(req);
  if (cached) return cached;

  const pending = verifyUserId(req);
  verifiedUserCache.set(req, pending);
  return pending;
}

async function verifyUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  try {
    const supabaseAdmin = createServiceRoleClient();
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// Anon-key клиент, который пробрасывает Authorization-заголовок входящего
// запроса дальше в Supabase. Без этого RLS-политики вида
// "auth.uid() = session_id" всегда видят auth.uid() = null даже для
// залогиненных пользователей — потому что обычный createClient(url, anonKey)
// не знает о JWT конкретного запроса.
export function createRequestScopedClient(req: Request) {
  const authHeader = req.headers.get("authorization");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    authHeader ? { global: { headers: { Authorization: authHeader } } } : undefined,
  );
}
