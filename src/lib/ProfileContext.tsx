"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import { normalizeRole, type Role } from "@/lib/rbac";
import { hasPermission } from "@/lib/permissions";

type ProfileCtx = {
  role: Role | null;
  displayName: string | null;
  loading: boolean;
  isGroupAdmin: boolean;
  canWrite: boolean;
  /** Check a specific permission for the current user */
  can: (permission: string) => boolean;
};

const ProfileContext = createContext<ProfileCtx>({
  role: null,
  displayName: null,
  loading: true,
  isGroupAdmin: false,
  canWrite: false,
  can: () => false,
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [customPerms, setCustomPerms] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchProfile(userId: string) {
      const { data, error } = await supabase
        .from("profiles")
        .select("role, display_name")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("[ProfileProvider] fetch error:", error.message);
        const { data: rpcRole } = await supabase.rpc("user_role");
        if (cancelled) return;
        if (rpcRole) {
          setRole(normalizeRole(rpcRole as string));
          setDisplayName(null);
        } else {
          setRole("equipier");
          setDisplayName(null);
        }
        setLoading(false);
        return;
      }
      const profileRole = data ? normalizeRole(data.role as string) : "equipier";
      setDisplayName(data?.display_name ?? null);

      // Load custom permissions + role from employes table (linked by auth_user_id)
      const { data: empData } = await supabase
        .from("employes")
        .select("custom_permissions, role")
        .eq("auth_user_id", userId)
        .eq("actif", true)
        .maybeSingle();
      if (!cancelled && empData?.custom_permissions) {
        setCustomPerms(empData.custom_permissions as Record<string, boolean>);
      }

      // Use the highest role between profiles and employes
      const empRole = empData?.role ? normalizeRole(empData.role as string) : "equipier";
      const ROLE_RANK: Record<Role, number> = { group_admin: 3, manager: 2, equipier: 1 };
      const effectiveRole = ROLE_RANK[empRole] > ROLE_RANK[profileRole] ? empRole : profileRole;
      setRole(effectiveRole);

      setLoading(false);
    }

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (data.user) {
        fetchProfile(data.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      // Ignorer TOKEN_REFRESHED / USER_UPDATED : ce n'est PAS un changement
      // d'utilisateur, donc pas besoin de setLoading(true) — sinon RequireRole
      // demonte tout le contenu (perte du state des formulaires en cours).
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
      if (session?.user) {
        setLoading(true);
        setCustomPerms({});
        fetchProfile(session.user.id);
      } else {
        setRole(null);
        setDisplayName(null);
        setCustomPerms({});
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const isGroupAdmin = role === "group_admin";
  const cw = role === "group_admin" || role === "manager";
  const can = (permission: string) => role ? hasPermission(role, permission, customPerms) : false;

  return (
    <ProfileContext.Provider value={{ role, displayName, loading, isGroupAdmin, canWrite: cw, can }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
