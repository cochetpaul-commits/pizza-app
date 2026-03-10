"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Role } from "@/lib/rbac";

type ProfileCtx = {
  role: Role | null;
  displayName: string | null;
  loading: boolean;
  isAdmin: boolean;
  isDirection: boolean;
  canWrite: boolean;
};

const ProfileContext = createContext<ProfileCtx>({
  role: null,
  displayName: null,
  loading: true,
  isAdmin: false,
  isDirection: false,
  canWrite: false,
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchProfile(userId: string) {
      const { data } = await supabase
        .from("profiles")
        .select("role, display_name")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setRole(data.role as Role);
        setDisplayName(data.display_name);
      } else {
        // No profile row yet (race condition on first login) — default cuisine
        setRole("cuisine");
        setDisplayName(null);
      }
      setLoading(false);
    }

    // Initial check
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (data.user) {
        fetchProfile(data.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
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

  const isAdmin = role === "admin";
  const isDirection = role === "direction";
  const cw = role === "admin" || role === "direction";

  return (
    <ProfileContext.Provider value={{ role, displayName, loading, isAdmin, isDirection, canWrite: cw }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
