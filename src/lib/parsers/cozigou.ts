/*
 * Cozigou invoice parser
 *
 * Format Cozigou — beverage distributor (Dinan)
 * pdfjs-dist produces line-by-line output (one product per line, some multi-line names).
 *
 * Line format:
 *   CODE(4-6d) CAS [COL] [TYPE] NAME [VOL_CL] [DEGREE] PU_TARIF(3dec) TVA(1|2) PU_NET(3dec) [ACCISE(3dec)] MONT_HT(2dec) ...
 *
 * Key characteristics:
 * - PU has 3 decimal places (X.XXX), MONT has 2 (XX.XX)
 * - TVA: 1 = 5.5% (non-alcohol), 2 = 20% (alcohol)
 * - Continuation lines: start with letters (no code), appended to previous product
 * - RUPTURE lines: "CODE NAME RUPTURE" — out of stock, skip
 * - Consignment codes (500xxx): skip
 * - Products: beverages (beer, wine, spirits, syrups, coffee, water)
 */

import type { ParsedIngredient, ParseResult, ParseLog } from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function detectEtablissement(text: string): string | null {
  const upper = text.toUpperCase();
  if (upper.includes("SASHA") || upper.includes("BELLO MIO")) return "bello_mio";
  if (upper.includes("I FRATELLI") || upper.includes("IFRATELLI") || upper.includes("PICCOLA MIA")) return "piccola_mia";
  return null;
}

function extractMeta(text: string) {
  // Invoice/avoir number: "FACTURE/AVOIR N° 6020101461"
  const numMatch = text.match(/(?:FACTURE|AVOIR)\s*(?:\/\s*AVOIR)?\s*N°\s*(\d{10,})/i);
  // Date: DD/MM/YYYY or DD/MM/YY
  const dateMatch = text.match(/\b(\d{2}\/\d{2}\/\d{2,4})\b/);
  // Totals: look for HT/TVA/TTC summary pattern
  // Various: "Montant HT ... Montant TVA ... TOTAL TTC" or inline
  const totalsMatch = text.match(/(\d{1,3}(?:\.\d{2}))\s+(\d{1,3}(?:\.\d{2}))\s+(\d{1,3}(?:\.\d{2}))/);
  let total_ht: number | null = null;
  let total_ttc: number | null = null;
  if (totalsMatch) {
    const a = parseFloat(totalsMatch[1]);
    const b = parseFloat(totalsMatch[2]);
    const c = parseFloat(totalsMatch[3]);
    if (Math.abs(a + b - c) < 1) {
      total_ht = a;
      total_ttc = c;
    }
  }

  return {
    invoice_number: numMatch?.[1] ?? null,
    invoice_date: dateMatch?.[1] ?? null,
    total_ht,
    total_ttc,
  };
}

// ── Product line regex ──────────────────────────────────────────────────────
// Anchor on the distinctive price pattern: PU(3dec) TVA(1|2) PU_NET(3dec) [ACCISE(3dec)] MONT(2dec)
const RE_PRODUCT =
  /^(\d{4,6})\s+(\d+)\s+(.+?)\s+(\d+\.\d{3})\s+([12])\s+(\d+\.\d{3})\s+(?:(\d+\.\d{3})\s+)?(\d+\.\d{2})\s/;

// RUPTURE: code + name + RUPTURE
const RE_RUPTURE = /^(\d{4,6})\s+.*RUPTURE/;

// ── Name cleaning ───────────────────────────────────────────────────────────
// The raw name area contains: [COL] [TYPE_PREFIX] NAME [VOL_CL] [DEGREE]
// Remove numeric-only tokens from start (col/pack) and end (vol, degree)
function cleanName(raw: string): { name: string; volumeCl: number | null } {
  let s = raw.trim();
  // Remove leading col/pack numbers: "12 PET..." or "6 RGE..."
  s = s.replace(/^\d+\s+/, "");
  // Remove leading format prefixes: PET, RGE, BLC, RSE, LIQ, 70CL, 75CL
  s = s.replace(/^(?:PET|RGE|BLC|RSE|LIQ|RSE)\s+/i, "");
  s = s.replace(/^\d{2,3}CL\s+/i, "");

  // Extract volume from name: "100CL", "70CL", "150CL"
  let volumeCl: number | null = null;
  const inlineVol = s.match(/(\d{2,3})CL/i);
  if (inlineVol) {
    volumeCl = parseInt(inlineVol[1], 10);
  }
  // Remove standalone volume numbers in the middle: " 75 " between text
  const BOTTLE_VOLUMES = [25, 33, 50, 70, 75, 100, 150];
  s = s.replace(/\s+(\d{2,3})\s+/g, (match, num) => {
    const v = parseInt(num, 10);
    if (BOTTLE_VOLUMES.includes(v)) {
      if (!volumeCl) volumeCl = v;
      return " ";
    }
    return match;
  });

  // Remove degree patterns: "25°", "20.0", "12.5°" anywhere
  s = s.replace(/\s+\d+(?:\.\d)?°/g, "");
  s = s.replace(/\s+\d{2}\.\d(?:\s|$)/g, " ");
  // Remove trailing standalone volume (2-3 digit number at end) — may repeat
  for (let i = 0; i < 2; i++) {
    const tailVol = s.match(/\s+(\d{2,3})\s*$/);
    if (tailVol) {
      const v = parseInt(tailVol[1], 10);
      if (v >= 10 && v <= 200) {
        if (!volumeCl) volumeCl = v;
        s = s.slice(0, s.length - tailVol[0].length);
      } else break;
    } else break;
  }

  return { name: s.replace(/\s+/g, " ").trim(), volumeCl };
}

