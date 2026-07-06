"use client";

import React from "react";
import { X } from "lucide-react";

interface FullScreenImageProps {
  imageUrl: string | null;
  onClose: () => void;
}

export default function FullScreenImage({ imageUrl, onClose }: FullScreenImageProps) {
  if (!imageUrl) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-3)' }} onClick={onClose}>
      <button style={{position: 'absolute', top: 'var(--space-3)', right: 'var(--space-3)', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', padding: 'var(--space-2)', color: 'white', cursor: 'pointer', backdropFilter: 'blur(5px)'}} onClick={onClose}>
        <X size={24} />
      </button>
      <img src={imageUrl} style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 'var(--radius-sm)'}} alt="Fullscreen" />
    </div>
  );
}
