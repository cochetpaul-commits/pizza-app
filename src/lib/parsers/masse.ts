/*
 * Masse invoice parser
 *
 * Format Masse — food supplier (charcuterie, viande, surgelé)
 * pdfjs-dist joins everything with spaces.
 *
 * Line format (regex on continuous text):
 *   SKU(alphanum)  QTY(decimal)  UNIT(KGM|PCE|UNI|LIT)  PRIX_BRUT  TOTAL_HT  TAXE  PRIX_NET  NAME
 *
 * Key characteristics:
 * - SKU: 2-6 alpha + 2-6 digits (VOLC006, MASE020)
 * - Unit: KGM/KG → kg, LIT/L → l, PCE/PCS/UNI → pcs
 * - Prix used: PRIX_NET (field 7, net of discount)
 * - Total: TOTAL_HT (field 5)
 * - Name is AFTER the numeric fields (uppercase, multi-word)
 * - Weight/volume extraction from name for "pcs" items
 * - Deduplication by key
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
  // "N° facture : FACN012600857" or "FACTURE 51518 BELLO MIO FACN012600857"
  const invMatch =
    text.match(/N[°º]?\s*facture\s*:\s*([A-Z0-9]+)/i) ??
    text.match(/FACTURE\s+\d+\s+[A-Z\s]+\s+([A-Z]{3,5}\d{6,})/i);

  // "09/03/2026 Date" or "Date 09/03/2026"
  const dateMatch =
    text.match(/(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})\s+Date\b/i) ??
    text.match(/Date\s+(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/i);

  // Total HT (largest match)
  const htMatches = [...text.matchAll(/(\d[\d\s.,]+)\s+Total\s+HT|Total\s+HT\s+(\d[\d\s.,]+)/gi)];
  let totalHt: number | null = null;
  for (const m of htMatches) {
    const v = parseFrenchNumber(m[1] ?? m[2] ?? "");
    if (v != null && v > (totalHt ?? 0)) totalHt = v;
  }

  // TOTAL TTC en EURO 265,84
  const ttcMatch = text.match(/TOTAL\s+TTC\s+(?:en\s+EURO\s+)?(\d[\d\s.,]*)/i);

  let invoice_date: string | null = null;
  if (dateMatch) invoice_date = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;

  return {
    invoice_number: invMatch?.[1]?.trim() ?? null,
    invoice_date,
    total_ht: totalHt,
    total_ttc: ttcMatch ? parseFrenchNumber(ttcMatch[1]) : null,
  };
}

// ── Weight/volume extraction from name ──────────────────────────────────────

function extractWeightGFromName(name: string): number | null {
  // "2x500g" → 1000g, "1,5 kg" → 1500g, "500g" → 500g
  const multiM = name.match(/(\d+)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*g\b/i);
  if (multiM) return parseInt(multiM[1]) * parseFloat(multiM[2].replace(",", "."));
  const kgM = name.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  if (kgM) return parseFloat(kgM[1].replace(",", ".")) * 1000;
  const gM = name.match(/(\d+(?:[.,]\d+)?)\s*g\b/i);
  if (gM) return parseFloat(gM[1].replace(",", "."));
  return null;
}

function extractVolumeFromName(name: string): number | null {
  const clM = name.match(/(\d+(?:[.,]\d+)?)\s*cl\b/i);
  if (clM) return parseFloat(clM[1].replace(",", ".")) * 10;
  const mlM = name.match(/(\d+(?:[.,]\d+)?)\s*ml\b/i);
  if (mlM) return parseFloat(mlM[1].replace(",", "."));
  const lM = name.match(/(\d+(?:[.,]\d+)?)\s*l\b/i);
  if (lM) return parseFloat(lM[1].replace(",", ".")) * 1000;
  return null;
}

// ── Product line regex ──────────────────────────────────────────────────────
// SKU  QTY  UNIT  PRIX_BRUT  TOTAL_HT  TAXE  PRIX_NET  NAME
const RE_LINE =
  /([A-Z]{2,6}\d{2,6})\s+(\d+[.,]\d+)\s+(KGM?|KG|PCE?|PCS|UNI|LIT?|L)\s+(\d+[.,]\d+)\s+(\d+[.,]\d+)\s+(\d+[.,]\d+)\s+(\d+[.,]\d+)\s+([A-Z][A-Z\s/'.()-]+?)(?=\s+[A-Z]{2,6}\d{2,6}\s|\s+Base\s|\s+Total\s|\s*$)/gi;

// ── Parser ──────────────────────────────────────────────────────────────────

export function parseMasse(text: string, etablissement: string): ParseResult {
  const meta = extractMeta(text);
  const detectedEtab = detectEtablissement(text);
  const etab = etablissement || detectedEtab || "bello_mio";

  const ingredients: ParsedIngredient[] = [];
  const logs: ParseLog[] = [];
  const seen = new Set<string>();
  let matchCount = 0;

  RE_LINE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = RE_LINE.exec(text)) !== null) {
    const sku = m[1];
    const qty = parseFrenchNumber(m[2]);
    const rawUnit = m[3].toUpperCase();
    const priceNet = parseFrenchNumber(m[7]);
    const totalHt = parseFrenchNumber(m[5]);
    const name = m[8].trim();

    // Dedup
    const key = [sku, name, qty ?? "", priceNet ?? "", totalHt ?? ""].join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    matchCount++;

    if (!name || priceNet == null) {
      logs.push({
        line_number: matchCount,
        raw: m[0].replace(/\s+/g, " ").slice(0, 120),
        rule: "masse_invalid",
        result: "error",
        detail: "Missing name or price",
      });
      continue;
    }

    // Unit mapping
    let unitCommande: "kg" | "pcs" = "pcs";
    if (rawUnit.startsWith("KG") || rawUnit === "KGM") unitCommande = "kg";

    const isPiece = unitCommande === "pcs";
    const inline = isPiece ? extractInlineUnit(name) : null;
    const unitRecette = unitCommande === "kg"
      ? ("kg" as const)
      : (inline?.unit_recette ?? ("pcs" as const));

    const poidsG = isPiece ? extractWeightGFromName(name) : undefined;
    const volumeMl = isPiece ? extractVolumeFromName(name) : undefined;
    const cat = detectCategorieFromName(name);

    // Confidence
    let confidence: "high" | "medium" | "low" = "high";
    if (qty != null && priceNet != null && totalHt != null) {
      const expected = qty * priceNet;
      const tolerance = Math.max(0.10, totalHt * 0.01);
      if (Math.abs(expected - totalHt) > tolerance) {
        confidence = "medium";
      }
    }

    ingredients.push({
      name,
      reference: sku,
      unit_recette: unitRecette,
      unit_commande: unitCommande,
      poids_unitaire: poidsG ? poidsG / 1000 : (inline?.type === "poids" ? inline.value : undefined),
      volume_unitaire: volumeMl ? volumeMl / 1000 : (inline?.type === "volume" ? inline.value : undefined),
      prix_unitaire: priceNet,
      prix_commande: totalHt ?? priceNet,
      categorie: cat,
      fournisseur_slug: "masse",
      etablissement_id: etab,
      raw_line: m[0].replace(/\s+/g, " ").slice(0, 200),
      confidence,
    });

    logs.push({
      line_number: matchCount,
      raw: `${sku} ${name}`.slice(0, 120),
      rule: rawUnit.startsWith("KG") ? "masse_weight" : "masse_piece",
      result: "ok",
      detail: `${name} ${qty} ${rawUnit} @${priceNet}€ = ${totalHt}€`,
    });
  }

  if (matchCount === 0) {
    logs.push({
      line_number: 0,
      raw: text.slice(0, 200),
      rule: "masse_no_match",
      result: "error",
      detail: "No product lines found",
    });
  }

  return {
    fournisseur: "masse",
    etablissement: etab,
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    ingredients,
    logs,
  };
}
