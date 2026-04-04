"use client";

import React, { useEffect, useRef, useCallback } from "react";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const dragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    currentY.current = 0;
    dragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current) return;
    const delta = e.touches[0].clientY - startY.current;
    currentY.current = Math.max(0, delta);
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${currentY.current}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    dragging.current = false;
    if (currentY.current > 80) {
      onClose();
    } else if (sheetRef.current) {
      sheetRef.current.style.transform = "translateY(0)";
    }
    currentY.current = 0;
  }, [onClose]);

  // Close on escape key
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.25)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        transition: "opacity 0.2s",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: "70dvh",
          background: "rgba(245,240,232,0.92)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          borderRadius: "24px 24px 0 0",
          border: "1px solid rgba(255,255,255,0.35)",
          borderBottom: "none",
          boxShadow: "0 -4px 32px rgba(0,0,0,0.12)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          overflowY: "auto",
          transform: "translateY(0)",
          transition: "transform 0.25s ease",
          animation: "bottomSheetSlideUp 0.25s ease",
        }}
      >
        {/* Handle bar */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: "rgba(0,0,0,0.18)",
          }} />
        </div>

        {title && (
          <div style={{
            padding: "4px 20px 12px",
            fontSize: 15,
            fontWeight: 700,
            fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
            textTransform: "uppercase",
            letterSpacing: 1,
            color: "#2c2c2c",
          }}>
            {title}
          </div>
        )}

        <div style={{ padding: "0 16px 16px" }}>
          {children}
        </div>
      </div>

      <style>{`
        @keyframes bottomSheetSlideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
