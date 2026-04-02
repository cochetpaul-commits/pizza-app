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
 * Detect pack/multi-unit from product name.
 * Patterns: "X6", "x12", "X24", "6X", "lot de 6", "carton de 12",
 * "pack 6", "6 bouteilles", "6x33cl", "12x20cl", "6X75CL"
 * Returns { count, eachQty, eachUnit } or null.
 */
export function extractPackFromName(name: string): { count: number; eachQty: number | null; eachUnit: string | null } | null {
  const s = String(name ?? "").toUpperCase();

  // Pattern: "6X33CL", "12X20CL", "6X75CL", "24X33CL"
  const multiVolM = s.match(/(\d+)\s*[Xx×]\s*(\d+(?:[.,]\d+)?)\s*(CL|ML|L)\b/);
  if (multiVolM) {
    const count = parseInt(multiVolM[1]);
    let eachQty = parseFloat(multiVolM[2].replace(",", "."));
    const unit = multiVolM[3];
    // Convert to standard: cl→cl, ml→ml, l→l
    if (unit === "ML") eachQty = eachQty;
    else if (unit === "CL") eachQty = eachQty;
    else if (unit === "L") eachQty = eachQty;
    if (count > 1 && count <= 100) {
      return { count, eachQty, eachUnit: unit.toLowerCase() };
    }
  }

  // Pattern: "6X", "X6", "x12", "X24" (standalone)
  const xM = s.match(/\b(\d+)\s*[Xx×]\b|\b[Xx×]\s*(\d+)\b/);
  if (xM) {
    const count = parseInt(xM[1] || xM[2]);
    if (count > 1 && count <= 100) {
      return { count, eachQty: null, eachUnit: null };
    }
  }

  // Pattern: "LOT DE 6", "CARTON DE 12", "PACK 6", "PACK DE 24"
  const lotM = s.match(/\b(?:LOT|CARTON|PACK|CAISSE|COLIS|BTE)\s*(?:DE\s+)?(\d+)\b/);
  if (lotM) {
    const count = parseInt(lotM[1]);
    if (count > 1 && count <= 100) {
      return { count, eachQty: null, eachUnit: null };
    }
  }

  // Pattern: "6 BOUTEILLES", "12 CANETTES", "24 PIECES"
  const nbM = s.match(/\b(\d+)\s*(?:BOUTEILLES?|CANETTES?|PIECES?|UNITES?|FLACONS?|BRIQUES?)\b/);
  if (nbM) {
    const count = parseInt(nbM[1]);
    if (count > 1 && count <= 100) {
      return { count, eachQty: null, eachUnit: null };
    }
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
