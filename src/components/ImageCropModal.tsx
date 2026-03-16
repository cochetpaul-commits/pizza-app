"use client";
import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";

type Props = {
  imageSrc: string;
  onConfirm: (croppedBlob: Blob) => void;
  onCancel: () => void;
};

async function getCroppedImg(imageSrc: string, crop: Area, size: number): Promise<Blob> {
  const image = new window.Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.drawImage(
    image,
    crop.x, crop.y, crop.width, crop.height,
    0, 0, size, size,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => { if (blob) resolve(blob); else reject(new Error("toBlob failed")); },
      "image/jpeg",
      0.85,
    );
  });
}

export function ImageCropModal({ imageSrc, onConfirm, onCancel }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedArea(croppedAreaPixels);
  }, []);

  async function handleConfirm() {
    if (!croppedArea) return;
    setSaving(true);
    try {
      const blob = await getCroppedImg(imageSrc, croppedArea, 200);
      onConfirm(blob);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur crop");
      setSaving(false);
    }
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onCancel}
        style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "rgba(0,0,0,0.7)",
        }}
      />

      {/* Modal */}
      <div style={{
        position: "fixed", zIndex: 9999,
        top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: "min(380px, 92vw)",
        background: "#faf7f2", borderRadius: 20,
        boxShadow: "0 12px 40px rgba(0,0,0,0.3)",
        overflow: "hidden",
      }}>
        {/* Crop area */}
        <div style={{ position: "relative", width: "100%", height: 320, background: "#1a1a1a" }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Zoom slider */}
        <div style={{ padding: "14px 24px 8px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "#999", flexShrink: 0 }}>Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ flex: 1, accentColor: "#D4775A" }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, padding: "8px 24px 20px" }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, height: 44, borderRadius: 20,
              border: "1.5px solid #ddd6c8", background: "#fff",
              fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#1a1a1a",
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            style={{
              flex: 1, height: 44, borderRadius: 20,
              border: "none", background: "#D4775A", color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "..." : "Valider"}
          </button>
        </div>
      </div>
    </>
  );
}
