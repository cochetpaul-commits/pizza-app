"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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
  // Dernier utilisateur charge — evite de recharger (et de demonter toute
  // l'app via loading=true) quand supabase re-emet SIGNED_IN pour le meme
  // utilisateur (ex. a chaque getSession() d'une page).
  const lastUserIdRef = useRef<string | null>(null);

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

      // Load custom permissions + role from employes table (linked by auth_user_id).
      // Un employé peut avoir une fiche par établissement : maybeSingle()
      // échouait alors et TOUTES les permissions accordées étaient ignorées.
      let { data: empRows } = await supabase
        .from("employes")
        .select("custom_permissions, role")
        .eq("auth_user_id", userId)
        .eq("actif", true);
      if (cancelled) return;

      // Aucune fiche liée ? Tenter l'auto-liaison par email (rattrape les
      // comptes créés sans invitation), puis relire.
      if (!empRows || empRows.length === 0) {
        try {
          const { data: sess } = await supabase.auth.getSession();
          const token = sess?.session?.access_token;
          if (token) {
            const res = await fetch("/api/auth/link-employe", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
            });
            const d = await res.json().catch(() => null);
            if (d?.linked > 0) {
              const { data: retry } = await supabase
                .from("employes")
                .select("custom_permissions, role")
                .eq("auth_user_id", userId)
                .eq("actif", true);
              empRows = retry;
            }
          }
        } catch { /* auto-liaison best-effort */ }
        if (cancelled) return;
      }

      const mergedPerms: Record<string, boolean> = {};
      let bestEmpRole: Role = "equipier";
      const ROLE_RANK: Record<Role, number> = { group_admin: 3, manager: 2, equipier: 1 };
      for (const emp of empRows ?? []) {
        const perms = (emp.custom_permissions ?? {}) as Record<string, boolean>;
        // En cas de conflit entre fiches, l'accès accordé l'emporte
        for (const [k, v] of Object.entries(perms)) mergedPerms[k] = mergedPerms[k] === true ? true : v;
        const r = emp.role ? normalizeRole(emp.role as string) : "equipier";
        if (ROLE_RANK[r] > ROLE_RANK[bestEmpRole]) bestEmpRole = r;
      }
      setCustomPerms(mergedPerms);

      // Use the highest role between profiles and employes
      const effectiveRole = ROLE_RANK[bestEmpRole] > ROLE_RANK[profileRole] ? bestEmpRole : profileRole;
      setRole(effectiveRole);

      setLoading(false);
    }

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (data.user) {
        lastUserIdRef.current = data.user.id;
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
        // Meme utilisateur deja charge → ne rien faire (SIGNED_IN est
        // re-emis par supabase-js sans changement reel de session)
        if (session.user.id === lastUserIdRef.current) return;
        lastUserIdRef.current = session.user.id;
        setLoading(true);
        setCustomPerms({});
        fetchProfile(session.user.id);
      } else {
        lastUserIdRef.current = null;
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
