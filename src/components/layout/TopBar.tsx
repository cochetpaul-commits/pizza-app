"use client";

import React from "react";
import Link from "next/link";
import { useNotifications } from "@/hooks/useNotifications";

/**
 * Mobile-only: clean notification icon fixed top-right.
 * No background, no glass, just the bell SVG + badge.
 */
export function TopBar() {
  const { unreadCount } = useNotifications();

  return (
    <div className="topbar-mobile" style={{
      display: "none",
      position: "fixed",
      top: "env(safe-area-inset-top, 10px)",
      right: 14,
      zIndex: 120,
    }}>
      <Link
        href="/notifications"
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "rgba(255,255,255,0.7)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: "1px solid rgba(0,0,0,0.06)",
          color: "#2c2c2c",
          textDecoration: "none",
        }}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: -2, right: -2,
            background: "#dc2626", color: "#fff",
            fontSize: 9, fontWeight: 700,
            width: 16, height: 16, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            lineHeight: 1, border: "2px solid #fff",
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Link>
    </div>
  );
}
