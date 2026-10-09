"use client";

import { useCallback, useEffect, useState } from "react";
import { useEtablissement } from "@/lib/EtablissementContext";
import { fetchApi } from "@/lib/fetchApi";
import type { ReponseCarte } from "@/app/api/carte/route";

/**
 * Les données de la Carte (touches, fiches, catégories, vins, empâtements), partagées par les vues.
 * La dernière réponse est gardée en sessionStorage : la vue s'affiche tout de suite, puis se rafraîchit.
 * Après une modification (recharger() ou rechargeTick), on demande un recalcul au serveur (?fresh=1).
 */
const formeValide = (d: Partial<ReponseCarte>): d is ReponseCarte =>
  Array.isArray(d.articles) && Array.isArray(d.fiches) && Array.isArray(d.categories) && Array.isArray(d.vins) && Array.isArray(d.empatements) && Array.isArray(d.preparations_anciennes);

export function useDonneesCarte(rechargeTick = 0) {
  const { current: etab } = useEtablissement();
  const [donnees, setDonnees] = useState<ReponseCarte | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const recharger = useCallback(() => setTick((t) => t + 1), []);
  // Clé versionnée : une copie faite par une version précédente de la route (sans fiches, vins…)
  // faisait planter la page (10/10/2026). On vérifie aussi la forme avant de s'en servir.
  const cleCache = `carte:v2:${etab?.id ?? ""}`;

  useEffect(() => {
    let annule = false;
    const fresh = tick > 0 || rechargeTick > 0;
    (async () => {
      await Promise.resolve();
      if (annule) return;
      if (!fresh) {
        try {
          const brut = sessionStorage.getItem(cleCache);
          const copie = brut ? (JSON.parse(brut) as Partial<ReponseCarte>) : null;
          if (copie && formeValide(copie)) setDonnees(copie);
        } catch { /* stockage indisponible */ }
      }
      try {
        const res = await fetchApi(`/api/carte${fresh ? "?fresh=1" : ""}`);
        const json = await res.json();
        if (annule) return;
        if (!res.ok || !formeValide(json)) { setErreur(json?.error ?? "Chargement impossible"); return; }
        setDonnees(json);
        setErreur(null);
        try { sessionStorage.setItem(cleCache, JSON.stringify(json)); } catch { /* quota */ }
      } catch (e) { if (!annule) setErreur(e instanceof Error ? e.message : "Chargement impossible"); }
    })();
    return () => { annule = true; };
  }, [tick, rechargeTick, etab?.id, cleCache]);

  return { donnees, erreur, recharger };
}
