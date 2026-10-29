"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { detectDuplicates, type DuplicatePair } from "@/lib/duplicateDetection";
import type { Ingredient, LatestOffer } from "@/types/ingredients";

/**
 * Doublons probables (29/10/2026) : une seule source pour la tuile de la Base produits et la page
 * Doublons. Toutes les fiches actives (pas seulement celles chargées dans la liste), l'offre active la
 * plus récente de chacune, et la détection commune (noms proches à 80 % chez un même fournisseur).
 */
export type EtatDoublons = {
  chargement: boolean; erreur: string | null;
  produits: Ingredient[]; offres: Map<string, LatestOffer>; fournisseurs: Map<string, string>;
};
const VIDE: EtatDoublons = { chargement: true, erreur: null, produits: [], offres: new Map(), fournisseurs: new Map() };

export function useDoublons(ignores: Set<string>, version = 0): EtatDoublons & { paires: DuplicatePair[] } {
  const [etat, setEtat] = useState<EtatDoublons>(VIDE);
  useEffect(() => {
    let annule = false;
    (async () => {
      setEtat((e) => ({ ...e, chargement: true, erreur: null }));
      try {
        const [{ data: produits, error: e1 }, { data: offres, error: e2 }, { data: fournisseurs }] = await Promise.all([
          supabase.from("ingredients").select("id, name, category, sub_category, is_active, supplier_id").eq("is_active", true).order("name"),
          supabase.from("supplier_offers").select("ingredient_id, supplier_id, created_at, unit_price, unit").eq("is_active", true).order("created_at", { ascending: false }),
          supabase.from("suppliers").select("id, name"),
        ]);
        if (e1) throw new Error(e1.message);
        if (e2) throw new Error(e2.message);
        const parProduit = new Map<string, LatestOffer>();
        for (const o of (offres ?? []) as unknown as LatestOffer[]) if (!parProduit.has(o.ingredient_id)) parProduit.set(o.ingredient_id, o);
        if (!annule) setEtat({ chargement: false, erreur: null, produits: (produits ?? []) as unknown as Ingredient[], offres: parProduit, fournisseurs: new Map((fournisseurs ?? []).map((f) => [f.id as string, f.name as string])) });
      } catch (e) { if (!annule) setEtat((s) => ({ ...s, chargement: false, erreur: e instanceof Error ? e.message : "Chargement impossible" })); }
    })();
    return () => { annule = true; };
  }, [version]);
  const paires = useMemo(() => detectDuplicates(etat.produits, etat.offres, ignores), [etat.produits, etat.offres, ignores]);
  return { ...etat, paires };
}
