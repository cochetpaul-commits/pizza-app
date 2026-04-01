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
      if (data) {
        setRole(normalizeRole(data.role as string));
        setDisplayName(data.display_name);
      } else {
        setRole("equipier");
        setDisplayName(null);
      }
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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session?.user) {
        setLoading(true);
        fetchProfile(session.user.id);
      } else {
        setRole(null);
        setDisplayName(null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const isGroupAdmin = role === "group_admin";
  const cw = role === "group_admin";
  const can = (permission: string) => role ? hasPermission(role, permission) : false;

  return (
    <ProfileContext.Provider value={{ role, displayName, loading, isGroupAdmin, canWrite: cw, can }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
