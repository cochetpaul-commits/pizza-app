"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Etablissement } from "@/types/etablissement";

const LS_KEY = "etab_current_id";
const LS_GROUP = "etab_group_view";

type EtablissementCtx = {
  /** Currently selected establishment (null in group view) */
  current: Etablissement | null;
  setCurrent: (e: Etablissement | null) => void;
  /** All establishments accessible to this user */
  etablissements: Etablissement[];
  /** Whether the user is viewing consolidated group mode */
  isGroupView: boolean;
  setGroupView: (b: boolean) => void;
  /** Whether user has group admin privileges */
  isGroupAdmin: boolean;
  loading: boolean;
};

const EtablissementContext = createContext<EtablissementCtx>({
  current: null,
  setCurrent: () => {},
  etablissements: [],
  isGroupView: false,
  setGroupView: () => {},
  isGroupAdmin: false,
  loading: true,
});

export function EtablissementProvider({ children }: { children: ReactNode }) {
  const [etablissements, setEtablissements] = useState<Etablissement[]>([]);
  const [current, setCurrentRaw] = useState<Etablissement | null>(null);
  const [isGroupView, setGroupViewRaw] = useState(false);
  const [isGroupAdmin, setIsGroupAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { data: u } = await supabase.auth.getUser();
      if (cancelled || !u.user) { setLoading(false); return; }

      // Fetch profile for group admin flag + access list
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_group_admin, etablissements_access")
        .eq("id", u.user.id)
        .maybeSingle();

      const groupAdmin = profile?.is_group_admin ?? false;
      const accessIds: string[] = profile?.etablissements_access ?? [];

      setIsGroupAdmin(groupAdmin);

      // Fetch all active establishments
      const { data: etabs } = await supabase
        .from("etablissements")
        .select("*")
        .eq("actif", true)
        .order("nom");

      if (cancelled) return;

      // Filter to accessible ones (group admin sees all)
      const all = (etabs ?? []) as Etablissement[];
      const accessible = groupAdmin
        ? all
        : all.filter(e => accessIds.includes(e.id));

      setEtablissements(accessible);

      // Restore persisted choice
      const savedId = localStorage.getItem(LS_KEY);
      const savedGroup = localStorage.getItem(LS_GROUP) === "true";

      if (groupAdmin && savedGroup) {
        setGroupViewRaw(true);
        setCurrentRaw(null);
      } else if (savedId) {
        const found = accessible.find(e => e.id === savedId);
        setCurrentRaw(found ?? accessible[0] ?? null);
        setGroupViewRaw(false);
      } else if (groupAdmin) {
        // Default: group view for admins
        setGroupViewRaw(true);
        setCurrentRaw(null);
      } else {
        // Default: first accessible establishment
        setCurrentRaw(accessible[0] ?? null);
        setGroupViewRaw(false);
      }

      setLoading(false);
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setEtablissements([]);
        setCurrentRaw(null);
        setGroupViewRaw(false);
        setIsGroupAdmin(false);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const setCurrent = useCallback((e: Etablissement | null) => {
    setCurrentRaw(e);
    if (e) {
      localStorage.setItem(LS_KEY, e.id);
      localStorage.setItem(LS_GROUP, "false");
      setGroupViewRaw(false);
    }
  }, []);

  const setGroupView = useCallback((b: boolean) => {
    setGroupViewRaw(b);
    localStorage.setItem(LS_GROUP, b ? "true" : "false");
    if (b) setCurrentRaw(null);
  }, []);

  return (
    <EtablissementContext.Provider value={{
      current,
      setCurrent,
      etablissements,
      isGroupView,
      setGroupView,
      isGroupAdmin,
      loading,
    }}>
      {children}
    </EtablissementContext.Provider>
  );
}

export function useEtablissement() {
  return useContext(EtablissementContext);
}
