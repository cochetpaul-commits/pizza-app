import "server-only";

/**
 * Programme de fidélité de Piccola Mia (27/11/2026). Le module vit à part (fidelite.piccolamia.fr, sa propre base) :
 * l'app ne fait que l'interroger, rien n'est copié ici. Toute la logique et les contrôles sont dans les fonctions
 * de la base fidélité ; on les appelle avec un jeton de gérance réservé à l'app.
 */
const URL_BASE = process.env.FIDELITE_SUPABASE_URL;
const CLE = process.env.FIDELITE_SUPABASE_ANON_KEY;
const JETON = process.env.FIDELITE_JETON;

export const fideliteConfiguree = () => !!(URL_BASE && CLE && JETON);

export async function appelFidelite<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<{ data: T | null; erreur: string | null }> {
  if (!fideliteConfiguree()) return { data: null, erreur: "non_configure" };
  try {
    const r = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: CLE!, Authorization: `Bearer ${CLE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...args, p_token: JETON }),
      cache: "no-store",
    });
    const texte = await r.text();
    const corps = texte ? JSON.parse(texte) : null;
    if (!r.ok) return { data: null, erreur: (corps && corps.message) || "erreur_serveur" };
    return { data: corps as T, erreur: null };
  } catch {
    return { data: null, erreur: "erreur_reseau" };
  }
}
