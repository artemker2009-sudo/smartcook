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
      <div style={{position: 'absolute', bottom: 0, left: 0, right: 0, height: '80px', padding: '15px 20px', background: '#111', display: 'flex', gap: '10px', paddingBottom: 'env(safe-area-inset-bottom, 20px)'}}>
        <button onClick={onCancel} style={{flex: 1, padding: '14px', borderRadius: '12px', background: '#333', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer'}}>Отмена</button>
        <button onClick={onConfirm} style={{flex: 2, padding: '14px', borderRadius: '12px', background: '#0ea5e9', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer'}}>Выбрать</button>
      </div>
    </div>
  );
}
