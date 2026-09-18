// Тесты слияния личных списков. Здесь проверяется красная линия задачи: ни
// один список ни у кого не теряется — ни при обновлении, ни при первом входе,
// ни при конфликте. Сценарии названы буквами из §6 разведки.
//
// Импорты соседей по lib — относительным путём: алиаса `@/` в тестах нет.

import { describe, expect, it } from "vitest";

import type { ShoppingListRecord } from "./shoppingLists";
import {
  copyListName,
  mergeShoppingLists,
  pendingFromLocal,
  type ServerList,
  type SyncState,
} from "./shoppingSyncMerge";

let idSeq = 0;
const newId = () => `new-${++idSeq}`;

function local(over: Partial<ShoppingListRecord> & { id: string }): ShoppingListRecord {
  return {
    name: "Список",
    createdAt: 1_000,
    updatedAt: 1_000,
    items: [{ id: "i1", name: "молоко", checked: false }],
    sort: null,
    ...over,
  };
}

function remote(over: Partial<ServerList> & { id: string }): ServerList {
  return {
    name: "Список",
    items: [{ id: "i1", name: "молоко", checked: false }],
    sort: null,
    createdAt: 1_000,
    serverUpdatedAt: "2026-09-01T10:00:00.000Z",
    clientUpdatedAt: 1_000,
    archived: false,
    ...over,
  };
}

const run = (input: {
  local: ShoppingListRecord[];
  server: ServerList[];
  state?: SyncState;
  foreign?: string[];
}) =>
  mergeShoppingLists({
    local: input.local,
    server: input.server,
    state: input.state ?? {},
    foreign: input.foreign ?? [],
    newId,
  });

