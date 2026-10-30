"use client";

import { useEffect, useState } from "react";
import type { DateRange } from "@/components/ui/DateRangePicker";
import { fetchApi } from "@/lib/fetchApi";
import { useEtablissement } from "@/lib/EtablissementContext";
import type { LigneEvenementiel } from "@/lib/pennylane/syncEvenementiel";

export type TotauxEvenementiel = { facture_ht: number; facture_ttc: number; encaisse_ttc: number; a_encaisser_ttc: number; nb_factures: number; devis_en_attente: number; devis_en_attente_ht: number };
export type EtatEvenementiel = { chargement: boolean; erreur: string | null; lignes: LigneEvenementiel[]; totaux: TotauxEvenementiel | null; synchro_at: string | null };

/** Devis et factures Pennylane de la période (Piccola Mia). Ne charge rien quand l'établissement n'est pas Piccola Mia. */
export function useEvenementiel(range: DateRange, version = 0): EtatEvenementiel & { estPiccola: boolean } {
  const { current: etab } = useEtablissement();
  const etabId = etab?.id ?? "";
  const estPiccola = !!etab?.slug?.includes("piccola");
  const cle = `${etabId}|${range.from}|${range.to}|${version}`;
  const [etat, setEtat] = useState<EtatEvenementiel & { cle: string }>({ cle: "", chargement: true, erreur: null, lignes: [], totaux: null, synchro_at: null });
  useEffect(() => {
    if (!etabId || !estPiccola) return;
    let annule = false;
    fetchApi(`/api/evenementiel?etablissement_id=${etabId}&from=${range.from}&to=${range.to}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (annule) return;
      if (!r.ok) { setEtat({ cle, chargement: false, erreur: j?.error ?? "Chargement impossible", lignes: [], totaux: null, synchro_at: null }); return; }
      setEtat({ cle, chargement: false, erreur: null, lignes: j.lignes ?? [], totaux: j.totaux ?? null, synchro_at: j.synchro_at ?? null });
    }).catch((e) => { if (!annule) setEtat({ cle, chargement: false, erreur: e instanceof Error ? e.message : "Chargement impossible", lignes: [], totaux: null, synchro_at: null }); });
    return () => { annule = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, estPiccola]);
  if (!estPiccola) return { chargement: false, erreur: null, lignes: [], totaux: null, synchro_at: null, estPiccola };
  if (etat.cle !== cle) return { chargement: true, erreur: null, lignes: etat.lignes, totaux: etat.totaux, synchro_at: etat.synchro_at, estPiccola };
  return { ...etat, estPiccola };
}
