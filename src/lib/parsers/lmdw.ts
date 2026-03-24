/*
 * LMDW (La Maison du Whisky) invoice parser
 *
 * Format LMDW — spirits/wine distributor (Clichy)
 * pdfjs-dist produces line-by-line output with newlines.
 *
 * Column order in extracted text (per line):
 *   CODE(3-6 digits + optional letter) → NAME → QTY(int) → VOL(0,XXX liters)
 *   → DEG(xx,xx) → [C] → [PRIX_BASE] → [DROITS] → [CSS] → PU_HT(d,dd) → TOTAL(d,dd) → TVA(01|02)
 *
 * Key characteristics:
 * - Volume 0,\d{3} is unique anchor between name and numeric section
 * - Last two comma-decimal numbers before TVA are PU_HT and TOTAL
 * - "C" = carton (buying full case)
 * - Multi-line names: continuation line starts with letter, no leading code
 * - TVA: 01 = 20% (spirits), 02 = 5.5% (aperitifs/wines)
 * - Products: spirits, liqueurs, wines — all "boissons"
 * - Invoice number: "Facture N° : XXXXXXX" (7+ digits)
 * - Date: "Date : DD/MM/YY"
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
  // Invoice number: "Facture N° : 1797444"
  const invMatch = text.match(/Facture\s+N°\s*:\s*(\d{6,})/);
  // Date: "Date : DD/MM/YY" or "Date : DD/MM/YYYY"
  const dateMatch = text.match(/Date\s*:\s*(\d{2})\/(\d{2})\/(\d{2,4})/);
  // Totals: "Total H.T. : 1 154,76" and "Total TTC : 1 383,19"
  const htMatch = text.match(/Total\s+H\.T\.\s*:\s*([\d\s]+,\d{2})/);
  const ttcMatch = text.match(/Total\s+TTC\s*:\s*([\d\s]+,\d{2})/);

  let invoice_date: string | null = null;
  if (dateMatch) {
    const y = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3];
    invoice_date = `${dateMatch[1]}/${dateMatch[2]}/${y}`;
  }

  return {
    invoice_number: invMatch?.[1] ?? null,
    invoice_date,
    total_ht: htMatch ? parseFrenchNumber(htMatch[1].replace(/\s/g, "")) : null,
    total_ttc: ttcMatch ? parseFrenchNumber(ttcMatch[1].replace(/\s/g, "")) : null,
  };
}

// ── Product line regex ──────────────────────────────────────────────────────
// CODE NAME QTY VOL ...numeric fields... TVA(01|02)
// Anchor on: CODE at start, VOL (0,\d{3}), TVA (0[12]) at end
const RE_PRODUCT =
  /^(\d{3,6}[A-Z]?)\s+(.+?)\s+(\d+)\s+(0,\d{3})\s+(.+?)\s+(0[12])\s*$/;

// ── Parser ──────────────────────────────────────────────────────────────────

export function parseLmdw(text: string, etablissement: string): ParseResult {
  const meta = extractMeta(text);
  const detectedEtab = detectEtablissement(text);
  const etab = etablissement || detectedEtab || "bello_mio";

  const ingredients: ParsedIngredient[] = [];
  const logs: ParseLog[] = [];

  // Split into lines
  const rawLines = text.split("\n");

  // Pass 1: merge continuation lines with their product line
  // A continuation line has no leading code and contains letters
  const mergedLines: string[] = [];
  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Stop at totals/footer section
    if (/^Montant\s+TOTAL/i.test(trimmed)) break;
    if (/^Remise\s/i.test(trimmed)) break;
    if (/^Total\s+H\.T/i.test(trimmed)) break;

    // Is this a product line (starts with code)?
    if (/^\d{3,6}[A-Z]?\s/.test(trimmed)) {
      mergedLines.push(trimmed);
    } else if (mergedLines.length > 0 && /[A-Za-zÀ-ÿ]/.test(trimmed) && !RE_PRODUCT.test(trimmed)) {
      // Continuation: append to previous line's name area
      // Insert before the QTY+VOL part by finding the code+name portion
      const prev = mergedLines[mergedLines.length - 1];
      // Find where the numeric tail starts (QTY VOL pattern)
      const volMatch = prev.match(/\s+(\d+\s+0,\d{3}\s+.+)$/);
      if (volMatch) {
        const nameArea = prev.slice(0, prev.length - volMatch[0].length);
        mergedLines[mergedLines.length - 1] = `${nameArea} ${trimmed}${volMatch[0]}`;
      } else {
        // Fallback: just append
        mergedLines[mergedLines.length - 1] = `${prev} ${trimmed}`;
      }
    }
  }

  // Pass 2: parse each merged line
  let matchCount = 0;
  const seen = new Set<string>();

  for (const line of mergedLines) {
    const m = RE_PRODUCT.exec(line);
    if (!m) continue;

    const code = m[1];
    const rawName = m[2].trim();
    const qty = parseInt(m[3], 10);
    const volume = parseFrenchNumber(m[4]);
    const middleSection = m[5];
    // m[6] = TVA code (unused)

    // Dedup by code
    if (seen.has(code)) continue;
    seen.add(code);

    // Extract PU_HT and TOTAL from middle section
    // They are the last two comma-decimal numbers
    const decimalNums = middleSection.match(/\d+,\d{2}/g);
    if (!decimalNums || decimalNums.length < 2) {
      // Edge case: only one price (qty=1, no droits/css — e.g. IESSI)
      if (decimalNums && decimalNums.length === 1) {
        const puNet = parseFrenchNumber(decimalNums[0]);
        matchCount++;
        if (puNet != null && rawName) {
          ingredients.push({
            name: rawName,
            reference: code,
            unit_recette: "pcs",
            unit_commande: "pcs",
            volume_unitaire: volume ?? undefined,
            prix_unitaire: puNet,
            prix_commande: puNet * qty,
            categorie: detectCategorieFromName(rawName) === "autre" ? "boissons" : detectCategorieFromName(rawName),
            fournisseur_slug: "lmdw",
            etablissement_id: etab,
            raw_line: line.slice(0, 200),
            confidence: "medium",
          });
          logs.push({
            line_number: matchCount,
            raw: `${code} ${rawName}`.slice(0, 120),
            rule: "lmdw_product",
            result: "ok",
            detail: `${rawName} ×${qty} @${puNet}€ = ${puNet * qty}€ (${volume}L)`,
          });
        }
        continue;
      }
      continue;
    }

    const total = parseFrenchNumber(decimalNums[decimalNums.length - 1]);
    const puNet = parseFrenchNumber(decimalNums[decimalNums.length - 2]);

    matchCount++;

    if (!rawName || puNet == null) {
      logs.push({
        line_number: matchCount,
        raw: line.replace(/\s+/g, " ").slice(0, 120),
        rule: "lmdw_invalid",
        result: "error",
        detail: "Missing name or price",
      });
      continue;
    }

    // Confidence: qty × puNet ≈ total
    let confidence: "high" | "medium" | "low" = "high";
    if (total != null && qty > 0) {
      const expected = qty * puNet;
      const tolerance = Math.max(0.05, total * 0.02);
      if (Math.abs(expected - total) > tolerance) {
        confidence = "medium";
      }
    }

    // LMDW only sells alcohol — force "boissons" if no better match
    const detected = detectCategorieFromName(rawName);
    const cat = detected === "autre" ? "boissons" : detected;

    ingredients.push({
      name: rawName,
      reference: code,
      unit_recette: "pcs",
      unit_commande: "pcs",
      volume_unitaire: volume ?? undefined,
      prix_unitaire: puNet,
      prix_commande: total ?? puNet,
      categorie: cat,
      fournisseur_slug: "lmdw",
      etablissement_id: etab,
      raw_line: line.replace(/\s+/g, " ").slice(0, 200),
      confidence,
    });

    logs.push({
      line_number: matchCount,
      raw: `${code} ${rawName}`.slice(0, 120),
      rule: "lmdw_product",
      result: "ok",
      detail: `${rawName} ×${qty} @${puNet}€ = ${total}€ (${volume}L)`,
    });
  }

  if (matchCount === 0) {
    logs.push({
      line_number: 0,
      raw: text.slice(0, 200),
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
