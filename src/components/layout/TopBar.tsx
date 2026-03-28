"use client";

import React from "react";
import Link from "next/link";
import { useNotifications } from "@/hooks/useNotifications";

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
        className="notif-bell-btn"
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          color: "#2c2c2c",
          textDecoration: "none",
        }}
      >
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: -1, right: -1,
            background: "#dc2626", color: "#fff",
            fontSize: 8, fontWeight: 700,
            width: 14, height: 14, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            lineHeight: 1,
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Link>
    </div>
  );
}
