import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/** Code tablette : 4 chiffres, haché avec un sel propre à chaque employé (scrypt). Côté serveur seulement. */
export const CODE_VALIDE = /^\d{4}$/;

export function hacherCode(code: string): string {
  const sel = randomBytes(16).toString("hex");
  const h = scryptSync(code, sel, 32).toString("hex");
  return `scrypt$${sel}$${h}`;
}

export function verifierCode(code: string, hash: string | null | undefined): boolean {
  if (!hash) return false;
  const [algo, sel, h] = hash.split("$");
  if (algo !== "scrypt" || !sel || !h) return false;
  const calc = scryptSync(code, sel, 32);
  const attendu = Buffer.from(h, "hex");
  return calc.length === attendu.length && timingSafeEqual(calc, attendu);
}
