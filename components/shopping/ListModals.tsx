"use client";

import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";

import { reachGoal } from "@/lib/metrika";
import type { ShoppingItem } from "@/lib/shoppingList";
import { listDisplayName, type ShoppingListRecord } from "@/lib/shoppingLists";
import {
  createSharedList,
  lastKnownMemberName,
  newMemberRef,
  rememberSharedList,
  saveMemberIdentity,
  type SharedMember,
} from "@/lib/sharedShoppingList";
import { copyItemsAsText, shareInviteLink } from "@/components/shopping/shareActions";

// Окна действий над списком — общие для хаба и экрана списка. Раньше жили
// прямо в ShoppingListRoute; когда меню «⋯» появилось на карточках хаба,
// им понадобились те же окна, и копия разошлась бы с оригиналом.

/** Переименование. Сохранение может идти на сервер (общий список) — busy. */
export function RenameListModal({
  initialName,
  busy = false,
  onSave,
  onClose,
}: {
  initialName: string;
  busy?: boolean;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialName);
  const save = () => {
    const name = value.trim();
    if (!name) {
      toast("Впишите название списка");
      return;
    }
    onSave(name);
  };
  const disabled = busy || !value.trim();

  return (
    <div className="sl-overlay sl-overlay-center" onClick={onClose}>
      <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sl-modal-head">
          <h2 className="sl-modal-title">Название списка</h2>
          <button type="button" className="sl-modal-x" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          placeholder="Например, Пятёрочка"
          aria-label="Название списка"
          className="sl-modal-input"
          disabled={busy}
        />
        <button
          type="button"
          className="sl-modal-primary"
          onClick={save}
          disabled={disabled}
          style={{ opacity: disabled ? 0.5 : 1 }}
        >
          {busy ? "Сохраняю…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}

/** Подтверждение: удалить локальный список или убрать общий у себя. */
export function DeleteListModal({
  kind,
  name,
  onConfirm,
  onClose,
}: {
  kind: "local" | "shared";
  name: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  // У локального списка и у общего последствия РАЗНЫЕ, и текст обязан это
  // говорить: свой список исчезает насовсем, общий остаётся у остальных
  // участников и возвращается по той же ссылке.
  return (
    <div className="sl-overlay sl-overlay-center" onClick={onClose}>
      <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="sl-modal-title" style={{ marginBottom: "var(--space-2)" }}>
          {kind === "local" ? "Удалить список?" : "Убрать список у себя?"}
        </h2>
        <p style={{ margin: "0 0 var(--space-4) 0", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
          {kind === "local"
            ? `«${listDisplayName(name)}» и все его позиции будут удалены. Это действие нельзя отменить.`
            : `«${listDisplayName(name)}» исчезнет с этого устройства. У остальных участников он останется, и вы сможете вернуться по той же ссылке.`}
        </p>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button type="button" className="sl-modal-secondary" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="sl-modal-danger" onClick={onConfirm}>
            {kind === "local" ? "Удалить" : "Убрать"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Список слишком большой для ссылки → поделиться текстом. */
export function ShareTooBigModal({
  name,
  items,
  onClose,
}: {
  name: string;
  items: ShoppingItem[];
  onClose: () => void;
}) {
  return (
    <div className="sl-overlay sl-overlay-center" onClick={onClose}>
      <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="sl-modal-title" style={{ marginBottom: "var(--space-2)" }}>Список большой для ссылки</h2>
        <p style={{ margin: "0 0 var(--space-4) 0", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
          В ссылку помещается до 80 позиций. Поделитесь списком текстом — скопируйте и отправьте в любой мессенджер.
        </p>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button type="button" className="sl-modal-secondary" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="sl-modal-primary"
            style={{ flex: 1 }}
            onClick={() => {
              void copyItemsAsText(items, name);
              onClose();
            }}
          >
            Скопировать
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * «Сделать общим»: копирует ТЕКУЩИЕ позиции на сервер как стартовый набор.
 * Спрашиваем только имя — регистрации нет.
 *
 * Локальный оригинал остаётся в localStorage, но в хабе больше НЕ показывается
 * (fromLocalId). Иначе получались две строки с одинаковым именем — владелец
 * продукта на приёмке открыл не ту, увидел её пустой и решил, что
 * синхронизация сломана.
 */
export function MakeSharedModal({
  list,
  onCreated,
  onClose,
}: {
  list: ShoppingListRecord;
  onCreated: (created: { id: string; name: string }) => void;
  onClose: () => void;
}) {
  const [ownerName, setOwnerName] = useState(() => lastKnownMemberName());
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    const name = ownerName.trim();
    if (!name) {
      toast("Напишите, как вас зовут");
      return;
    }
    setBusy(true);
    try {
      const ownerRef = newMemberRef();
      const snap = await createSharedList({
        name: list.name,
        items: list.items.map((it) => it.name),
        ownerRef,
        ownerName: name,
      });
      saveMemberIdentity(snap.id, { memberRef: ownerRef, name });
      rememberSharedList({
        id: snap.id,
        name: snap.name,
        memberRef: ownerRef,
        role: "owner",
        joinedAt: Date.now(),
        fromLocalId: list.id,
        counts: { total: snap.items.length, done: snap.items.filter((it) => it.checked).length },
      });
      reachGoal("shopping_shared_created");
      onCreated({ id: snap.id, name: snap.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось создать общий список");
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || !ownerName.trim();

  return (
    <div className="sl-overlay sl-overlay-center" onClick={() => !busy && onClose()}>
      <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sl-modal-head">
          <h2 className="sl-modal-title">Общий список с семьёй</h2>
          <button type="button" className="sl-modal-x" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>
        {/* Текст обязан совпадать с тем, что реально произойдёт. Прежняя
            формулировка обещала «этот список останется у вас и таким, как
            есть» — а локальный оригинал сразу прячется из хаба, и человек
            решал, что список пропал. */}
        <p style={{ margin: "0 0 var(--space-3) 0", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
          «{listDisplayName(list.name)}» станет общим: вы получите ссылку, и всё, что кто-то
          отметит, сразу увидят остальные. Позиции и отметки перенесутся, а вместо двух
          одинаковых списков останется один — со значком «людей».
        </p>
        <label
          htmlFor="make-shared-name"
          style={{
            display: "block",
            marginBottom: "var(--space-2)",
            fontSize: "var(--font-size-body)",
            fontWeight: "var(--font-weight-medium)",
            color: "var(--color-text)",
          }}
        >
          Ваше имя
        </label>
        <input
          id="make-shared-name"
          autoFocus
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void confirm();
          }}
          placeholder="Например, Мама"
          maxLength={50}
          className="sl-modal-input"
        />
        <button
          type="button"
          className="sl-modal-primary"
          onClick={() => void confirm()}
          disabled={disabled}
          style={{ opacity: disabled ? 0.5 : 1 }}
        >
          {busy ? "Создаю…" : "Сделать общим"}
        </button>
      </div>
    </div>
  );
}

/** Сразу после создания общего списка: без этого окна о нём никто не узнает. */
export function InviteModal({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  return (
    <div className="sl-overlay sl-overlay-center" onClick={onClose}>
      <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sl-modal-head">
          <h2 className="sl-modal-title">Список стал общим</h2>
          <button type="button" className="sl-modal-x" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>
        <p style={{ margin: "0 0 var(--space-4) 0", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
          Остался один шаг: отправьте ссылку близким. У них список появится только после того, как
          они её откроют.
        </p>
        <button
          type="button"
          className="sl-modal-primary"
          onClick={async () => {
            if (await shareInviteLink(id, name)) onClose();
          }}
        >
          Отправить ссылку
        </button>
        <button
          type="button"
          className="sl-modal-secondary"
          style={{ width: "100%", marginTop: "var(--space-2)" }}
          onClick={onClose}
        >
          Позже
        </button>
      </div>
    </div>
  );
}

/** Кто в общем списке. */
export function MembersModal({
  members,
  ownerRef,
  memberRef,
  onInvite,
  onClose,
}: {
  members: SharedMember[];
  ownerRef: string | null;
  memberRef: string;
  onInvite: () => void;
  onClose: () => void;
}) {
  return (
    <div className="sl-overlay sl-overlay-center" onClick={onClose}>
      <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sl-modal-head">
          <h2 className="sl-modal-title">Кто в списке</h2>
          <button type="button" className="sl-modal-x" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {members.map((m) => (
            <li
              key={m.memberRef}
              style={{
                padding: "var(--space-3) 0",
                borderBottom: "1px solid var(--color-border)",
                fontSize: "var(--font-size-heading)",
                color: "var(--color-text)",
              }}
            >
              {m.name}
              {m.memberRef === ownerRef && (
                <span style={{ marginLeft: 8, fontSize: "var(--font-size-caption)", color: "var(--color-text-muted)" }}>
                  создал(а) список
                </span>
              )}
              {m.memberRef === memberRef && (
                <span style={{ marginLeft: 8, fontSize: "var(--font-size-caption)", color: "var(--color-accent)" }}>
                  это вы
                </span>
              )}
            </li>
          ))}
        </ul>
        <button type="button" className="sl-modal-primary" onClick={onInvite} style={{ marginTop: "var(--space-3)" }}>
          Позвать ещё
        </button>
      </div>
    </div>
  );
}
