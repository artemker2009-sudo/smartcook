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
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <button style={{position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', padding: '10px', color: 'white', cursor: 'pointer', backdropFilter: 'blur(5px)'}} onClick={onClose}>
        <X size={24} />
      </button>
      <img src={imageUrl} style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '12px'}} alt="Fullscreen" />
    </div>
  );
}
