import { supabase } from "@/lib/supabaseClient";

/**
 * Réglages libres par établissement (table etablissement_params, clé → JSON).
 * Partagés entre appareils, contrairement au localStorage.
 *
 * Clés utilisées :
 *  - "croisiere_structure" : overrides du seuil (gerants, ms, fixes, foodCost)
 *  - "croisiere_sim"       : paramètres du simulateur de croisière
 *  - "ms_salaires_simules" : salaires ajustés (empId → montant) de Masse salariale
 */
export async function loadEtabParam<T>(etabId: string, cle: string): Promise<T | null> {
  const { data, error } = await supabase
    .from("etablissement_params")
    .select("valeur")
    .eq("etablissement_id", etabId)
    .eq("cle", cle)
    .maybeSingle();
  if (error || !data) return null;
  return (data.valeur as T) ?? null;
}

export async function saveEtabParam(etabId: string, cle: string, valeur: unknown): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  await supabase.from("etablissement_params").upsert(
    { etablissement_id: etabId, cle, valeur, updated_at: new Date().toISOString(), updated_by: auth?.user?.id ?? null },
    { onConflict: "etablissement_id,cle" },
  );
}

export async function deleteEtabParam(etabId: string, cle: string): Promise<void> {
  await supabase.from("etablissement_params").delete().eq("etablissement_id", etabId).eq("cle", cle);
}

/** Sauvegarde différée (évite une requête par cran de slider). */
const timers = new Map<string, ReturnType<typeof setTimeout>>();
export function saveEtabParamDebounced(etabId: string, cle: string, valeur: unknown, delayMs = 600): void {
  const k = `${etabId}:${cle}`;
  const t = timers.get(k);
  if (t) clearTimeout(t);
  timers.set(k, setTimeout(() => { timers.delete(k); void saveEtabParam(etabId, cle, valeur); }, delayMs));
}