// ── Parser ──────────────────────────────────────────────────────────────────

export function parseCozigou(text: string, etablissement: string): ParseResult {
  const meta = extractMeta(text);
  const detectedEtab = detectEtablissement(text);
  const etab = etablissement || detectedEtab || "bello_mio";

  const ingredients: ParsedIngredient[] = [];
  const logs: ParseLog[] = [];

  const lines = text.split("\n");
  let matchCount = 0;

  // Two-pass: first collect product lines with continuations
  type RawProduct = {
    code: string;
    cas: number;
    rawNameArea: string;
    puTarif: number;
    tva: number;
    puNet: number;
    accise: number | null;
    montHt: number;
    rawLine: string;
  };

  const products: RawProduct[] = [];
  let lastWasProduct = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { lastWasProduct = false; continue; }

    // Stop at totals/footer sections
    if (/^Vol\.\s+Montant/i.test(trimmed)) break;
    if (/^Total\s+poids/i.test(trimmed)) break;
    if (/^REPRISE\s+DE\s+VIDE/i.test(trimmed)) break;
    if (/^F\.A\s*:/i.test(trimmed)) break;

    // Skip RUPTURE lines
    if (RE_RUPTURE.test(trimmed)) {
      logs.push({
        line_number: products.length + 1,
        raw: trimmed.slice(0, 120),
        rule: "cozigou_rupture",
        result: "skipped",
        detail: "RUPTURE — out of stock",
      });
      lastWasProduct = false;
      continue;
    }

    // Try product line
    const m = RE_PRODUCT.exec(trimmed);
    if (m) {
      products.push({
        code: m[1],
        cas: parseInt(m[2], 10),
        rawNameArea: m[3],
        puTarif: parseFloat(m[4]),
        tva: parseInt(m[5], 10),
        puNet: parseFloat(m[6]),
        accise: m[7] ? parseFloat(m[7]) : null,
        montHt: parseFloat(m[8]),
        rawLine: trimmed,
      });
      lastWasProduct = true;
    } else if (lastWasProduct && products.length > 0 && /^[A-ZÀ-Ÿ']/.test(trimmed) && trimmed.length < 60) {
      // Continuation line: only immediately after a product line
      const prev = products[products.length - 1];
      prev.rawNameArea += " " + trimmed;
      lastWasProduct = false; // only one continuation allowed
    } else {
      lastWasProduct = false;
    }
  }

  // Build ingredients from collected products
  for (const p of products) {
    // Skip consignment codes (500xxx)
    if (/^50\d{2,}$/.test(p.code)) {
      logs.push({
        line_number: matchCount + 1,
        raw: `${p.code} ${p.rawNameArea}`,
        rule: "cozigou_consignment",
        result: "skipped",
      });
      continue;
    }

    matchCount++;
    const { name, volumeCl } = cleanName(p.rawNameArea);

    if (!name) {
      logs.push({
        line_number: matchCount,
        raw: p.rawLine.slice(0, 120),
        rule: "cozigou_invalid",
        result: "error",
        detail: "Empty name after cleaning",
      });
      continue;
    }

    // Confidence: verify consistency
    let confidence: "high" | "medium" | "low" = "high";
    if (p.montHt === 0 || p.puNet === 0) {
      confidence = "low";
    }

    ingredients.push({
      name,
      reference: p.code,
      unit_recette: volumeCl ? "cl" : "pcs",
      unit_commande: "pcs",
      volume_unitaire: volumeCl ?? undefined,
      prix_unitaire: p.puNet,
      prix_commande: p.montHt,
      categorie: "boissons",
      fournisseur_slug: "cozigou",
      etablissement_id: etab,
      raw_line: p.rawLine.replace(/\s+/g, " ").slice(0, 200),
      confidence,
    });

    logs.push({
      line_number: matchCount,
      raw: `${p.code} ${name}`.slice(0, 120),
      rule: "cozigou_product",
      result: "ok",
      detail: `${p.cas}cas @${p.puNet}€ = ${p.montHt}€ TVA${p.tva}${p.accise ? ` accise:${p.accise}` : ""}`,
    });
  }

  if (matchCount === 0) {
    logs.push({
      line_number: 0,
      raw: text.slice(0, 200),
      rule: "cozigou_no_match",
      result: "error",
      detail: "No product lines found",
    });
  }

  return {
    fournisseur: "cozigou",
    etablissement: etab,
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    ingredients,
    logs,
  };
}
