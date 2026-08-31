// Уведомление участников общего списка о том, что данные изменились.
//
// НЕ postgres_changes: RLS на shared_*-таблицах намеренно блокирует anon SELECT
// (supabase_shared_shopping_lists.sql), а Realtime фильтрует WAL-события через
// RLS роли подписчика — до анонимного клиента они просто не долетят.
//
// Вместо этого Broadcast: лёгкий пинг БЕЗ содержимого, клиент в ответ дёргает
// GET и получает актуальный снимок. Сервер остаётся единственным источником
// истины, конфликт «двое чиркнули один пункт» решает последняя запись в БД.
//
// ПОЧЕМУ HTTP, А НЕ КАНАЛ supabase-js. Первая версия поднимала канал,
// дожидалась SUBSCRIBED и только потом слала send(). На замере это стоило
// 2.8–6 секунд на КАЖДУЮ запись: рукопожатие WebSocket целиком попадало внутрь
// запроса. В проде на Vercel было бы ещё хуже — каждый вызов роута это новая
// лямбда, то есть новое соединение, переиспользовать нечего.
//
// У Realtime есть HTTP-эндпоинт для ровно этого случая: один POST с
// сервис-ролью, без сокета и без состояния. Для serverless это правильная
// форма, и она же убирает ожидание из времени ответа пользователю.
//
// Best-effort: сбой или таймаут здесь НЕ должен ронять мутацию, которая уже
// записана в БД. В худшем случае участники не получат мгновенный пинг и
// увидят изменения при следующем открытии списка либо при возврате во вкладку
// (SharedShoppingListView сверяется на visibilitychange).

export type SharedListBroadcastKind = "items" | "members" | "list";

const BROADCAST_TIMEOUT_MS = 2000;

export function sharedListChannelName(listId: string): string {
  return `shared-list:${listId}`;
}

export async function broadcastSharedListChanged(
  listId: string,
  kind: SharedListBroadcastKind,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("[sharedShopping] broadcast skipped: no supabase credentials");
    return;
  }

  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: sharedListChannelName(listId),
            event: "changed",
            payload: { kind, updatedAt: new Date().toISOString() },
          },
        ],
      }),
      signal: AbortSignal.timeout(BROADCAST_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error("[sharedShopping] broadcast failed", res.status, await res.text().catch(() => ""));
    }
  } catch (error) {
    console.error("[sharedShopping] broadcast failed", error);
  }
}
