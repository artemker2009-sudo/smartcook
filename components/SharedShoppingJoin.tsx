"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ShoppingCart, Users } from "lucide-react";

import { reachGoal } from "@/lib/metrika";
import {
  fetchSharedList,
  joinSharedList,
  loadMemberIdentity,
  lastKnownMemberName,
  markInviteFlow,
  newMemberRef,
  rememberSharedList,
  saveMemberIdentity,
  type SharedPreview,
  type SharedSnapshot,
} from "@/lib/sharedShoppingList";
import SharedShoppingListView from "@/components/SharedShoppingListView";

// Экран приглашения: что человек видит, перейдя по ссылке.
//
// До вступления показываем ТОЛЬКО имя списка и число позиций — решение
// основателя: ссылка даёт право вступить, а не право молча читать содержимое.
// Сами позиции сервер и не отдаёт, пока memberRef не станет участником.
//
// Экран намеренно примитивный (ЦА 35–65): имя, «5 позиций», одно поле и одна
// большая кнопка.

function pluralizePositions(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} позиция`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} позиции`;
  return `${n} позиций`;
}

type Props = { listId: string };

export default function SharedShoppingJoin({ listId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<SharedPreview | null>(null);
  const [snapshot, setSnapshot] = useState<SharedSnapshot | null>(null);
  const [memberRef, setMemberRef] = useState<string>("");
  const [nameValue, setNameValue] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Помечаем сеанс как «начатый с приглашения» — до любой загрузки, чтобы
    // знакомство не успело выскочить ни здесь, ни на следующем экране, куда
    // человек уйдёт через несколько секунд.
    markInviteFlow();
    setLoading(true);
    setError(null);
    try {
      // Если на этом устройстве уже есть личность для этого списка — сервер
      // сразу отдаст полный снимок, и экран приглашения показывать не нужно.
      const identity = loadMemberIdentity(listId);
      const ref = identity?.memberRef ?? newMemberRef();
      setMemberRef(ref);
      setNameValue(identity?.name || lastKnownMemberName());

      const result = await fetchSharedList(listId, identity?.memberRef ?? null);
      if (result.joined) {
        setSnapshot(result);
        rememberSharedList({
          id: result.id,
          name: result.name,
          memberRef: ref,
          role: result.ownerRef === ref ? "owner" : "member",
          joinedAt: Date.now(),
        });
      } else {
        setPreview(result);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось открыть список");
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleJoin = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed) {
      toast("Напишите, как вас зовут");
      return;
    }
    setJoining(true);
    try {
      const snap = await joinSharedList(listId, memberRef, trimmed);
      saveMemberIdentity(listId, { memberRef, name: trimmed });
      rememberSharedList({
        id: snap.id,
        name: snap.name,
        memberRef,
        role: snap.ownerRef === memberRef ? "owner" : "member",
        joinedAt: Date.now(),
      });
      reachGoal("shopping_shared_joined");
      setSnapshot(snap);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось вступить в список");
    } finally {
      setJoining(false);
    }
  };

  if (snapshot) {
    return (
      <main className="container">
        <SharedShoppingListView
          listId={listId}
          memberRef={memberRef}
          initial={snapshot}
          onBack={() => router.push("/shopping")}
        />
      </main>
    );
  }

  if (loading) {
    return (
      <main className="container" style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "var(--color-accent)" }} />
      </main>
    );
  }

  if (error || !preview) {
    return (
      <main className="container">
        <div
          style={{
            background: "var(--color-surface)",
            border: "1px dashed var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-5) var(--space-4)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: "var(--space-3)" }}>🤷</div>
          <p style={{ margin: "0 0 var(--space-4) 0", fontSize: "var(--font-size-heading)", lineHeight: 1.5, color: "var(--color-text-secondary)" }}>
            {error || "Такого списка нет. Возможно, ссылка устарела."}
          </p>
          <button type="button" className="sl-modal-primary" onClick={() => router.push("/shopping")}>
            К моим спискам
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-5) var(--space-4)",
          textAlign: "center",
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 64,
            height: 64,
            marginBottom: "var(--space-3)",
            borderRadius: "var(--radius-full)",
            background: "var(--color-accent-subtle)",
            color: "var(--color-accent)",
          }}
        >
          <ShoppingCart size={32} />
        </span>

        <h1
          style={{
            margin: "0 0 var(--space-1) 0",
            fontSize: "var(--font-size-title)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text)",
            overflowWrap: "anywhere",
          }}
        >
          {preview.name}
        </h1>

        <p style={{ margin: "0 0 var(--space-4) 0", fontSize: "var(--font-size-heading)", color: "var(--color-text-secondary)" }}>
          {pluralizePositions(preview.itemCount)}
        </p>

        <p
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-2)",
            margin: "0 0 var(--space-4) 0",
            fontSize: "var(--font-size-body)",
            lineHeight: 1.5,
            color: "var(--color-text-secondary)",
          }}
        >
          <Users size={20} style={{ flexShrink: 0 }} />
          Вас зовут в общий список. Всё, что вы отметите, сразу увидят остальные.
        </p>

        <label
          htmlFor="shared-join-name"
          style={{
            display: "block",
            marginBottom: "var(--space-2)",
            textAlign: "left",
            fontSize: "var(--font-size-body)",
            fontWeight: "var(--font-weight-medium)",
            color: "var(--color-text)",
          }}
        >
          Ваше имя
        </label>
        <input
          id="shared-join-name"
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleJoin();
          }}
          placeholder="Например, Мама"
          autoComplete="nickname"
          maxLength={50}
          style={{
            width: "100%",
            minHeight: 52,
            marginBottom: "var(--space-3)",
            padding: "var(--space-3)",
            fontFamily: "inherit",
            fontSize: "var(--font-size-heading)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            background: "var(--color-bg)",
            color: "var(--color-text)",
          }}
        />

        <button
          type="button"
          onClick={() => void handleJoin()}
          disabled={joining || !nameValue.trim()}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-2)",
            width: "100%",
            minHeight: 56,
            padding: "var(--space-3) var(--space-4)",
            background: "var(--color-accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--font-size-heading)",
            fontWeight: "var(--font-weight-semibold)",
            cursor: joining || !nameValue.trim() ? "default" : "pointer",
            opacity: joining || !nameValue.trim() ? 0.5 : 1,
          }}
        >
          {joining ? <Loader2 size={22} className="animate-spin" /> : null}
          Присоединиться
        </button>

        <p style={{ margin: "var(--space-3) 0 0 0", fontSize: "var(--font-size-caption)", lineHeight: 1.4, color: "var(--color-text-muted)" }}>
          Регистрация не нужна — только имя, чтобы близкие понимали, кто что купил.
        </p>
      </div>
    </main>
  );
}
