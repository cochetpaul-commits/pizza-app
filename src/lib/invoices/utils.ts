/**
 * Extrait le volume en ml depuis un nom de produit.
 * Détecte : 70CL, 75 CL, 1L, 1,5L, 33CL, 50CL, 0,70L, 5L, 330ML…
 * Retourne le volume en millilitres, ou null si non trouvé.
 */
export function extractVolumeFromName(name: string): number | null {
  const s = String(name ?? "");

  // cl en premier (plus spécifique que l)
  const clM = s.match(/(\d+(?:[.,]\d+)?)\s*cl\b/i);
  if (clM) {
    const n = Number(clM[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 10); // cl → ml
  }

  // ml
  const mlM = s.match(/(\d+(?:[.,]\d+)?)\s*ml\b/i);
  if (mlM) {
    const n = Number(mlM[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }

  // l en dernier (évite les faux positifs avec "cl" déjà traité)
  const lM = s.match(/(\d+(?:[.,]\d+)?)\s*l\b/i);
  if (lM) {
    const n = Number(lM[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 1000); // l → ml
  }

  return null;
}
