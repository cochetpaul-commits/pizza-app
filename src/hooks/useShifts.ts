import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Shift } from "@/types/rh";

type ByEmployeDay = Record<string, Record<string, Shift[]>>;

export function useShifts(
  etablissementId: string | null,
  dateDebut: string,
  dateFin: string,
) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!etablissementId) { setShifts([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("shifts")
      .select("*")
      .eq("etablissement_id", etablissementId)
      .gte("date", dateDebut)
      .lte("date", dateFin);
    if (err) { setError(err.message); setLoading(false); return; }
    setShifts((data ?? []) as Shift[]);
    setLoading(false);
  }, [etablissementId, dateDebut, dateFin]);

  useEffect(() => { void fetch(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [fetch]);

  const byEmployeDay = useMemo<ByEmployeDay>(() => {
    const map: ByEmployeDay = {};
    for (const s of shifts) {
      if (!map[s.employe_id]) map[s.employe_id] = {};
      if (!map[s.employe_id][s.date]) map[s.employe_id][s.date] = [];
      map[s.employe_id][s.date].push(s);
    }
    return map;
  }, [shifts]);

  const createShift = useCallback(async (data: Partial<Shift>): Promise<Shift | null> => {
    const { data: created, error: err } = await supabase
      .from("shifts")
      .insert({ ...data, etablissement_id: etablissementId })
      .select("*")
      .single();
    if (err || !created) return null;
    const shift = created as Shift;
    setShifts((prev) => [...prev, shift]);
    return shift;
  }, [etablissementId]);

  const updateShift = useCallback(async (id: string, data: Partial<Shift>): Promise<boolean> => {
    const { data: updated, error: err } = await supabase
      .from("shifts")
      .update(data)
      .eq("id", id)
      .select("*")
      .single();
    if (err || !updated) return false;
    setShifts((prev) => prev.map((s) => s.id === id ? (updated as Shift) : s));
    return true;
  }, []);

  const deleteShift = useCallback(async (id: string): Promise<boolean> => {
    const { error: err } = await supabase.from("shifts").delete().eq("id", id);
    if (err) return false;
    setShifts((prev) => prev.filter((s) => s.id !== id));
    return true;
  }, []);

  const publishWeek = useCallback(async (debut: string, fin: string): Promise<number> => {
    const { data, error: err } = await supabase
      .from("shifts")
      .update({ statut: "publié" })
      .eq("etablissement_id", etablissementId)
      .gte("date", debut)
      .lte("date", fin)
      .eq("statut", "brouillon")
      .select("id");
    if (err) return 0;
    const count = data?.length ?? 0;
    if (count > 0) await fetch();
    return count;
  }, [etablissementId, fetch]);

  const dupliquerSemaine = useCallback(async (opts: {
    sourceDateDebut: string;
    sourceDateFin: string;
    targetDateDebut: string;
  }): Promise<number> => {
    const { data: sourceShifts, error: err } = await supabase
      .from("shifts")
      .select("employe_id, poste_id, heure_debut, heure_fin, pause_minutes, note, date")
      .eq("etablissement_id", etablissementId)
      .gte("date", opts.sourceDateDebut)
      .lte("date", opts.sourceDateFin);
    if (err || !sourceShifts?.length) return 0;

    const sourceMonday = new Date(opts.sourceDateDebut);
    const targetMonday = new Date(opts.targetDateDebut);
    const diffMs = targetMonday.getTime() - sourceMonday.getTime();

    const newShifts = sourceShifts.map((s) => {
      const d = new Date(s.date);
      d.setTime(d.getTime() + diffMs);
      return {
        employe_id: s.employe_id,
        poste_id: s.poste_id,
        etablissement_id: etablissementId,
        date: d.toISOString().slice(0, 10),
        heure_debut: s.heure_debut,
        heure_fin: s.heure_fin,
        pause_minutes: s.pause_minutes,
        note: s.note,
        statut: "brouillon",
      };
    });

    const { data: inserted, error: insertErr } = await supabase
      .from("shifts")
      .insert(newShifts)
      .select("id");
    if (insertErr) return 0;
    await fetch();
    return inserted?.length ?? 0;
  }, [etablissementId, fetch]);

  return { shifts, byEmployeDay, loading, error, refetch: fetch, createShift, updateShift, deleteShift, publishWeek, dupliquerSemaine };
}