describe("сценарий (а): залогиненный со списками обновился, сервер пуст", () => {
  it("отправляет всё локальное и ничего не теряет", () => {
    const lists = [local({ id: "a" }), local({ id: "b" }), local({ id: "c" })];
    const r = run({ local: lists, server: [] });

    expect(r.lists.map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(r.push.sort()).toEqual(["a", "b", "c"]);
    expect(r.archive).toEqual([]);
  });

  it("не трогает хранилище, когда и локально пусто, и на сервере пусто", () => {
    const r = run({ local: [], server: [] });
    expect(r.lists).toEqual([]);
    expect(r.push).toEqual([]);
  });
});

describe("сценарий (в): вход в аккаунт, где на сервере уже другие списки", () => {
  it("складывает обе пачки рядом, ничего не перетирая", () => {
    const r = run({
      local: [local({ id: "гость-1", name: "Пятёрочка" })],
      server: [remote({ id: "сервер-1", name: "Дача" })],
    });

    expect(r.lists.map((l) => l.id).sort()).toEqual(["гость-1", "сервер-1"]);
    expect(r.push).toEqual(["гость-1"]);
    expect(r.lists.find((l) => l.id === "сервер-1")?.name).toBe("Дача");
  });

  it("список приехавший с сервера встаёт В КОНЕЦ: цель добавления с экрана рецепта не меняется", () => {
    const r = run({
      local: [local({ id: "мой" })],
      server: [remote({ id: "чужого-устройства" })],
    });
    expect(r.lists[0].id).toBe("мой");
  });
});

describe("сценарий (в), продолжение: списки прошлого аккаунта наверх не уезжают", () => {
  it("список из foreign не попадает в push, но с устройства не исчезает", () => {
    const r = run({
      local: [local({ id: "от-аккаунта-A" }), local({ id: "новый" })],
      server: [],
      foreign: ["от-аккаунта-A"],
    });

    expect(r.lists.map((l) => l.id)).toEqual(["от-аккаунта-A", "новый"]);
    expect(r.push).toEqual(["новый"]);
  });

  it("если строка нашлась в ЭТОМ аккаунте — список признаётся своим и покидает foreign", () => {
    const r = run({
      local: [local({ id: "спорный" })],
      server: [remote({ id: "спорный" })],
      foreign: ["спорный"],
    });

    expect(r.foreign).toEqual([]);
  });
});

describe("сценарий (г): правки с двух устройств", () => {
  const mark: SyncState = { x: { server: "2026-09-01T10:00:00.000Z", local: 1_000 } };

  it("правили только здесь — отправляем, серверное не забираем", () => {
    const r = run({
      local: [local({ id: "x", updatedAt: 2_000, name: "моё" })],
      server: [remote({ id: "x" })],
      state: mark,
    });

    expect(r.push).toEqual(["x"]);
    expect(r.lists[0].name).toBe("моё");
  });

  it("правили только там — забираем серверное", () => {
    const r = run({
      local: [local({ id: "x", name: "старое" })],
      server: [remote({ id: "x", name: "новое", serverUpdatedAt: "2026-09-02T10:00:00.000Z" })],
      state: mark,
    });

    expect(r.push).toEqual([]);
    expect(r.lists[0].name).toBe("новое");
  });

  it("правили с ОБЕИХ сторон — локальное остаётся под своим id, серверное сохраняется копией", () => {
    const r = run({
      local: [
        local({
          id: "x",
          updatedAt: 2_000,
          name: "Пятёрочка",
          items: [{ id: "i1", name: "хлеб", checked: false }],
        }),
      ],
      server: [
        remote({
          id: "x",
          name: "Пятёрочка",
          serverUpdatedAt: "2026-09-02T10:00:00.000Z",
          items: [{ id: "i9", name: "кефир", checked: false }],
        }),
      ],
      state: mark,
    });

    expect(r.forks).toBe(1);
    expect(r.lists).toHaveLength(2);

    const kept = r.lists[0];
    expect(kept.id).toBe("x");
    expect(kept.items.map((i) => i.name)).toEqual(["хлеб"]);

    const copy = r.lists[1];
    expect(copy.id).not.toBe("x");
    expect(copy.name).toContain("копия с другого устройства");
    expect(copy.items.map((i) => i.name)).toEqual(["кефир"]);

    // Обе версии уезжают на сервер: ни одна не должна пропасть.
    expect(r.push.sort()).toEqual([copy.id, "x"].sort());
  });

  it("копии не размножаются: устройство, которое уже отдало свою версию, просто забирает победившую", () => {
    // Устройство B отправило свою версию и запомнило отметку по ней.
    const stateB: SyncState = { x: { server: "2026-09-02T10:00:00.000Z", local: 2_000 } };
    const r = run({
      local: [local({ id: "x", updatedAt: 2_000, name: "версия B" })],
      server: [remote({ id: "x", name: "версия A", serverUpdatedAt: "2026-09-03T10:00:00.000Z" })],
      state: stateB,
    });

    expect(r.forks).toBe(0);
    expect(r.lists).toHaveLength(1);
    expect(r.lists[0].name).toBe("версия A");
  });
});

describe("удаление", () => {
  it("удалили здесь — на сервере архивируем, обратно список не возвращается", () => {
    const r = run({
      local: [],
      server: [remote({ id: "x" })],
      state: { x: { server: "2026-09-01T10:00:00.000Z", local: 1_000 } },
    });

    expect(r.archive).toEqual(["x"]);
    expect(r.lists).toEqual([]);
  });

  it("удалили на другом устройстве, здесь не трогали — прячем", () => {
    const r = run({
      local: [local({ id: "x" })],
      server: [remote({ id: "x", archived: true })],
      state: { x: { server: "2026-09-01T10:00:00.000Z", local: 1_000 } },
    });

    expect(r.lists).toEqual([]);
  });

  it("удалили на другом устройстве, но здесь после этого правили — воскрешаем", () => {
    const r = run({
      local: [local({ id: "x", updatedAt: 5_000, name: "ещё нужен" })],
      server: [remote({ id: "x", archived: true })],
      state: { x: { server: "2026-09-01T10:00:00.000Z", local: 1_000 } },
    });

    expect(r.lists.map((l) => l.id)).toEqual(["x"]);
    expect(r.push).toEqual(["x"]);
  });

  it("архивный список, которого на устройстве нет, не приезжает обратно", () => {
    const r = run({ local: [], server: [remote({ id: "x", archived: true })] });
    expect(r.lists).toEqual([]);
  });
});

describe("страховка: сервер никогда не уносит локальный список молча", () => {
  it("список без отметки и без строки на сервере остаётся и отправляется", () => {
    const r = run({ local: [local({ id: "свежий" })], server: [] });
    expect(r.lists.map((l) => l.id)).toEqual(["свежий"]);
    expect(r.push).toEqual(["свежий"]);
  });

  it("строка пропала с сервера (ручная чистка) — локальный список цел и уезжает заново", () => {
    const r = run({
      local: [local({ id: "x" })],
      server: [],
      state: { x: { server: "2026-09-01T10:00:00.000Z", local: 1_000 } },
    });
    expect(r.lists.map((l) => l.id)).toEqual(["x"]);
    expect(r.push).toEqual(["x"]);
  });

  it("мусор в позициях с сервера не ломает запись: она проходит общий санитайз", () => {
    const r = run({
      local: [],
      server: [
        remote({
          id: "x",
          items: [{ id: "i1", name: "  моло\nко  ", checked: true }] as ServerList["items"],
        }),
      ],
    });
    expect(r.lists[0].items[0].name).toBe("моло ко");
  });
});

describe("pendingFromLocal — отправка без опроса сервера", () => {
  it("берёт изменённые и удалённые, пропускает чужие", () => {
    const state: SyncState = {
      тронут: { server: "s", local: 1_000 },
      нетронут: { server: "s", local: 1_000 },
      удалён: { server: "s", local: 1_000 },
    };
    const r = pendingFromLocal({
      local: [
        local({ id: "тронут", updatedAt: 9_000 }),
        local({ id: "нетронут", updatedAt: 1_000 }),
        local({ id: "чужой" }),
        local({ id: "новый" }),
      ],
      state,
      foreign: ["чужой"],
    });

    expect(r.push.sort()).toEqual(["новый", "тронут"]);
    expect(r.archive).toEqual(["удалён"]);
  });
});

describe("copyListName", () => {
  it("объясняет происхождение копии", () => {
    expect(copyListName("Пятёрочка")).toBe("Пятёрочка (копия с другого устройства)");
  });

  it("у длинного имени режет ОСНОВУ, а не объяснение", () => {
    const long = "Очень длинное название списка покупок на большую семью и дачу";
    const out = copyListName(long);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out).toContain("копия с другого устройства");
  });
});
