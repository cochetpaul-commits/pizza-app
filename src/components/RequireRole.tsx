"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import type { Role } from "@/lib/rbac";

/**
 * Guard component — vérifie les rôles ET/OU les permissions granulaires.
 *
 * Usage :
 *   <RequireRole allowedRoles={["group_admin"]}>           // par rôle
 *   <RequireRole permission="performances.view">           // par permission
 *   <RequireRole allowedRoles={["group_admin"]} permission="settings.employes">  // les deux
 */
export function RequireRole({
  allowedRoles,
  permission,
  children,
  fallback,
}: {
  allowedRoles?: Role[];
  permission?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { role, loading, can } = useProfile();
  const router = useRouter();

  let allowed = false;
  if (role !== null) {
    if (permission) {
      allowed = can(permission);
    } else if (allowedRoles) {
      allowed = allowedRoles.includes(role);
    } else {
      allowed = true;
    }
  }

  useEffect(() => {
    if (!loading && !allowed && role !== null) {
      // Jamais vers "/" : la racine redirige selon le rôle, et si elle
      // renvoie vers une page refusée on boucle à l'infini (Safari coupe
      // à 100 redirections → « Application error », vécu le 20/08).
      // Destination sûre et terminale par rôle :
      router.replace(role === "group_admin" ? "/dashboard" : "/mon-tableau");
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
