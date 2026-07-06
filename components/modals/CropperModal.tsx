"use client";

import React from "react";
import Cropper from "react-easy-crop";

interface CropperModalProps {
  isCropping: boolean;
  cropImageSrc: string | null;
  crop: { x: number; y: number };
  setCrop: (crop: { x: number; y: number }) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  onCropComplete: (croppedArea: any, croppedAreaPixels: any) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function CropperModal({
  isCropping,
  cropImageSrc,
  crop,
  setCrop,
  zoom,
  setZoom,
  onCropComplete,
  onCancel,
  onConfirm,
}: CropperModalProps) {
  if (!isCropping || !cropImageSrc) return null;

  return (
    <div style={{position: 'fixed', inset: 0, zIndex: 100001, background: 'black', display: 'flex', flexDirection: 'column'}}>
      <div style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: '80px'}}>
        <Cropper image={cropImageSrc} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} onCropChange={setCrop} onCropComplete={onCropComplete} onZoomChange={setZoom} style={{ containerStyle: { background: 'black' } }} />
      </div>
      <div style={{position: 'absolute', bottom: 0, left: 0, right: 0, height: '80px', padding: 'var(--space-3) var(--space-3)', background: 'var(--color-text)', display: 'flex', gap: 'var(--space-2)', paddingBottom: 'env(safe-area-inset-bottom, 20px)'}}>
        <button onClick={onCancel} style={{flex: 1, padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-text-secondary)', color: 'white', border: 'none', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer'}}>Отмена</button>
        <button onClick={onConfirm} style={{flex: 2, padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--color-accent)', color: 'white', border: 'none', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer'}}>Выбрать</button>
      </div>
    </div>
  );
}
