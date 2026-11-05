"use client";

import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Commande à plusieurs (05/11/2026) : quand quelqu'un d'autre modifie la commande affichée (autre tablette,
 * téléphone, ordinateur), l'écran se recharge tout seul. Les changements faits sur cet écran (moins de 4 s)
 * ne déclenchent pas de rechargement, pour ne pas écraser une saisie en cours.
 * Renvoie `marquer()` : à appeler à chaque écriture locale.
 */
export function useMajCommande(sessionId: string | null | undefined, recharger: () => void): () => void {
  const derniere = useRef(0);
  const rappel = useRef(recharger);
  useEffect(() => { rappel.current = recharger; }, [recharger]);
  useEffect(() => {
    if (!sessionId) return;
    let minuteur: ReturnType<typeof setTimeout> | null = null;
    const canal = supabase
      .channel(`commande-${sessionId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "commande_sessions", filter: `id=eq.${sessionId}` }, () => {
        if (Date.now() - derniere.current < 4000) return;
        if (minuteur) clearTimeout(minuteur);
        minuteur = setTimeout(() => rappel.current(), 600);
      })
      .subscribe();
    return () => { if (minuteur) clearTimeout(minuteur); void supabase.removeChannel(canal); };
  }, [sessionId]);
  return useCallback(() => { derniere.current = Date.now(); }, []);
}
