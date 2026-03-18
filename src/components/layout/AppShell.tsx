"use client";

import React, { useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { Sidebar, SidebarDrawer } from "./Sidebar";
import { TopBar } from "./TopBar";

const EXCLUDED_PATHS = ["/login", "/auth"];

function isExcluded(pathname: string): boolean {
  return EXCLUDED_PATHS.some(p => pathname === p || pathname.startsWith(p + "/"));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role, loading } = useProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // No shell for auth pages or unauthenticated users
  if (isExcluded(pathname) || loading || !role) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Mobile drawer */}
      <SidebarDrawer open={drawerOpen} onClose={closeDrawer} />

      {/* Main content area */}
      <div className="app-main">
        <TopBar onMenuClick={openDrawer} />
        <main>
          {children}
        </main>
      </div>
    </>
  );
}
