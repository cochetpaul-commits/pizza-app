"use client";

import React from "react";

/* ── Types ─────────────────────────────────────────────────────── */

export type FloatingAction = {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
};

export type FloatingActionsProps = {
  actions: FloatingAction[];
};

/* ── Icon helpers (20x20 inline SVGs) ──────────────────────────── */

type IconProps = { size?: number; color?: string };

export function FAIconTrash({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function FAIconDownload({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function FAIconMail({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-10 7L2 7" />
    </svg>
  );
}

export function FAIconPlus({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function FAIconUpload({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export function FAIconCheck({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function FAIconPdf({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

/* ── Component ─────────────────────────────────────────────────── */

export function FloatingActions({ actions }: FloatingActionsProps) {
  if (!actions || actions.length === 0) return null;

  const secondary = actions.filter((a) => !a.primary);
  const primary = actions.find((a) => a.primary);

  const btnBase: React.CSSProperties = {
    width: 44,
    height: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    borderRadius: 12,
    transition: "transform 0.12s, background 0.12s",
    padding: 0,
    flexShrink: 0,
  };

  return (
    <>
      {/* CSS media query: only show on mobile */}
      <style>{`
        .floating-actions-bar { display: none !important; }
        @media (max-width: 768px) {
          .floating-actions-bar { display: flex !important; }
        }
      `}</style>

      <div
        className="floating-actions-bar"
        style={{
          position: "fixed",
          bottom: "calc(64px + env(safe-area-inset-bottom, 0px))",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 105,
          display: "flex",
          alignItems: "center",
          gap: 8,
          maxWidth: 280,
        }}
      >
        {/* Secondary actions grouped pill */}
        {secondary.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              background: "#fff",
              borderRadius: 20,
              boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
              padding: "4px 6px",
            }}
          >
            {secondary.map((action, i) => (
              <button
                key={i}
                type="button"
                title={action.label}
                disabled={action.disabled}
                onClick={action.onClick}
                onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.9)"; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                onTouchStart={(e) => { e.currentTarget.style.transform = "scale(0.9)"; }}
                onTouchEnd={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                style={{
                  ...btnBase,
                  color: "#666",
                  opacity: action.disabled ? 0.4 : 1,
                }}
              >
                {action.icon}
              </button>
            ))}
          </div>
        )}

        {/* Primary action pill */}
        {primary && (
          <button
            type="button"
            title={primary.label}
            disabled={primary.disabled}
            onClick={primary.onClick}
            onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.9)"; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
            onTouchStart={(e) => { e.currentTarget.style.transform = "scale(0.9)"; }}
            onTouchEnd={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
            style={{
              ...btnBase,
              width: 52,
              height: 52,
              background: "#D4775A",
              color: "#fff",
              borderRadius: 20,
              boxShadow: "0 4px 20px rgba(212,119,90,0.35)",
              opacity: primary.disabled ? 0.5 : 1,
            }}
          >
            {primary.icon}
          </button>
        )}
      </div>
    </>
  );
}
