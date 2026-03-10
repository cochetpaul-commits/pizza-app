"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import type { Role } from "@/lib/rbac";

export function RequireRole({
  allowedRoles,
  children,
  fallback,
}: {
  allowedRoles: Role[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { role, loading } = useProfile();
  const router = useRouter();

  const allowed = role !== null && allowedRoles.includes(role);

  useEffect(() => {
    if (!loading && !allowed && role !== null) {
      router.replace("/");
    }
  }, [loading, allowed, role, router]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "40vh" }}>
        <span style={{ fontSize: 13, color: "#999" }}>Chargement…</span>
      </div>
    );
  }

  if (!allowed) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}
