"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

/** Routes accessibles sans authentification */
const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/setup-password"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublicRoute = isPublic(pathname);

  useEffect(() => {
    if (!loading && !session && !isPublicRoute) {
      router.replace("/login");
    }
  }, [loading, session, isPublicRoute, router]);

  // Public routes — always render
  if (isPublicRoute) return <>{children}</>;

  // Loading — show spinner
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          background: "#f2ede4",
        }}
      >
        <span style={{ fontSize: 14, color: "#8a7e72" }}>Chargement…</span>
      </div>
    );
  }

  // Not authenticated — don't render (redirect will happen via useEffect)
  if (!session) return null;

  return <>{children}</>;
}
