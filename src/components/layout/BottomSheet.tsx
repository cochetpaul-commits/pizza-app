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

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      document.body.classList.add("bottom-sheet-open");
    }
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("bottom-sheet-open");
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.18)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
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
          left: 8,
          right: 8,
          maxHeight: "82dvh",
          background: "rgba(252,248,240,0.88)",
          backdropFilter: "blur(40px) saturate(200%)",
          WebkitBackdropFilter: "blur(40px) saturate(200%)",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.5)",
          boxShadow: "0 -4px 30px rgba(0,0,0,0.10), 0 0 1px rgba(0,0,0,0.08)",
          marginBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
          overflowY: "auto",
          transform: "translateY(0)",
          transition: "transform 0.25s ease",
          animation: "bottomSheetSlideUp 0.25s ease",
        }}
      >
        {/* Handle bar */}
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 2px" }}>
          <div style={{
            width: 36,
            height: 5,
            borderRadius: 3,
            background: "rgba(0,0,0,0.15)",
          }} />
        </div>

        {/* Header: title + close */}
        {title && (
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "6px 18px 10px",
          }}>
            <span style={{
              fontSize: 15,
              fontWeight: 700,
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
              textTransform: "uppercase",
              letterSpacing: 1,
              color: "#2c2c2c",
            }}>
              {title}
            </span>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: "50%",
                background: "rgba(0,0,0,0.06)", border: "none",
                color: "#999", fontSize: 14, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        <div style={{ padding: "0 14px 14px" }}>
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
