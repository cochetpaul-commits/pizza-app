/*
 * SUM invoice parser
 *
 * Format SUM — Italian specialty distributor (Bussy-Saint-Georges)
 * pdfjs-dist produces one long string per page.
 *
 * Column order in extracted text:
 *   REF → DESIGNATION → QTÉ(comma decimals) → PU_HT(2dec) → MT_HT€ → N°_LOT → PU_NET(2dec)
 *
 * Key characteristics:
 * - Ref format: 2-6 uppercase letters + 1-3 digits (ANT135, FORM161, SALUM1, FA02)
 * - Quantities use comma decimals (2,000 / 12,0 / 6,915)
 * - Total always suffixed with € (41,86€)
 * - RUPTURE lines: "Name REF RUPTURE" — out of stock, skip
 * - No remise in practice (PU HT = PU Net)
 * - All products 5.5% TVA (food)
 * - Establishment detection: FRATELLI → piccola_mia
 */

import type { ParsedIngredient, ParseResult, ParseLog } from "./types";
import { parseFrenchNumber, extractInlineUnit } from "./normalizeUnit";
import { detectCategorieFromName } from "./categories";

// ── Helpers ─────────────────────────────────────────────────────────────────

function detectEtablissement(text: string): string | null {
  const upper = text.toUpperCase();
  if (upper.includes("SASHA") || upper.includes("BELLO MIO")) return "bello_mio";
  if (upper.includes("FRATELLI") || upper.includes("PICCOLA MIA")) return "piccola_mia";
  return null;
}

function extractMeta(text: string) {
  // Invoice number: FA followed by digits (e.g., FA2506392)
  const numMatch = text.match(/\b(FA\d{5,})\b/);
  // Date: DD/MM/YY next to invoice number
  const dateMatch = text.match(/FA\d+\s+(\d{2}\/\d{2}\/\d{2})\b/);
  // Totals on last page: "C2   2 624,32€   5,5%   144,34€"
  // First number after C2 = HT base
  const htMatch = text.match(/\bC2\s+([\d\s]+,\d{2})€/);
  // TTC: "Total TTC ... X€" or "Prélèvement X€" or from C2 line "... Total TTC ... X€"
  const ttcMatch = text.match(/Total\s+TTC.*?([\d\s]+,\d{2})€/)
    ?? text.match(/Pr[ée]l[èe]vement\s+([\d\s]+,\d{2})€/);

  return {
    invoice_number: numMatch?.[1] ?? null,
    invoice_date: dateMatch?.[1] ?? null,
    total_ht: htMatch ? parseFrenchNumber(htMatch[1]) : null,
    total_ttc: ttcMatch ? parseFrenchNumber(ttcMatch[1]) : null,
  };
}

// ── Product line regex ──────────────────────────────────────────────────────
// REF  NAME  QTY(comma,1-3dec)  LOT  PU_HT(comma,2dec)  [REMISE]  PU_NET(comma,2dec)  TOTAL(comma,2dec)€
// Quantities always use comma. Names may contain periods (0.2, 2.5kg) but not commas.

const RE_PRODUCT = /\b([A-Z]{2,6}\d{1,3})(?!\s+RUPTURE)\s+(.*?)\s+(\d+,\d{1,3})\s+(\S+)\s+(\d+,\d{2})\s+(\d+,\d{2})\s+(\d+,\d{2})\s*[€eæC¤]?/g;

// RUPTURE: "Name REF RUPTURE" — skip these
const RE_RUPTURE = /\b([A-Z]{2,6}\d{1,3})\s+RUPTURE\b/g;

// ── Parser ──────────────────────────────────────────────────────────────────

