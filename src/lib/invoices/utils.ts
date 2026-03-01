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

/**
 * Extrait le poids en grammes depuis un nom de produit.
 * Détecte : "500g", "1kg", "1,5 kg", "2 x 500 g", etc.
 * Retourne le poids en grammes, ou null si non trouvé.
 */
export function extractWeightGFromName(name: string): number | null {
  const s = String(name ?? "");

  // kg en premier (plus spécifique que g)
  const kgM = s.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  if (kgM) {
    const n = Number(kgM[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 1000);
  }

  const gM = s.match(/(\d+(?:[.,]\d+)?)\s*g\b/i);
  if (gM) {
    const n = Number(gM[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }

  return null;
}

/**
 * Détecte l'unité d'achat depuis un nom de produit.
 *
 * Règles :
 *  - Contient une masse (kg/g) → "kg"
 *  - Contient un volume (cl/ml/L/litre) → "pc"
 *    Note : les bouteilles sont vendues à la pièce (unit="pc") avec
 *    piece_volume_ml renseigné — jamais unit="l" pour un produit facturé
 *    à la pièce (ex: bouteille 75cl).
 *  - Sinon → "pc" (défaut)
 */
export function detectUnitFromName(name: string): "kg" | "l" | "pc" {
  const s = String(name ?? "");
  if (/\b\d+(?:[.,]\d+)?\s*kg\b/i.test(s)) return "kg";
  if (/\b\d+(?:[.,]\d+)?\s*g\b/i.test(s)) return "kg";
  // volume → pièce (bouteille)
  if (/\d+(?:[.,]\d+)?\s*(?:cl|ml)\b/i.test(s)) return "pc";
  if (/\b\d+(?:[.,]\d+)?\s*(?:litre|litres?|l)\b/i.test(s)) return "pc";
  return "pc";
}
