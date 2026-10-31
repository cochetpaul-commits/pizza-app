import { createHmac, timingSafeEqual } from "crypto";

/**
 * Jeton d'identification tablette (31/10/2026) : signé côté serveur quand l'employé tape son code, gardé dans la
 * session du navigateur, et présenté aux API qui montrent des chiffres personnels (tableau de bord). La tablette garde
 * les droits de son propre compte ; le jeton dit seulement qui est devant l'écran, pour quelques heures.
 */
export type JetonTablette = { employe_id: string; etab_id: string; exp: number };
const DUREE_MS = 16 * 3600 * 1000;

function secret(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!s) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante");
  return s;
}
const signature = (b64: string) => createHmac("sha256", `tablette|${secret()}`).update(b64).digest("base64url");

export function signerJeton(employe_id: string, etab_id: string, maintenant = Date.now()): string {
  const corps: JetonTablette = { employe_id, etab_id, exp: maintenant + DUREE_MS };
  const b64 = Buffer.from(JSON.stringify(corps)).toString("base64url");
  return `${b64}.${signature(b64)}`;
}

export function verifierJeton(jeton: string | null | undefined, maintenant = Date.now()): JetonTablette | null {
  if (!jeton) return null;
  const [b64, sig] = jeton.split(".");
  if (!b64 || !sig) return null;
  const attendu = Buffer.from(signature(b64)), recu = Buffer.from(sig);
  if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) return null;
  try {
    const corps = JSON.parse(Buffer.from(b64, "base64url").toString()) as JetonTablette;
    if (!corps.employe_id || !corps.etab_id || typeof corps.exp !== "number" || corps.exp < maintenant) return null;
    return corps;
  } catch { return null; }
}
