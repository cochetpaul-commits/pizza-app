import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Employe, Contrat, EmployeAvecContrat } from "@/types/rh";

// ── useEmployes ──────────────────────────────────────────────────────────

export function useEmployes(etablissementId: string | null) {
  const [employes, setEmployes] = useState<EmployeAvecContrat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!etablissementId) { setEmployes([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("employes")
      .select("*, contrats(id, employe_id, type, date_debut, date_fin, remuneration, salaire_brut, emploi, qualification, heures_semaine, jours_semaine, actif, created_at)")
      .eq("etablissement_id", etablissementId)
      .order("nom", { ascending: true });
    if (err) { setError(err.message); setLoading(false); return; }
    const mapped: EmployeAvecContrat[] = (data ?? []).map((e) => {
      const contrats = (e.contrats ?? []) as Contrat[];
      const contrat_actif = contrats.find((c) => c.actif) ?? null;
      const { contrats: _contrats, ...rest } = e; // eslint-disable-line @typescript-eslint/no-unused-vars
      return { ...rest, contrat_actif } as EmployeAvecContrat;
    });
    setEmployes(mapped);
    setLoading(false);
  }, [etablissementId]);

  useEffect(() => { void fetch(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [fetch]);

  const create = useCallback(async (data: Partial<Employe>): Promise<Employe | null> => {
    const { data: emp, error: err } = await supabase
      .from("employes")
      .insert({ ...data, etablissement_id: etablissementId })
      .select("*")
      .single();
    if (err || !emp) return null;
    await fetch();
    return emp as Employe;
  }, [etablissementId, fetch]);

  const update = useCallback(async (id: string, data: Partial<Employe>): Promise<boolean> => {
    const { error: err } = await supabase.from("employes").update(data).eq("id", id);
    if (err) return false;
    await fetch();
    return true;
  }, [fetch]);

  const archive = useCallback(async (id: string): Promise<boolean> => {
    const { error: err } = await supabase.from("employes").update({ actif: false }).eq("id", id);
    if (err) return false;
    await fetch();
    return true;
  }, [fetch]);

  return { employes, loading, error, refetch: fetch, create, update, archive };
}

// ── useContrats ──────────────────────────────────────────────────────────

export function useContrats(employeId: string | null) {
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!employeId) { setContrats([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("contrats")
      .select("*")
      .eq("employe_id", employeId)
      .order("date_debut", { ascending: false });
    if (err) { setError(err.message); setLoading(false); return; }
    setContrats((data ?? []) as Contrat[]);
    setLoading(false);
  }, [employeId]);

  useEffect(() => { void fetch(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [fetch]);

  const create = useCallback(async (data: Partial<Contrat>): Promise<boolean> => {
    const { error: err } = await supabase
      .from("contrats")
      .insert({ ...data, employe_id: employeId });
    if (err) return false;
    await fetch();
    return true;
  }, [employeId, fetch]);

  const update = useCallback(async (id: string, data: Partial<Contrat>): Promise<boolean> => {
    const { error: err } = await supabase.from("contrats").update(data).eq("id", id);
    if (err) return false;
    await fetch();
    return true;
  }, [fetch]);

  const clore = useCallback(async (id: string, dateFin: string): Promise<boolean> => {
    const { error: err } = await supabase
      .from("contrats")
      .update({ actif: false, date_fin: dateFin })
      .eq("id", id);
    if (err) return false;
    await fetch();
    return true;
  }, [fetch]);

  return { contrats, loading, error, refetch: fetch, create, update, clore };
}
