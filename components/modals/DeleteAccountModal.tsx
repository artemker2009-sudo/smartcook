"use client";

import { useState } from "react";
import { X, AlertTriangle, Loader2 } from "lucide-react";

// Подтверждение удаления аккаунта. Осознанное необратимое действие, поэтому:
//   * отдельная «красная» модалка, а не тихий confirm();
//   * пользователь ВРУЧНУЮ вводит слово УДАЛИТЬ — защита от случайного тапа;
//   * перечислено, что именно пропадёт.
// Само удаление (сеть, чистка localStorage, signOut, редирект) делает родитель
// через onConfirm — модалка только собирает согласие.

const CONFIRM_WORD = "УДАЛИТЬ";

interface DeleteAccountModalProps {
  isOpen: boolean;
  isDeleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function DeleteAccountModal({
  isOpen,
  isDeleting,
  onConfirm,
  onClose,
}: DeleteAccountModalProps) {
  const [word, setWord] = useState("");
  if (!isOpen) return null;

  const canDelete = word.trim().toUpperCase() === CONFIRM_WORD && !isDeleting;

  const close = () => {
    if (isDeleting) return;
    setWord("");
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        padding: "var(--space-3)",
      }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)",
          borderRadius: "var(--radius-md)",
          width: "100%",
          maxWidth: "420px",
          padding: "var(--space-5) var(--space-4)",
          position: "relative",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        }}
      >
        <button
          onClick={close}
          disabled={isDeleting}
          aria-label="Закрыть"
          style={{
            position: "absolute",
            top: "var(--space-3)",
            right: "var(--space-3)",
            background: "var(--color-bg-subtle)",
            border: "none",
            borderRadius: "50%",
            padding: "var(--space-2)",
            cursor: isDeleting ? "default" : "pointer",
            color: "var(--color-text-secondary)",
          }}
        >
          <X size={20} />
        </button>

        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "var(--color-danger-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto var(--space-3) auto",
          }}
        >
          <AlertTriangle size={28} color="var(--color-danger)" />
        </div>

        <h2
          style={{
            fontSize: "var(--font-size-heading)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text)",
            margin: "0 0 var(--space-2) 0",
            textAlign: "center",
          }}
        >
          Удалить аккаунт?
        </h2>
        <p
          style={{
            color: "var(--color-text-secondary)",
            fontSize: "var(--font-size-caption)",
            margin: "0 0 var(--space-3) 0",
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          Действие необратимо. Навсегда удалятся:
        </p>
        <ul
          style={{
            color: "var(--color-text-secondary)",
            fontSize: "var(--font-size-caption)",
            lineHeight: 1.6,
            margin: "0 0 var(--space-4) 0",
            paddingLeft: "var(--space-4)",
          }}
        >
          <li>профиль, имя и настройки питания;</li>
          <li>история рецептов и избранное;</li>
          <li>ваши посты в ленте и лайки;</li>
          <li>фото, которые вы публиковали.</li>
        </ul>

        <label
          style={{
            display: "block",
            fontSize: "var(--font-size-caption)",
            color: "var(--color-text)",
            fontWeight: "var(--font-weight-semibold)",
            marginBottom: "var(--space-1)",
          }}
        >
          Введите слово <span style={{ color: "var(--color-danger)" }}>{CONFIRM_WORD}</span>, чтобы подтвердить:
        </label>
        <input
          type="text"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          disabled={isDeleting}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder={CONFIRM_WORD}
          style={{
            width: "100%",
            padding: "var(--space-3)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-border)",
            background: "var(--color-bg)",
            color: "var(--color-text)",
            fontSize: "var(--font-size-body)",
            marginBottom: "var(--space-4)",
            textTransform: "uppercase",
          }}
        />

        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button
            type="button"
            onClick={close}
            disabled={isDeleting}
            style={{
              flex: 1,
              padding: "var(--space-3)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg)",
              color: "var(--color-text-secondary)",
              fontWeight: "var(--font-weight-semibold)",
              cursor: isDeleting ? "default" : "pointer",
            }}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canDelete}
            style={{
              flex: 1,
              padding: "var(--space-3)",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: "var(--color-danger)",
              color: "white",
              fontWeight: "var(--font-weight-semibold)",
              cursor: canDelete ? "pointer" : "default",
              opacity: canDelete ? 1 : 0.5,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-1)",
            }}
          >
            {isDeleting ? <Loader2 size={16} className="animate-spin" /> : null}
            Удалить навсегда
          </button>
        </div>
      </div>
    </div>
  );
}
