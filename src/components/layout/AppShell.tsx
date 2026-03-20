"use client";

import React, { useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { Sidebar, SidebarDrawer } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomTabBar } from "./BottomTabBar";

const EXCLUDED_PATHS = ["/login", "/auth"];

function isExcluded(pathname: string): boolean {
  return EXCLUDED_PATHS.some(p => pathname === p || pathname.startsWith(p + "/"));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role, loading } = useProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar_collapsed") === "true";
    }
    return false;
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  }, []);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // No shell for auth pages or unauthenticated users
  if (isExcluded(pathname) || loading || !role) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Desktop sidebar */}
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />

      {/* Mobile drawer (accessible via TopBar menu button) */}
      <SidebarDrawer open={drawerOpen} onClose={closeDrawer} />

      {/* Main content area */}
      <div className={`app-main${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
        <TopBar onMenuClick={openDrawer} />
        <main>
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <BottomTabBar onMenuClick={openDrawer} />
    </>
  );
}
