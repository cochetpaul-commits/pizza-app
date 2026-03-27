"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomTabBar } from "./BottomTabBar";

const EXCLUDED_PATHS = ["/login", "/auth"];

function isExcluded(pathname: string): boolean {
  return EXCLUDED_PATHS.some(p => pathname === p || pathname.startsWith(p + "/"));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role, loading } = useProfile();

  if (isExcluded(pathname) || loading || !role) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />

      <div className="app-main">
        <TopBar />
        <main>{children}</main>
      </div>

      <BottomTabBar />
    </>
  );
}
