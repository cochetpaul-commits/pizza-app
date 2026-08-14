"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Cache de brouillon pour les formulaires de recette.
 *
 * Corriger un ingrédient depuis une recette navigue vers /ingredients puis
 * revient : sans cache, tout le travail en cours était perdu. Ce hook
 * persiste un instantané du formulaire en localStorage et le restaure
 * silencieusement au retour (même clé), tant que le brouillon a moins de
 * `ttlMs` (6 h par défaut).
 *
 * - `ready` : passer à true une fois le chargement initial terminé (la
 *   restauration n'écrase jamais un formulaire encore en train de charger).
 * - `snapshot` : l'état à persister (objet JSON-sérialisable).
 * - `restore` : ré-applique un instantané aux states du formulaire.
 * - `clearDraft` : à appeler après une sauvegarde réussie, une annulation
 *   explicite ou une suppression.
 */
export function useRecipeDraft<T extends object>({ key, ready, snapshot, restore, ttlMs = 6 * 60 * 60 * 1000 }: {
  key: string;
  ready: boolean;
  snapshot: T;
  restore: (draft: T) => void;
  ttlMs?: number;
}): { clearDraft: () => void } {
  const readyRef = useRef(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  // Restauration unique, dès que le formulaire a fini de charger
  useEffect(() => {
    if (!ready || readyRef.current) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const d = JSON.parse(raw) as { ts?: number; data?: T };
        if (d?.data && Date.now() - (d.ts ?? 0) < ttlMs) {
          restoreRef.current(d.data);
        } else {
          localStorage.removeItem(key);
        }
      }
    } catch { /* stockage indisponible : pas de cache, non bloquant */ }
    readyRef.current = true;
  }, [ready, key, ttlMs]);

  // Persistance à chaque changement (après restauration)
  const serialized = JSON.stringify(snapshot);
  useEffect(() => {
    if (!readyRef.current) return;
    try {
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: JSON.parse(serialized) }));
    } catch { /* quota plein : non bloquant */ }
  }, [serialized, key]);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(key); } catch { /* */ }
  }, [key]);

  return { clearDraft };
}
