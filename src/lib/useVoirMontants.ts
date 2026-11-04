"use client";

import { useProfile } from "@/lib/ProfileContext";
import { useTablette } from "@/lib/tablette/store";

/**
 * Montants des recettes (05/11/2026, demande de Paul) : coûts, prix, marges et food cost ne se montrent
 * qu'aux administrateurs et aux managers (permission « performances.show_money »), jamais sur la tablette partagée.
 */
export function useVoirMontants(): boolean {
  const { can, loading } = useProfile();
  const tablette = useTablette();
  if (loading) return false;
  return can("performances.show_money") && !tablette.actif;
}
