"use client";

import React from "react";
import { NotificationBell } from "@/components/NotificationBell";

/**
 * Mobile-only top bar: just notification bell in top-right corner.
 */
export function TopBar() {
  return (
    <header className="topbar-mobile" style={{
      display: "none",
      alignItems: "center",
      justifyContent: "flex-end",
      height: 48, padding: "0 12px",
      background: "transparent",
    }}>
      <NotificationBell />
    </header>
  );
}
