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
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: "24px",
          width: "100%",
          maxWidth: "380px",
          padding: "30px 25px",
          position: "relative",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
          textAlign: "center",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "15px",
            right: "15px",
            background: "#f3f4f6",
            border: "none",
            borderRadius: "50%",
            padding: "6px",
            cursor: "pointer",
            color: "#6b7280",
          }}
        >
          <X size={20} />
        </button>

        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "#ecfdf5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 18px auto",
          }}
        >
          <HeartHandshake size={28} color="#059669" />
        </div>

        <h2 style={{ fontSize: "20px", fontWeight: 900, color: "#111", margin: "0 0 12px 0" }}>
          Поддержать SmartCook
        </h2>
        <p style={{ color: "#4b5563", fontSize: "14px", margin: "0 0 24px 0", lineHeight: 1.5 }}>
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
