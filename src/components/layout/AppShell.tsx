"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { canAccess } from "@/lib/rbac";
import { Sidebar } from "./Sidebar";
import { MobileHeader } from "./MobileHeader";
import { BottomTabBar } from "./BottomTabBar";
import { BottomBarProvider } from "@/lib/BottomBarContext";

const EXCLUDED_PATHS = ["/login", "/auth", "/installer"];

function isExcluded(pathname: string): boolean {
  return EXCLUDED_PATHS.some(p => pathname === p || pathname.startsWith(p + "/"));
}

function AccessDenied() {
  const router = useRouter();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "50vh", gap: 16 }}>
      <div style={{ fontSize: 40 }}>&#128274;</div>
      <p style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>Acces non autorise</p>
      <p style={{ fontSize: 13, color: "#999" }}>Vous n&apos;avez pas les droits pour acceder a cette page.</p>
      <button
        type="button"
        onClick={() => router.push("/dashboard")}
        style={{
          padding: "10px 24px", borderRadius: 20, border: "none",
          background: "#D4775A", color: "#fff", fontSize: 13,
          fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>
        Retour a l&apos;accueil
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, loading, can } = useProfile();
  const excluded = isExcluded(pathname);

  // Pas de session (jeton expiré, déconnexion) sur une page de l'app :
  // renvoyer vers la connexion au lieu de laisser une page blanche.
  useEffect(() => {
    if (!loading && !role && !excluded && pathname !== "/") router.replace("/login");
  }, [loading, role, excluded, pathname, router]);

  if (excluded || loading || !role) {
    return <>{children}</>;
  }

  // Global route guard — enforce RBAC on every page
  const allowed = canAccess(role, pathname, can);

  return (
    <BottomBarProvider>
      <Sidebar />

      <div className="app-main">
        <MobileHeader />
        <main>{allowed ? children : <AccessDenied />}</main>
      </div>

      <BottomTabBar />
    </BottomBarProvider>
  );
}
