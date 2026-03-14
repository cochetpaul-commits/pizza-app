/*
 * Carniato Europe invoice parser
 *
 * Format Carniato — Italian beverage/food importer (Bonneuil-sur-Marne)
 * pdfjs-dist produces one long string per page. Page 2 is CGV (ignore).
 *
 * Column order in extracted text:
 *   CODE(4-5 digits) → 01(PR) → DESIGNATION → NBRE_CART → PAR_COMBIEN → PRIX_TARIF
 *   → [R R1 R2 R3] → [%VOL VOL ALC] → DROITS → QTY → PU_NET → TVA(A2|A4) → MONTANT → EAN
 *
 * Key characteristics:
 * - PR column always "01", concatenated with designation (no space)
 * - TVA codes: A2 = 20% (alcohol), A4 = 5.5% (non-alcohol)
 * - EAN-13 barcodes: "8 XXXXXX XXXXXX" at end of each line
 * - MONTANT H.T. includes droits (excise duties)
 * - "R" in NBRE CART column = carton rompus (broken case)
 * - Names may contain volumes: 0,75L, 33CL, 500GR, 0,33 L, 20CL
 * - Date format: DD.MM.YYYY (dots, not slashes)
 * - Products: beverages (wine, beer, water, juice, soda), coffee
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
  // Invoice number: N° PIECE followed by number, or ATTESTATION FACTURE block
  const numMatch = text.match(/N°\s+PIECE[\s\S]*?(\d{9,})/);
  // Date: DD.MM.YYYY
  const dateMatch = text.match(/(\d{2}\.\d{2}\.\d{4})/);
  // Totals: "TOTAL HORS TAXE ... 1076,92" and "TOTAL T.T.C. ... 1236,64"
  // In pdfjs: "1076,92 159,72 1236,64" after TOTAL lines
  const htMatch = text.match(/TOTAL\s+HORS\s+TAXE\s+TOTAL\s+T\.V\.A\.\s+TOTAL\s+T\.T\.C\..*?(\d[\d\s]*,\d{2})\s+(\d[\d\s]*,\d{2})\s+(\d[\d\s]*,\d{2})/);

  return {
    invoice_number: numMatch?.[1] ?? null,
    invoice_date: dateMatch?.[1]?.replace(/\./g, "/") ?? null,
    total_ht: htMatch ? parseFrenchNumber(htMatch[1]) : null,
    total_ttc: htMatch ? parseFrenchNumber(htMatch[3]) : null,
  };
}

// ── Product line regex ──────────────────────────────────────────────────────
// CODE(4-5d) 01NAME...NUMBERS... QTY PU_NET A[24] MONTANT 8 EAN(6d 6d)
// Using QTY(integer) + PU_NET(2dec) + A[24] + MONTANT(2dec) + EAN as anchors

const RE_PRODUCT = /\b(\d{4,5})\s+01(.*?)\s+(\d+)\s+(\d+,\d{2})\s+A([24])\s+(\d+,\d{2})\s+8\s+\d{6}\s+\d{6}/g;

// ── Extract product name from raw area between 01 and QTY ───────────────
// The area contains: NAME [NBRE_CART] [PAR_COMBIEN] [PRIX_TARIF] [remises/regie numbers]
// Name tokens contain letters; numeric columns are pure numbers

function extractName(rawArea: string): string {
  const parts = rawArea.split(/\s{2,}/);
  const nameTokens: string[] = [];
  for (const p of parts) {
    // Stop at standalone "R" (carton rompus) or pure numeric tokens
    if (p === "R" || !/[A-Za-zÀ-ÿ]/.test(p)) break;
    nameTokens.push(p);
  }
  return nameTokens.join(" ").replace(/\s+/g, " ").trim();
}

// ── Parser ──────────────────────────────────────────────────────────────────

export function parseCarniato(text: string, etablissement: string): ParseResult {
  const meta = extractMeta(text);
  const detectedEtab = detectEtablissement(text);
  const etab = etablissement || detectedEtab || "bello_mio";

  // Only parse page 1 (page 2 is CGV)
  const page1 = text.split("\n")[0] || text;

  const ingredients: ParsedIngredient[] = [];
  const logs: ParseLog[] = [];
  let matchCount = 0;

  RE_PRODUCT.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = RE_PRODUCT.exec(page1)) !== null) {
    matchCount++;
    const [fullMatch, code, rawArea, qtyStr, puNetStr, tvaCode, montantStr] = match;

    const name = extractName(rawArea);
    const qty = parseInt(qtyStr, 10);
    const puNet = parseFrenchNumber(puNetStr);
    const montant = parseFrenchNumber(montantStr);

    if (!name || montant == null) {
      logs.push({
        line_number: matchCount,
        raw: fullMatch.replace(/\s+/g, " ").slice(0, 120),
        rule: "carniato_invalid",
        result: "error",
        detail: "missing name or montant",
      });
      continue;
    }

    // Extract volume from name (0,75L → 75cl, 33CL → 33cl, etc.)
    const inline = extractInlineUnit(name);
    const unitRecette = inline?.unit_recette ?? "pcs";

    // Category detection
    const cat = detectCategorieFromName(name);

    // Confidence: check qty × puNet ≈ montant (allow for droits difference)
    let confidence: "high" | "medium" | "low" = "high";
    if (qty != null && puNet != null && montant != null) {
      const expected = qty * puNet;
      // Montant includes droits (excise duties), allow up to 10% tolerance
      const tolerance = Math.max(0.10, montant * 0.10);
      if (Math.abs(expected - montant) > tolerance) {
        confidence = "medium";
      }
    }

    ingredients.push({
      name,
      reference: code,
      unit_recette: unitRecette,
      unit_commande: "pcs",
      volume_unitaire: inline?.type === "volume" ? inline.value : undefined,
      poids_unitaire: inline?.type === "poids" ? inline.value : undefined,
      prix_unitaire: puNet ?? 0,
      prix_commande: montant,
      categorie: cat,
      fournisseur_slug: "carniato",
      etablissement_id: etab,
      raw_line: `${code} ${name} ${qty}x @${puNet}€ = ${montant}€ TVA:A${tvaCode}`,
      confidence,
    });

    logs.push({
      line_number: matchCount,
      raw: `${code} ${name}`,
      rule: tvaCode === "2" ? "carniato_tva20" : "carniato_tva55",
      result: "ok",
      detail: `${name} ${qty}x @${puNet}€ = ${montant}€`,
    });
  }

  if (matchCount === 0) {
    logs.push({
      line_number: 0,
      raw: text.slice(0, 200),
      rule: "carniato_no_match",
      result: "error",
      detail: "No product lines found",
    });
  }

  return {
    fournisseur: "carniato",
    etablissement: etab,
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    ingredients,
    logs,
  };
}
