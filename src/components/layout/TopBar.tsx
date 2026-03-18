"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { NotificationBell } from "@/components/NotificationBell";
import { useTopBarState } from "./TopBarContext";
import { getPageTitle } from "./SidebarNav";
import { IconMenu } from "./Icons";

type TopBarProps = {
  onMenuClick: () => void;
};

/**
 * Mobile-only top bar: burger + title + notification bell.
 * Hidden on desktop (sidebar handles navigation).
 */
export function TopBar({ onMenuClick }: TopBarProps) {
  const pathname = usePathname();
  const { title } = useTopBarState();
  const displayTitle = title || getPageTitle(pathname) || "";

  return (
    <header className="topbar-mobile" style={{
      display: "none", /* shown via CSS on mobile */
      alignItems: "center",
      height: 48, padding: "0 12px", gap: 10,
      background: "#fff",
      borderBottom: "1px solid rgba(0,0,0,0.06)",
    }}>
      <button
        type="button"
        onClick={onMenuClick}
        style={{
          background: "none", border: "none",
          cursor: "pointer", padding: 4, color: "#1a1a1a",
          display: "flex", alignItems: "center",
        }}
        aria-label="Menu"
      >
        <IconMenu size={22} />
      </button>

      <h1 style={{
        flex: 1, margin: 0,
        fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
        fontSize: 15, fontWeight: 700,
        color: "#1a1a1a",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        lineHeight: 1,
      }}>
        {displayTitle}
      </h1>

      <NotificationBell />
    </header>
  );
}
