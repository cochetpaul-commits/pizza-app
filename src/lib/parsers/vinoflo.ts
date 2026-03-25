/*
 * Vinoflo invoice parser
 *
 * Format Vinoflo — Italian wine distributor (Marseille)
 * Table: QTÉ | CODE | DESCRIPTION | PRIX UNITAIRE | TOTAL
 *
 * WARNING: Vinoflo invoices are often scanned images (IMG_*.pdf).
 * pdfjs-dist extracts the embedded OCR text layer which has errors:
 * - Currency: € → e, æ, ê, C, ¤
 * - Digits: 0→æ, 0→t, 0→O, 5→æ
 * - Merged/missing characters
 *
 * Line format (per row):
 *   QTY(int) CODE(int) NAME(text) UNIT_PRICE(d,dd + currency) TOTAL(d,dd + currency)
 *
 * Products: all Italian wines — "boissons"
 * TVA: 20% (alcohol)
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
  // Invoice number: near "facture" — 4-5 digit number (not SIRET which is 14+ digits)
  const numMatch = text.match(/facture\s*:\s*(\d{4,6})\b/i)
    || text.match(/iacture\s*:\s*(\d{4,6})\b/i);  // OCR: f→i
  // Date: DD/MM/YYYY or DDtMMtYYYY or DD,MM/YYYY (OCR replaces / with t or ,)
  const dateMatch = text.match(/(\d{2})[t/,](\d{2})[t/,](\d{4})/);
  // Sous-total HT: various OCR forms — "Sous{otal 't 227,1æ."
  const stMatch = text.match(/[Ss]ous[{-]?[Tt]?otal\s+([\d\s't,æ]+)[€eæC¤.]/);
  // Total TTC
  const ttcMatch = text.match(/\bTotal\s+([\d\s',æ.]+)[€eæCX¤*]/);

  return {
    invoice_number: numMatch?.[1] ?? null,
    invoice_date: dateMatch ? `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}` : null,
    total_ht: stMatch ? cleanOcrAmount(stMatch[1]) : null,
    total_ttc: ttcMatch ? cleanOcrAmount(ttcMatch[1]) : null,
  };
}

// ── OCR cleaning ────────────────────────────────────────────────────────────

function cleanOcrAmount(raw: string): number | null {
  let s = raw
    .replace(/[¤€eQC;)*X]/g, "")
    .replace(/'t/g, "1")            // OCR: 1 → 't
    .replace(/'/g, "")
    .replace(/\s+/g, "")
    .trim();
  // OCR digit substitutions for amounts
  s = s.replace(/æ/g, "0").replace(/t/g, "0").replace(/O/g, "0");
  return parseFrenchNumber(s);
}

function cleanOcrPrice(raw: string): number | null {
  let s = raw
    .replace(/[¤€eQC;)*]/g, "")
    .replace(/'/g, ",")            // OCR: , → ' in prices
    .replace(/\s+/g, "")
    .trim();
  // OCR digit substitutions
  s = s.replace(/æ/g, "0").replace(/ê/g, "0").replace(/t(?=\d)/g, "0");
  return parseFrenchNumber(s);
}

// ── Product line regex ──────────────────────────────────────────────────────
// QTY CODE NAME UNIT_PRICE TOTAL
// Currency chars: €, e, æ, ê, C, ¤ (OCR variations)
// Price: digits + comma + digits, possibly corrupted
const CURRENCY = "[€eæêC¤]";
const PRICE = `\\d+[,.']\\d[\\dæêeIlt]*?`;
const LINE_END = `${CURRENCY}[.\\s]*$`;
const RE_LINE = new RegExp(
  `^'?(\\d{1,3})\\s+[\\d']{1,4}\\s+(.+?)\\s+(${PRICE})${CURRENCY}\\s+(${PRICE})${LINE_END}`
);
// Fallback: line without QTY (OCR merged or missing)
const RE_LINE_NOQTY = new RegExp(
  `^[\\d']{1,4}\\s+(.+?)\\s+(${PRICE})${CURRENCY}\\s+(${PRICE})${LINE_END}`
);

// ── Parser ──────────────────────────────────────────────────────────────────

export function parseVinoflo(text: string, etablissement: string): ParseResult {
  const meta = extractMeta(text);
  const detectedEtab = detectEtablissement(text);
  const etab = etablissement || detectedEtab || "bello_mio";

  const ingredients: ParsedIngredient[] = [];
  const logs: ParseLog[] = [];

  const lines = text.split("\n");
  let matchCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Stop at sous-total/footer
    if (/sous[{-]total|^TVA\b|^Total\b|^Solde\b|^Escompte/i.test(trimmed)) break;

    let qty: number | null = null;
    let name: string | null = null;
    let unitPriceRaw: string | null = null;
    let totalRaw: string | null = null;

    // Try full format: QTY CODE NAME PRICE TOTAL
    const m = RE_LINE.exec(trimmed);
    if (m) {
      qty = parseInt(m[1], 10);
      name = m[2].trim();
      unitPriceRaw = m[3];
      totalRaw = m[4];
    } else {
      // Try without QTY: CODE NAME PRICE TOTAL
      const m2 = RE_LINE_NOQTY.exec(trimmed);
      if (m2) {
        name = m2[1].trim();
        unitPriceRaw = m2[2];
        totalRaw = m2[3];
      }
    }

    if (!name || !unitPriceRaw || !totalRaw) continue;

    // Skip non-product lines
    if (/factur|paiem|intér|marchand|pénalité|escompte|décret|propriété|transfer|régle|indemnité/i.test(name)) continue;
    if (/Qté|Article|Description|Prix|Total|Sous|TVA|Solde|IBAN|Adresse|Représentant/i.test(name)) continue;
    if (name.length < 3) continue;

    const unitPrice = cleanOcrPrice(unitPriceRaw);
    const total = cleanOcrPrice(totalRaw);

    if (unitPrice == null || unitPrice <= 0) continue;
    // Sanity check: unit price for wine typically 2-30€
    if (unitPrice > 50) continue;

    matchCount++;

    // Compute qty from total/unitPrice if not captured
    if (qty == null && total != null && total > 0) {
      qty = Math.round(total / unitPrice);
    }

    // Clean up OCR artifacts in name
    const cleanName = name
      .replace(/û/g, "u")
      .replace(/ê/g, "e")
      .replace(/â/g, "a")
      .replace(/æ/g, "a")
      .replace(/\s+/g, " ")
      .trim();

    // Confidence: verify qty × unitPrice ≈ total
    let confidence: "high" | "medium" | "low" = "medium";
    if (qty != null && total != null) {
      const expected = qty * unitPrice;
      if (Math.abs(expected - total) < 0.10) {
        confidence = "high";
      }
    } else {
      confidence = "low";
    }

    ingredients.push({
      name: cleanName,
      reference: undefined,
      unit_recette: "pcs",
      unit_commande: "pcs",
      prix_unitaire: unitPrice,
      prix_commande: total ?? unitPrice,
      categorie: "boissons",
      fournisseur_slug: "vinoflo",
      etablissement_id: etab,
      raw_line: trimmed.slice(0, 200),
      confidence,
    });

    logs.push({
      line_number: matchCount,
      raw: cleanName.slice(0, 120),
      rule: "vinoflo_product",
      result: "ok",
      detail: `${cleanName} ×${qty ?? "?"} @${unitPrice}€ = ${total ?? "?"}€`,
    });
  }

  if (matchCount === 0) {
    logs.push({
      line_number: 0,
      raw: text.slice(0, 300),
      rule: "vinoflo_no_match",
      result: "error",
      detail: "No product lines found — scanned PDF with poor OCR?",
    });
  }

  // Warn about OCR quality for scanned PDFs
  if (text.includes("¤") || /[æêâ]/.test(text)) {
    logs.push({
      line_number: 0,
      raw: "",
      rule: "vinoflo_ocr_warning",
      result: "skipped",
      detail: "Scanned PDF detected — results may be inaccurate. Prefer digital PDFs from Vinoflo.",
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
