/**
 * Requêtes `.in(colonne, liste)` par paquets.
 *
 * PostgREST refuse (400, sans message côté supabase-js si `error` n'est pas
 * lu) une URL de plus de ~8 Ko : au-delà de ~200 UUID dans un `in.(…)`, la
 * requête échoue en silence et l'écran affiche une liste vide. Ce helper
 * découpe la liste et lance les paquets en parallèle.
 */
export const IN_CHUNK = 150;

export function chunk<T>(arr: readonly T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type Res<T> = { data: T[] | null; error: { message: string } | null };

/**
 * `run(batch)` reçoit un paquet d'identifiants et renvoie la requête supabase
 * correspondante. Renvoie toutes les lignes concaténées ; la première erreur
 * rencontrée est remontée dans `error`.
 */
export async function inChunks<T>(
  ids: readonly string[],
  run: (batch: string[]) => PromiseLike<Res<T>>,
  size = IN_CHUNK,
): Promise<{ data: T[]; error: string | null }> {
  if (ids.length === 0) return { data: [], error: null };
  const results = await Promise.all(chunk(ids, size).map((b) => run(b)));
  const data: T[] = [];
  let error: string | null = null;
  for (const r of results) {
    if (r.error && !error) error = r.error.message;
    if (r.data) data.push(...r.data);
  }
  return { data, error };
}
