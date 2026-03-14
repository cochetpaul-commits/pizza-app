/*
 * Vinoflo invoice parser
 *
 * Format Vinoflo — wine/spirits distributor
 * OCR-heavy PDF, many character substitutions (I→9, l→1, O→0)
 *
 * Line format (pdfjs-dist, 2+ spaces as separator):
 *   QTY  SKU(5char)  NAME  UNIT_PRICE  TOTAL_PRICE
 *
 * Special cases:
 * - Collé (stuck together): "628" = qty=6 sku=28
 * - Droits sur alcool → flagged, not a real product
 * - Deduplication by key
 * - All units are "pcs" (bottles/pieces)
 * - Volume extracted from name (75cl, 1L, etc.)
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
  const invMatch = text.match(/N[°º'\u00b0"]\s*de\s*facture\s*[i:\s]+([0-9]+)/i);
  const dateMatch = text.match(/Date\s*[i:\s]+(\d{2})[t\/.](\d{2})[t\/.](\d{4})/i);
  const htMatch = text.match(/Sous[-\s]?total\s+([\d\s.,]+)/i);
  const ttcMatch = text.match(/(?:Total|lolal)\s+'?([0-9][\d\s.,]+)/i);

  let invoice_date: string | null = null;
  if (dateMatch) invoice_date = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;

  return {
    invoice_number: invMatch?.[1]?.trim() ?? null,
    invoice_date,
    total_ht: htMatch ? parseFrenchNumber(htMatch[1]) : null,
    total_ttc: ttcMatch ? parseFrenchNumber(ttcMatch[1]) : null,
  };
}

function cleanOcrSku(s: string): string {
  return s.replace(/I/g, "9").replace(/l/g, "1").replace(/O/g, "0").trim();
}

function cleanOcrPrice(s: string): string {
  return s
    .replace(/[€æê]/g, "")
    .replace(/[''`]/g, "")
    .replace(/I/g, "9")
    .replace(/\./g, "")
    .trim();
}

function parseOcrNumber(s: string): number | null {
  return parseFrenchNumber(cleanOcrPrice(s));
}

function isAlcoholTax(name: string): boolean {
  return /droits?\s+sur\s+alcool/i.test(name);
}

// ── Volume extraction from name ─────────────────────────────────────────────
// "BAROLO 75CL" → 750ml, "LIMONCELLO 1L" → 1000ml

function extractVolumeFromName(name: string): number | null {
  const clM = name.match(/(\d+(?:[.,]\d+)?)\s*cl\b/i);
  if (clM) return parseFloat(clM[1].replace(",", ".")) * 10;
  const mlM = name.match(/(\d+(?:[.,]\d+)?)\s*ml\b/i);
  if (mlM) return parseFloat(mlM[1].replace(",", "."));
  const lM = name.match(/(\d+(?:[.,]\d+)?)\s*l\b/i);
  if (lM) return parseFloat(lM[1].replace(",", ".")) * 1000;
  return null;
}

// ── Product line patterns ───────────────────────────────────────────────────
// Normal: qty(1-4)  sku(1-5)  name(2+ spaces)  price(2+ spaces)  total
const RE_NORMAL = /^\s*(\d{1,4})\s+([0-9IilO]{1,5})\s{2,}(.+?)\s{2,}([I0-9][\d\s,.']*[€æê]?)\s{2,}(['0-9][\d\s,.']*[€æê]?\.?)\s*$/;

// Collé: qty(1)+sku(2) stuck together
const RE_COLLE = /^\s*(\d)(\d{2})\s{3,}(.+?)\s{2,}([I0-9][\d\s,.']*[€æê]?)\s{2,}(['0-9][\d\s,.']*[€æê]?\.?)\s*$/;

// ── Parser ──────────────────────────────────────────────────────────────────

export function parseVinoflo(text: string, etablissement: string): ParseResult {
  const meta = extractMeta(text);
  const detectedEtab = detectEtablissement(text);
  const etab = etablissement || detectedEtab || "bello_mio";

  const rows = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const ingredients: ParsedIngredient[] = [];
  const logs: ParseLog[] = [];
  const seen = new Set<string>();
  let matchCount = 0;

  for (const row of rows) {
    let name: string;
    let sku: string | null;
    let qty: number | null;
    let unitPrice: number | null;
    let totalPrice: number | null;

    const m = RE_NORMAL.exec(row);
    if (m) {
      qty = parseFrenchNumber(m[1]);
      sku = cleanOcrSku(m[2]) || null;
      name = m[3].replace(/\s+/g, " ").trim();
      unitPrice = parseOcrNumber(m[4]);
      totalPrice = parseOcrNumber(m[5]);
    } else {
      const mc = RE_COLLE.exec(row);
      if (!mc) continue;
      qty = parseFrenchNumber(mc[1]);
      sku = mc[2];
      name = mc[3].replace(/\s+/g, " ").trim();
      unitPrice = parseOcrNumber(mc[4]);
      totalPrice = parseOcrNumber(mc[5]);
    }

    // Skip headers and junk
    if (name.toLowerCase().includes("description") || name.toLowerCase().includes("prix")) continue;
    if (/^[-*T]+$/.test(name)) continue;

    // Skip alcohol tax lines
    if (isAlcoholTax(name)) {
      logs.push({
        line_number: matchCount,
        raw: row.slice(0, 120),
        rule: "vinoflo_tax",
        result: "skipped",
        detail: "Alcohol tax line",
      });
      continue;
    }

    // Dedup
    const key = [sku ?? "", name, qty ?? "", unitPrice ?? "", totalPrice ?? ""].join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    matchCount++;

    if (!name || unitPrice == null) {
      logs.push({
        line_number: matchCount,
        raw: row.slice(0, 120),
        rule: "vinoflo_invalid",
        result: "error",
        detail: "Missing name or price",
      });
      continue;
    }

    const volumeMl = extractVolumeFromName(name);
    const inline = extractInlineUnit(name);
    const unitRecette = inline?.unit_recette ?? "pcs";
    const cat = detectCategorieFromName(name);

    let confidence: "high" | "medium" | "low" = "high";
    if (qty != null && unitPrice != null && totalPrice != null) {
      const expected = qty * unitPrice;
      const tolerance = Math.max(0.10, totalPrice * 0.02);
      if (Math.abs(expected - totalPrice) > tolerance) {
        confidence = "medium";
      }
    }
    // OCR sources get lower base confidence
    if (confidence === "high") confidence = "medium";

    ingredients.push({
      name,
      reference: sku ?? undefined,
      unit_recette: unitRecette,
      unit_commande: "pcs",
      volume_unitaire: volumeMl ? volumeMl / (unitRecette === "cl" ? 10 : unitRecette === "L" ? 1000 : 1) : inline?.type === "volume" ? inline.value : undefined,
      prix_unitaire: unitPrice,
      prix_commande: totalPrice ?? (qty != null ? qty * unitPrice : unitPrice),
      categorie: cat,
      fournisseur_slug: "vinoflo",
      etablissement_id: etab,
      raw_line: row.replace(/\s+/g, " ").slice(0, 200),
      confidence,
    });

    logs.push({
      line_number: matchCount,
      raw: row.replace(/\s+/g, " ").slice(0, 120),
      rule: "vinoflo_product",
      result: "ok",
      detail: `${name} ${qty}x @${unitPrice}€ = ${totalPrice}€`,
    });
  }

  if (matchCount === 0) {
    logs.push({
      line_number: 0,
      raw: text.slice(0, 200),
      rule: "vinoflo_no_match",
      result: "error",
      detail: "No product lines found",
    });
  }

  return {
    fournisseur: "vinoflo",
    etablissement: etab,
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    ingredients,
    logs,
  };
}
