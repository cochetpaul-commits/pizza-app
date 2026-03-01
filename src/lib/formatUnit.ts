import { fmtQty } from "@/lib/offers";

/**
 * Formate une quantité liquide avec l'unité la plus lisible.
 *
 * Règles (référence interne : ml) :
 *   qty en ml ≥ 1 000  → L    ex: 1500 ml  → "1,5 L"
 *   qty en ml  100–999 → cl   ex: 200 ml   → "20 cl"
 *   qty en ml  < 100   → ml   ex: 50 ml    → "50 ml"
 *
 * Pour les unités non-liquides (g, kg, pc…) → retourne "${qty} ${unit}".
 * Accepte en entrée : "ml", "l", "cl" (casse insensible).
 */
export function formatLiquidQty(qty: number, unit: string): string {
  const u = (unit ?? "").toLowerCase().trim();
  let ml: number;

  if (u === "ml") ml = qty;
  else if (u === "l") ml = qty * 1000;
  else if (u === "cl") ml = qty * 10;
  else return `${fmtQty(qty)} ${unit}`.trim();

  if (ml >= 1000) return `${fmtQty(ml / 1000)} L`;
  if (ml >= 100) return `${fmtQty(ml / 10)} cl`;
  return `${fmtQty(ml)} ml`;
}

/**
 * Même logique que formatLiquidQty, mais retourne un tuple [quantité, unité]
 * pour les affichages à deux colonnes (ex : tableaux PDF).
 *
 * Exemples :
 *   (200, "ml")  → ["20", "cl"]
 *   (1500, "ml") → ["1,5", "L"]
 *   (50, "ml")   → ["50", "ml"]
 *   (200, "g")   → ["200", "g"]
 */
export function formatLiquidQtyParts(
  qty: number | null,
  unit: string | null
): [string, string] {
  if (qty == null) return ["", unit ?? ""];
  const fmt = formatLiquidQty(qty, unit ?? "");
  const sp = fmt.lastIndexOf(" ");
  return sp < 0 ? [fmt, ""] : [fmt.slice(0, sp), fmt.slice(sp + 1)];
}
