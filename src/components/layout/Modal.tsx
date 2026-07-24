"use client";

import React, { useEffect, type CSSProperties } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: number | string;
  children: React.ReactNode;
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(0,0,0,0.25)",
  backdropFilter: "blur(12px) saturate(150%)",
  WebkitBackdropFilter: "blur(12px) saturate(150%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  animation: "modalFadeIn 0.2s ease",
};

const panelStyle = (width: number | string): CSSProperties => ({
  background: "rgba(255,255,255,0.88)",
  backdropFilter: "blur(40px) saturate(200%)",
  WebkitBackdropFilter: "blur(40px) saturate(200%)",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.6)",
  boxShadow: "0 4px 16px rgba(0,0,0,0.06), 0 16px 48px rgba(0,0,0,0.12)",
  width: "100%",
  maxWidth: typeof width === "number" ? width : width,
  maxHeight: "90vh",
  overflowY: "auto" as const,
  animation: "modalScaleIn 0.2s cubic-bezier(0.34,1.56,0.64,1)",
});

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "16px 20px 12px",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
};

const titleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#1a1a1a",
};

const closeButtonStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  background: "rgba(0,0,0,0.06)",
  border: "none",
  color: "#999",
  fontSize: 14,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "background 0.15s ease",
};

export function Modal({ open, onClose, title, width = 480, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={panelStyle(width)} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div style={headerStyle}>
            <span style={titleStyle}>{title}</span>
            <button
              type="button"
              onClick={onClose}
              style={closeButtonStyle}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.10)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.06)"; }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
        <div style={{ padding: title ? "16px 20px 20px" : "20px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
