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

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  if (isExcluded(pathname) || loading || !role) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <SidebarDrawer open={drawerOpen} onClose={closeDrawer} />

      <div className="app-main">
        <TopBar onMenuClick={openDrawer} />
        <main>{children}</main>
      </div>

      <BottomTabBar onMenuClick={openDrawer} />
    </>
  );
}
