/*
 * Vinoflo invoice parser
 *
 * Format Vinoflo — Italian wine distributor (Marseille)
 * Simple table: Qté | Article | Description | Prix unitaire | Total
 *
 * WARNING: Vinoflo invoices are often scanned images (IMG_*.pdf).
 * pdfjs-dist extracts the embedded OCR text layer which is frequently
 * garbled (¤ instead of €, merged words, corrupted digits).
 * Columns are extracted in scrambled order (not row by row).
 *
 * Strategy: find product names (Italian wine names) with nearby prices,
 * then match quantities from separate QTY blocks.
 *
 * Products: all wines (Chianti, Valpolicella, Barbera, etc.)
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
  // Invoice number: near "facture" — 4+ digit number
  const numMatch = text.match(/facture\s*:\s*(\d{4,})/i)
    || text.match(/\b(\d{4})\b(?=\s+\d{2}[t/])/);
  // Date: DD/MM/YYYY or DDtMMtYYYY (OCR replaces / with t)
  const dateMatch = text.match(/(\d{2})[t/](\d{2})[t/](\d{4})/);
  // Sous-total + Total TTC: look for numbers near these labels
  // OCR: "sous-lotal '1 2'17.10 ¤" → need aggressive cleaning
  const stMatch = text.match(/sous-[lt]otal\s+['']?(\d[\d\s',.]*)\s*¤/i);
  const ttcMatch = text.match(/Tota[lt]\s+(\d[\d\s',.]*)\s*¤/i);

  return {
    invoice_number: numMatch?.[1] ?? null,
    invoice_date: dateMatch ? `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}` : null,
    total_ht: stMatch ? cleanOcrAmount(stMatch[1]) : null,
    total_ttc: ttcMatch ? cleanOcrAmount(ttcMatch[1]) : null,
  };
}

// ── OCR cleaning ────────────────────────────────────────────────────────────

function cleanOcrAmount(raw: string): number | null {
  let s = raw.replace(/[¤€eQ;)]/g, "").replace(/'/g, "").replace(/\s+/g, "").trim();
  // Normalize: replace common OCR digit errors
  s = s.replace(/æ/g, "5").replace(/t/g, "0").replace(/O/g, "0");
  return parseFrenchNumber(s);
}

function cleanOcrPrice(raw: string): number | null {
  let s = raw.replace(/[¤€eQ;)]/g, "").replace(/'/g, "").trim();
  s = s.replace(/æ/g, "0").replace(/t\)/g, "0").replace(/I/g, "1");
  s = s.replace(/,\s*t\s*/g, ",1").replace(/t\s*/g, "0");
  s = s.replace(/\s+/g, "");
  // Handle missing comma in 4-digit prices: "1420" → "14,20"
  if (/^\d{4}$/.test(s)) {
    s = s.slice(0, 2) + "," + s.slice(2);
  }
  return parseFrenchNumber(s);
}

// ── Product name + price extraction ─────────────────────────────────────────
// In pdfjs-dist output, product names appear near their unit prices:
// "Chianti Luggiêno   6,90 ¤" or "Barbera d'Astisuæriore   11,2æ."
// Names contain letters (Italian wine names), prices are numbers with , or .

const RE_NAME_PRICE = /([A-Za-zÀ-ÿ'\\][A-Za-zÀ-ÿ' \\.,]{2,}?(?:\s+(?:BIO|IGP|IGT|DOC|DOCG|DOP))*)\s{2,}([\d',æ.I]+)\s*[¤€eæ.]/g;

// ── Parser ──────────────────────────────────────────────────────────────────

export function parseVinoflo(text: string, etablissement: string): ParseResult {
  const meta = extractMeta(text);
  const detectedEtab = detectEtablissement(text);
  const etab = etablissement || detectedEtab || "bello_mio";

  const ingredients: ParsedIngredient[] = [];
  const logs: ParseLog[] = [];

  // 1. Extract product name + unit price pairs
  const products: { name: string; unitPrice: number; raw: string }[] = [];
  RE_NAME_PRICE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = RE_NAME_PRICE.exec(text)) !== null) {
    const [full, nameRaw, priceRaw] = match;
    const name = nameRaw
      .replace(/\\/g, "V")         // OCR: \i → Vi
      .replace(/â/g, "a")          // OCR: â → a
      .replace(/ê/g, "e")          // OCR: ê → e
      .replace(/æ/g, "a")          // OCR: æ → a (in names)
      .replace(/\s+/g, " ")
      .trim();

    // Skip header/footer text
    if (/factur|palemen|intér|marchand|pénalité|escompte|décret|propriété|transfer|régle|règle|lol\b|indemnité|forfait/i.test(name)) continue;
    if (/Qté|Article|Description|Prix|Total|Sous|TVA|Solde|IBAN|Adresse|Représentant/i.test(name)) continue;
    if (name.length < 4) continue;

    const price = cleanOcrPrice(priceRaw);
    if (price == null || price <= 0) continue;

    // Unit prices for wine: typically 3-25€
    if (price >= 2 && price <= 30) {
      products.push({ name, unitPrice: price, raw: full });
    }
  }

  // 2. Build ingredients — scanned PDFs have unreliable column extraction,
  // so we only extract names + unit prices. Totals/quantities must be verified manually.
  let matchCount = 0;

  for (let i = 0; i < products.length; i++) {
    matchCount++;
    const { name, unitPrice, raw } = products[i];

    // All scanned OCR results get low confidence
    const confidence = "low" as const;

    ingredients.push({
      name,
      unit_recette: "pcs",
      unit_commande: "pcs",
      prix_unitaire: unitPrice,
      prix_commande: unitPrice,
      categorie: "boissons",
      fournisseur_slug: "vinoflo",
      etablissement_id: etab,
      raw_line: raw.replace(/\s+/g, " ").slice(0, 200),
      confidence,
    });

    logs.push({
      line_number: matchCount,
      raw: raw.replace(/\s+/g, " ").slice(0, 120),
      rule: "vinoflo_ocr",
      result: "ok",
      detail: `${name} @${unitPrice}€`,
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

  // Always warn about OCR quality for scanned PDFs
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
