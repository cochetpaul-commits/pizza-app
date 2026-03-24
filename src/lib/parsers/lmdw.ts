/*
 * LMDW (La Maison du Whisky) invoice parser
 *
 * Format LMDW — spirits/wine distributor (Clichy)
 * Invoice has main page + "Annexe Détaillée" with net prices (after discount)
 *
 * Product line format (pdfjs-dist flat text):
 *   CODE  QTY  UNIT_PRICE  TOTAL  ...middle nums (base,deg,droits,css)...  VOLUME(0,XXX)  TVA(01/02)  [CSS]  NAME
 *
 * Key: Volume is always 0,XXX (liters) — serves as anchor in regex
 * Middle section has variable fields: base price, alcohol degree, droits, C (carton), CSS
 * Products: spirits, liqueurs, wines — all "boissons"
 * TVA: 20% (code 01) for spirits, 5.5% (code 02) for some aperitifs/wines
 */

import type { ParsedIngredient, ParseResult, ParseLog } from "./types";
import { parseFrenchNumber } from "./normalizeUnit";
import { detectCategorieFromName } from "./categories";

// ── Helpers ─────────────────────────────────────────────────────────────────

function detectEtablissement(text: string): string | null {
  const upper = text.toUpperCase();
  if (upper.includes("SASHA") || upper.includes("BELLO MIO")) return "bello_mio";
  if (upper.includes("FRATELLI") || upper.includes("PICCOLA MIA")) return "piccola_mia";
  return null;
}

function extractMeta(text: string) {
  // Facture N°: 10-digit number before a date
  const invMatch = text.match(/(\d{10})\s+\d{2}\/\d{2}\/\d{2}/);
  // Date: DD/MM/YY (first occurrence after facture number)
  const dateMatch = text.match(/\d{10}\s+(\d{2})\/(\d{2})\/(\d{2,4})/);
  // Amounts: "1 383,19 EUR 1 154,76 228,43" → TTC EUR HT TVA
  const amountMatch = text.match(/([\d\s]+,\d{2})\s+EUR\s+([\d\s]+,\d{2})\s+([\d\s]+,\d{2})/);

  let invoice_date: string | null = null;
  if (dateMatch) {
    const y = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3];
    invoice_date = `${dateMatch[1]}/${dateMatch[2]}/${y}`;
  }

  return {
    invoice_number: invMatch?.[1] ?? null,
    invoice_date,
    total_ht: amountMatch ? parseFrenchNumber(amountMatch[2].replace(/\s/g, "")) : null,
    total_ttc: amountMatch ? parseFrenchNumber(amountMatch[1].replace(/\s/g, "")) : null,
  };
}

// ── Product regex ───────────────────────────────────────────────────────────
// CODE  QTY  PU  TOTAL  ...middle (numbers + optional C)...  VOL(0,XXX)  TVA(01|02)  [CSS(d,dd)]  NAME
// Volume 0,\d{3} is unique anchor: no other field has 0 + comma + 3 digits
const RE_PRODUCT =
  /(\d{3,5}[A-Z]?)\s+(\d+)\s+(\d+,\d{2})\s+(\d+,\d{2})[\d,.\sC]+?(0,\d{3})\s+(0[12])\s+(?:\d,\d{2}\s+)?([A-Z][A-Za-zÀ-ÿ'][A-Za-zÀ-ÿ'\s!.,()\d/-]+?)(?=\s+\d{3,5}[A-Z]?\s+\d|\s*$)/g;

// ── Parser ──────────────────────────────────────────────────────────────────

export function parseLmdw(text: string, etablissement: string): ParseResult {
  const meta = extractMeta(text);
  const detectedEtab = detectEtablissement(text);
  const etab = etablissement || detectedEtab || "bello_mio";

  const ingredients: ParsedIngredient[] = [];
  const logs: ParseLog[] = [];

  // Prefer "Annexe Détaillée" page (net prices after discount)
  // Split by form-feed (pdfjs page separator) or fallback to newline
  const pages = text.includes("\f") ? text.split("\f") : text.split("\n");
  let parseText = text;
  for (const page of pages) {
    if (page.includes("Annexe") && page.includes("taill")) {
      parseText = page;
      break;
    }
  }

  const seen = new Set<string>();
  let matchCount = 0;

  RE_PRODUCT.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = RE_PRODUCT.exec(parseText)) !== null) {
    const code = m[1];
    const qty = parseInt(m[2]);
    const unitPrice = parseFrenchNumber(m[3]);
    const total = parseFrenchNumber(m[4]);
    const volume = parseFrenchNumber(m[5]);
    const name = m[7].trim();

    // Dedup by code (safety for when annexe detection fails)
    if (seen.has(code)) continue;
    seen.add(code);

    matchCount++;

    if (!name || unitPrice == null) {
      logs.push({
        line_number: matchCount,
        raw: m[0].replace(/\s+/g, " ").slice(0, 120),
        rule: "lmdw_invalid",
        result: "error",
        detail: "Missing name or price",
      });
      continue;
    }

    // Confidence: qty × unitPrice ≈ total
    let confidence: "high" | "medium" | "low" = "high";
    if (total != null && qty > 0) {
      const expected = qty * unitPrice;
      const tolerance = Math.max(0.05, total * 0.02);
      if (Math.abs(expected - total) > tolerance) {
        confidence = "medium";
      }
    }

    // LMDW only sells alcohol — force "boissons" if no better match
    const detected = detectCategorieFromName(name);
    const cat = detected === "autre" ? "boissons" : detected;

    ingredients.push({
      name,
      reference: code,
      unit_recette: "pcs",
      unit_commande: "pcs",
      volume_unitaire: volume ?? undefined,
      prix_unitaire: unitPrice,
      prix_commande: total ?? unitPrice,
      categorie: cat,
      fournisseur_slug: "lmdw",
      etablissement_id: etab,
      raw_line: m[0].replace(/\s+/g, " ").slice(0, 200),
      confidence,
    });

    logs.push({
      line_number: matchCount,
      raw: `${code} ${name}`.slice(0, 120),
      rule: "lmdw_product",
      result: "ok",
      detail: `${name} ×${qty} @${unitPrice}€ = ${total}€ (${volume}L)`,
    });
  }

  if (matchCount === 0) {
    logs.push({
      line_number: 0,
      raw: parseText.slice(0, 200),
      rule: "lmdw_no_match",
      result: "error",
      detail: "No product lines found",
    });
  }

  return {
    fournisseur: "lmdw",
    etablissement: etab,
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    ingredients,
    logs,
  };
}
