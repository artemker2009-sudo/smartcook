"use client";

import React from "react";
import { X, HeartHandshake } from "lucide-react";
import { DONATE_URL } from "@/lib/constants";

interface DonateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DonateModal({ isOpen, onClose }: DonateModalProps) {
  if (!isOpen) return null;

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
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)",
          borderRadius: "var(--radius-md)",
          width: "100%",
          maxWidth: "380px",
          padding: "var(--space-5) var(--space-4)",
          position: "relative",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
          textAlign: "center",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "var(--space-3)",
            right: "var(--space-3)",
            background: "var(--color-bg-subtle)",
            border: "none",
            borderRadius: "50%",
            padding: "var(--space-2)",
            cursor: "pointer",
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
            background: "var(--color-accent-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto var(--space-3) auto",
          }}
        >
          <HeartHandshake size={28} color="var(--color-accent)" />
        </div>

        <h2 style={{ fontSize: "var(--font-size-heading)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", margin: "0 0 var(--space-2) 0" }}>
          Поддержать SmartCook
        </h2>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--font-size-caption)", margin: "0 0 var(--space-4) 0", lineHeight: 1.5 }}>
          SmartCook делает один человек. Если сервис вам помог — можно поддержать
          его донатом, всё уходит на оплату серверов и ИИ.
        </p>

        <a
          href={DONATE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
          style={{
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 0,
          }}
        >
          Поддержать донатом
        </a>
      </div>
    </div>
  );
}
