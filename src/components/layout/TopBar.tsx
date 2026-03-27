"use client";

import React from "react";
import { NotificationBell } from "@/components/NotificationBell";

/**
 * Mobile-only: notification bell fixed top-right. No bar/background.
 */
export function TopBar() {
  return (
    <div className="topbar-mobile" style={{
      display: "none",
      position: "fixed",
      top: "env(safe-area-inset-top, 8px)",
      right: 12,
      zIndex: 120,
    }}>
      <NotificationBell />
    </div>
  );
}
