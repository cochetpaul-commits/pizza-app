"use client";

import { useEffect } from "react";
import { useEtablissement } from "@/lib/EtablissementContext";

/**
 * Les pages qui se calculent PAR restaurant (Ventes, Produits, Rentabilité,
 * Masse salariale…) ne doivent jamais rester sur « Choisis un établissement » :
 * en vue groupe (admin), on sélectionne automatiquement le dernier
 * établissement utilisé (mémoire locale), sinon le premier accessible.
 */
export function useEtabAuto() {
  const { current, etablissements, setCurrent, setGroupView, loading } = useEtablissement();
  useEffect(() => {
    if (loading || current || etablissements.length === 0) return;
    let savedId: string | null = null;
    try { savedId = localStorage.getItem("etab_current_id"); } catch { /* ignore */ }
    const pick = etablissements.find(e => e.id === savedId) ?? etablissements[0];
    if (pick) { setGroupView(false); setCurrent(pick); }
  }, [loading, current, etablissements, setCurrent, setGroupView]);
}
