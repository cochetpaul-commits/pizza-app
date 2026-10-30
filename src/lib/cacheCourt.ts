/**
 * Mémoire courte des réponses d'analyse (30/10/2026), par instance serveur : une page rouverte dans la minute
 * ne recalcule pas tout. `?fresh=1` force le recalcul ; une écriture appelle `invaliderCache(prefixe)`.
 */
const memoire = new Map<string, { quand: number; valeur: unknown }>();
const DUREE_MS = 60 * 1000;

export function lireCache<T>(cle: string): T | null {
  const e = memoire.get(cle);
  if (!e) return null;
  if (Date.now() - e.quand > DUREE_MS) { memoire.delete(cle); return null; }
  return e.valeur as T;
}
export function ecrireCache<T>(cle: string, valeur: T): T {
  if (memoire.size > 500) memoire.clear();
  memoire.set(cle, { quand: Date.now(), valeur });
  return valeur;
}
export function invaliderCache(prefixe: string): void {
  for (const k of memoire.keys()) if (k.startsWith(prefixe)) memoire.delete(k);
}
