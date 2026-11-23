"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Paires « pas un doublon » (24/11/2026). Elles vivaient dans le navigateur (localStorage) : écartées sur un
 * appareil, elles revenaient sur les autres (Paul : « ça n'a pas sauvegardé »). Elles sont maintenant dans la table
 * doublons_ecartes, partagée. Les anciennes clés du navigateur sont remontées dans la table à la première ouverture.
 */
const CLE_LOCALE = "ingredient-duplicate-ignores";
/** Clé canonique d'une paire : les deux identifiants triés, séparés par « | » (comme la détection) */
export const clePaire = (id1: string, id2: string) => [id1, id2].sort().join("|");
/** Anciennes clés locales : « a|b » (page Doublons) ou « a:b » (bandeau de la fiche) */
const normaliser = (k: string) => { const p = k.split(/[|:]/); return p.length === 2 && p[0] && p[1] ? clePaire(p[0], p[1]) : null; };

function lireLocales(): string[] {
  try { return (JSON.parse(localStorage.getItem(CLE_LOCALE) ?? "[]") as string[]).map(normaliser).filter((k): k is string => !!k); } catch { return []; }
}

export function useDoublonsEcartes(): { ignores: Set<string>; pret: boolean; erreur: string | null; ecarter: (cles: string[]) => Promise<boolean> } {
  const [ignores, setIgnores] = useState<Set<string>>(() => new Set(typeof window === "undefined" ? [] : lireLocales()));
  const [pret, setPret] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      const locales = lireLocales();
      const lues: string[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from("doublons_ecartes").select("pair_key").order("pair_key").range(de, de + 999);
        if (error) { if (!annule) { setErreur(error.message); setPret(true); } return; }
        lues.push(...(data ?? []).map((r) => String(r.pair_key)));
        if ((data ?? []).length < 1000) break;
      }
      // Remontée des paires écartées sur cet appareil avant le 24/11/2026
      const enBase = new Set(lues);
      const aRemonter = [...new Set(locales)].filter((k) => !enBase.has(k));
      if (aRemonter.length) {
        const { error } = await supabase.from("doublons_ecartes").upsert(aRemonter.map((pair_key) => ({ pair_key })), { onConflict: "pair_key", ignoreDuplicates: true });
        if (!error) aRemonter.forEach((k) => enBase.add(k));
      }
      if (!annule) { setIgnores(new Set([...enBase, ...locales])); setPret(true); }
    })();
    return () => { annule = true; };
  }, []);

  const ecarter = useCallback(async (cles: string[]) => {
    const propres = [...new Set(cles.map(normaliser).filter((k): k is string => !!k))];
    if (!propres.length) return true;
    setIgnores((s) => { const n = new Set(s); propres.forEach((k) => n.add(k)); return n; });
    try { localStorage.setItem(CLE_LOCALE, JSON.stringify([...new Set([...lireLocales(), ...propres])])); } catch { /* navigation privée */ }
    const { error } = await supabase.from("doublons_ecartes").upsert(propres.map((pair_key) => ({ pair_key })), { onConflict: "pair_key", ignoreDuplicates: true });
    if (error) { setErreur(error.message); return false; }
    return true;
  }, []);

  return { ignores, pret, erreur, ecarter };
}
