/*
 * Armor Emballages invoice parser
 *
 * Format Armor — packaging supplier (Caudan)
 * pdfjs-dist produces triple-space separated tokens per page.
 *
 * Column order:
 *   REF → LIBELLÉ → QTÉ(2dec) → UNITÉ(PIECE|KG) → PRIX_UN(4dec) → REM% → PU_NET(4dec) → MONTANT(2dec)
 *
 * Key characteristics:
 * - Ref format: alphanumeric + optional '+' (BO1900, BOISAL14X, SKTBPPBR26+19X2)
 * - Free items (promo/gifts): no price fields, just Montant 0,00
 * - Multiple command blocks (SO/CC/BL) per invoice, each with column headers
 * - Multi-line product names: continuation text after Montant, single-space separated
 * - Continuations may contain hyphenated ref-like strings (OPERCULABLES-BO1900)
 * - All products are emballage_entretien category
 * - TVA: 20% (emballage)
 */

import type { ParsedIngredient, ParseResult, ParseLog } from "./types";
import { parseFrenchNumber } from "./normalizeUnit";

// ── Helpers ─────────────────────────────────────────────────────────────────

function detectEtablissement(text: string): string | null {
  const upper = text.toUpperCase();
  if (upper.includes("SASHA") || upper.includes("BELLO MIO")) return "bello_mio";
  if (upper.includes("FRATELLI") || upper.includes("PICCOLA MIA")) return "piccola_mia";
  return null;
}

function extractMeta(text: string) {
  const numMatch = text.match(/Référence\s+(FA\d+)/);
  const dateMatch = text.match(/Date:\s+(\d{2}\/\d{2}\/\d{4})/);
  const htMatch = text.match(/Total\s+HT\s+:\s+([\d\s,]+\d)/);
  const ttcMatch = text.match(/Total\s+TTC\s+\(EUR\)\s+:\s+([\d\s,]+\d)/);

  return {
    invoice_number: numMatch?.[1] ?? null,
    invoice_date: dateMatch?.[1] ?? null,
    total_ht: htMatch ? parseFrenchNumber(htMatch[1]) : null,
    total_ttc: ttcMatch ? parseFrenchNumber(ttcMatch[1]) : null,
  };
}

// ── REF pattern ─────────────────────────────────────────────────────────────
// Must contain at least one digit to avoid header words (ARMOR, PICCOLA, etc.)
// Must NOT be preceded by hyphen (to exclude continuation refs like OPERCULABLES-BO1900)
const RE_REF = /(?<![A-Za-z-])([A-Z][A-Z0-9+]*\d[A-Z0-9+]*)\b/g;

// Priced product within segment: NAME QTY(2dec) UNIT PRIX(4dec) REM% PUNET(4dec) MONTANT(2dec)
const RE_PRICED_SEGMENT = /(.*?)\s+(\d+,\d{2})\s+(PIECE|KG)\s+(\d+,\d{4})\s+(\d+%)\s+(\d+,\d{4})\s+(\d+,\d{2})/;

// Free item within segment: NAME QTY(2dec) UNIT 0,00
const RE_FREE_SEGMENT = /(.*?)\s+(\d+,\d{2})\s+(PIECE|KG)\s+0,00/;

// ── Parser ──────────────────────────────────────────────────────────────────

export function parseArmor(text: string, etablissement: string): ParseResult {
  const meta = extractMeta(text);
  const detectedEtab = detectEtablissement(text);
  const etab = etablissement || detectedEtab || "bello_mio";

  // Extract product sections: text between "Montant" column header and next section
  const productSections: string[] = [];
  const sectionRe = /\bMontant\s+([\s\S]*?)(?=\bType\s+de\s+commande|\bN°\s+de\s+TVA|\bSuite|\bTaxes\s+Base|\bPage\s+\d|$)/gi;
  let sectionMatch;
  while ((sectionMatch = sectionRe.exec(text)) !== null) {
    productSections.push(sectionMatch[1]);
  }
  const sectionText = productSections.join(" ");

  // Find all REF positions
  const refPositions: { ref: string; start: number; end: number }[] = [];
  RE_REF.lastIndex = 0;
  let refMatch;
  while ((refMatch = RE_REF.exec(sectionText)) !== null) {
    refPositions.push({ ref: refMatch[1], start: refMatch.index, end: refMatch.index + refMatch[0].length });
  }

  const ingredients: ParsedIngredient[] = [];
  const logs: ParseLog[] = [];
  let matchCount = 0;

  // Process each REF segment
  for (let i = 0; i < refPositions.length; i++) {
    const { ref, end: refEnd } = refPositions[i];
    const segEnd = i + 1 < refPositions.length ? refPositions[i + 1].start : sectionText.length;
    const segment = sectionText.slice(refEnd, segEnd).trim();

    // Try priced pattern
    const priced = segment.match(RE_PRICED_SEGMENT);
    if (priced) {
      matchCount++;
      const [, nameRaw, qtyStr, unit, _prixUn, remStr, puNetStr, montantStr] = priced;
      void _prixUn;

      const name = nameRaw.replace(/\s{2,}/g, " ").trim();
      const qty = parseFrenchNumber(qtyStr);
      const puNet = parseFrenchNumber(puNetStr);
      const montant = parseFrenchNumber(montantStr);
      const remPct = parseInt(remStr, 10);

      if (!name || montant == null) continue;

      const unitCommande = unit === "KG" ? ("kg" as const) : ("pcs" as const);

      let confidence: "high" | "medium" | "low" = "high";
      if (qty != null && puNet != null && montant != null) {
        const expected = qty * puNet;
        const tolerance = Math.max(0.02, montant * 0.01);
        if (Math.abs(expected - montant) > tolerance) {
          confidence = "medium";
        }
      }

      ingredients.push({
        name,
        reference: ref,
        unit_recette: "pcs",
        unit_commande: unitCommande,
        prix_unitaire: puNet ?? 0,
        prix_commande: montant,
        categorie: "emballage_entretien",
        fournisseur_slug: "armor",
        etablissement_id: etab,
        raw_line: `${ref} ${name} ${qty}${unit === "KG" ? "kg" : "pcs"} @${puNet}€ -${remPct}% = ${montant}€`,
        confidence,
      });

      logs.push({
        line_number: matchCount,
        raw: `${ref} ${name}`,
        rule: "armor_product",
        result: "ok",
        detail: `${name} ${qty}x @${puNet}€ -${remPct}% = ${montant}€`,
      });
      continue;
    }

    // Try free pattern
    const free = segment.match(RE_FREE_SEGMENT);
    if (free) {
      const name = free[1].replace(/\s{2,}/g, " ").trim();
      const qty = parseFrenchNumber(free[2]);

      logs.push({
        line_number: 0,
        raw: `${ref} ${name}`,
        rule: "armor_free",
        result: "skipped",
        detail: `Free item: ${ref} ${name} (${qty} ${free[3]}) — 0,00€`,
      });
    }
  }

  if (matchCount === 0) {
    logs.push({
      line_number: 0,
      raw: text.slice(0, 200),
      rule: "armor_no_match",
      result: "error",
      detail: "No product lines found",
    });
  }

  return {
    fournisseur: "armor",
    etablissement: etab,
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    ingredients,
    logs,
  };
}