export function parseSum(text: string, etablissement: string): ParseResult {
  const meta = extractMeta(text);
  const detectedEtab = detectEtablissement(text);
  const etab = etablissement || detectedEtab || "bello_mio";

  const ingredients: ParsedIngredient[] = [];
  const logs: ParseLog[] = [];

  // Log RUPTURE lines
  let ruptureMatch: RegExpExecArray | null;
  RE_RUPTURE.lastIndex = 0;
  while ((ruptureMatch = RE_RUPTURE.exec(text)) !== null) {
    logs.push({
      line_number: 0,
      raw: ruptureMatch[0],
      rule: "sum_rupture",
      result: "skipped",
      detail: `RUPTURE: ${ruptureMatch[1]}`,
    });
  }

  let match: RegExpExecArray | null;
  let matchCount = 0;

  RE_PRODUCT.lastIndex = 0;

  while ((match = RE_PRODUCT.exec(text)) !== null) {
    matchCount++;
    const [fullMatch, ref, nameRaw, qtyStr, _lot, puHtStr, puNetStr, totalStr] = match;
    void _lot;

    // Clean name: collapse whitespace
    const name = nameRaw.replace(/\s+/g, " ").trim();

    // Skip header remnants
    if (name.includes("Désignation") || name.includes("Référence")) continue;

    const qty = parseFrenchNumber(qtyStr);
    const puHt = parseFrenchNumber(puHtStr);
    const puNet = parseFrenchNumber(puNetStr);
    const total = parseFrenchNumber(totalStr);

    if (!name || total == null) {
      logs.push({
        line_number: matchCount,
        raw: fullMatch.replace(/\s+/g, " ").slice(0, 120),
        rule: "sum_invalid",
        result: "error",
        detail: "missing name or total",
      });
      continue;
    }

    // Use PU Net (after remise) as unit price, fallback to PU HT
    const prixUnit = puNet ?? puHt ?? 0;

    // SUM sells by weight (kg) — quantities like 2,318 / 6,915 are kg
    // For piece items (integer qty like 12,0 / 6,000 / 8,000), unit = pcs
    // Heuristic: if qty has non-zero decimals beyond .000, it's weight
    const isWeight = qty != null && qty % 1 !== 0 && !qtyStr.endsWith(",000") && !qtyStr.endsWith(",0");
    const unitCommande = isWeight ? ("kg" as const) : ("pcs" as const);

    // Extract inline weight/volume from name for piece items
    const inline = !isWeight ? extractInlineUnit(name) : null;
    const unitRecette = isWeight ? ("kg" as const) : (inline?.unit_recette ?? ("pcs" as const));

    // Category detection
    const cat = detectCategorieFromName(name);

    // Confidence: check qty × prix ≈ total
    let confidence: "high" | "medium" | "low" = "high";
    if (qty != null && prixUnit != null && total != null) {
      const expected = qty * prixUnit;
      const tolerance = Math.max(0.10, total * 0.01);
      if (Math.abs(expected - total) > tolerance) {
        confidence = "medium";
      }
    }

    ingredients.push({
      name,
      reference: ref,
      unit_recette: unitRecette,
      unit_commande: unitCommande,
      poids_unitaire: isWeight ? qty ?? undefined : (inline?.type === "poids" ? inline.value : undefined),
      volume_unitaire: inline?.type === "volume" ? inline.value : undefined,
      prix_unitaire: prixUnit,
      prix_commande: total,
      categorie: cat,
      fournisseur_slug: "sum",
      etablissement_id: etab,
      raw_line: fullMatch.replace(/\s+/g, " ").slice(0, 200),
      confidence,
    });

    logs.push({
      line_number: matchCount,
      raw: fullMatch.replace(/\s+/g, " ").slice(0, 120),
      rule: isWeight ? "sum_weight" : "sum_piece",
      result: "ok",
      detail: `${name} ${qty}${isWeight ? "kg" : "pcs"} @${prixUnit}€ = ${total}€`,
    });
  }

  if (matchCount === 0) {
    logs.push({
      line_number: 0,
      raw: text.slice(0, 200),
      rule: "sum_no_match",
      result: "error",
      detail: "No product lines found",
    });
  }

  return {
    fournisseur: "sum",
    etablissement: etab,
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    ingredients,
    logs,
  };
}
