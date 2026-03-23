/*
 * Eric Elien (Artisan Glacier) invoice parser
 *
 * Format:
 *   Facture N° D61541
 *   Date : 31/12/2025
 *
 * Line format:
 *   DESCRIPTION  QTY  PU_HT  MONTANT_HT  TVA%
 *   e.g. "4.5 L VANILLE (gousse naturelle infusée) 5,00 23,00 115,00 5,50"
 *
 * Lines starting with "Transformé de :" are command group headers (skipped).
 * Totals: "Total HT 630,20" / "Total TTC 664,86" / "Net à payer 664,86"
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
  // "Facture N° D61541"
  const invMatch = text.match(/Facture\s+N[°º]?\s*([A-Z]?\d{4,})/i);

  // "Date : 31/12/2025"
  const dateMatch = text.match(/Date\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  let invoice_date: string | null = null;
  if (dateMatch) {
    invoice_date = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
  }

  // "Total HT 630,20"
  const htMatch = text.match(/Total\s+HT\s+([\d\s.,]+)/i);
  const total_ht = htMatch ? parseFrenchNumber(htMatch[1]) : null;

  // "Total TTC 664,86" or "Net à payer 664,86"
  const ttcMatch =
    text.match(/Total\s+TTC\s+([\d\s.,]+)/i) ??
    text.match(/Net\s+[àa]\s+payer\s+([\d\s.,]+)/i);
  const total_ttc = ttcMatch ? parseFrenchNumber(ttcMatch[1]) : null;

  return { invoice_number: invMatch?.[1] ?? null, invoice_date, total_ht, total_ttc };
}

// ── Product line parsing ────────────────────────────────────────────────────
// Lines like: "4.5 L VANILLE (gousse naturelle infusée) 5,00 23,00 115,00 5,50"
// or: "* BIO - 2.5 L CITRON 1,00 16,00 16,00 5,50"
// Pattern: DESCRIPTION then 4 numbers at end (qty, pu, montant, tva)

const LINE_RE =
  /^(.+?)\s+([\d]+[.,]\d+)\s+([\d]+[.,]\d+)\s+([\d]+[.,]\d+)\s+([\d]+[.,]\d+)\s*$/;

export function parseElien(text: string, etablissement: string): ParseResult {
  const meta = extractMeta(text);
  const detectedEtab = detectEtablissement(text);
  const etab = etablissement || detectedEtab || "bello_mio";

  const ingredients: ParsedIngredient[] = [];
  const logs: ParseLog[] = [];
  const seen = new Set<string>();
  let lineNum = 0;

  const rows = text.split(/\r?\n/);

  for (const row of rows) {
    const trimmed = row.trim();

    // Skip empty, headers, command group lines, totals
    if (!trimmed) continue;
    if (/^(Transformé|Transform|Récapitulatif|Date d|Escompte|En cas de|Coordonn|Banque|IBAN|BIC|Total|Net |Description|Qté|Mode de|Rue de|SAS au)/i.test(trimmed)) continue;
    if (/^\d{2}\/\d{2}\/\d{4}\s+LCR/i.test(trimmed)) continue;
    if (/^(BELLO|SASHA|PLACE|ST MALO|35400|Facture|Date\s*:)/i.test(trimmed)) continue;

    const m = LINE_RE.exec(trimmed);
    if (!m) continue;

    lineNum++;
    const name = m[1].trim().replace(/^\*\s*/, "").replace(/\s+/g, " ");
    const qty = parseFrenchNumber(m[2]);
    const pu = parseFrenchNumber(m[3]);
    const montant = parseFrenchNumber(m[4]);
    const tva = parseFrenchNumber(m[5]);

    if (!name || pu == null) continue;

    // Dedup by name+pu (same product at same price across commands = aggregate later)
    const key = `${name}|${pu}|${qty}|${montant}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Extract volume from name: "4.5 L VANILLE..." or "2.5 L CITRON"
    const volMatch = name.match(/^(\d+(?:[.,]\d+)?)\s*L\s+/i);
    const volumeL = volMatch ? parseFloat(volMatch[1].replace(",", ".")) : undefined;

    const cat = detectCategorieFromName(name);

    ingredients.push({
      name,
      unit_recette: volumeL ? "L" : "pcs",
      unit_commande: "pcs",
      volume_unitaire: volumeL,
      prix_unitaire: pu,
      prix_commande: montant ?? pu,
      categorie: cat !== "autre" ? cat : "surgele", // glaces = surgelé by default
      fournisseur_slug: "elien",
      etablissement_id: etab,
      raw_line: trimmed.slice(0, 200),
      confidence: "high",
    });

    logs.push({
      line_number: lineNum,
      raw: trimmed.slice(0, 120),
      rule: "elien_line",
      result: "ok",
      detail: `${name} x${qty} @${pu}€ = ${montant}€ TVA${tva}%`,
    });
  }

  if (lineNum === 0) {
    logs.push({
      line_number: 0,
      raw: text.slice(0, 200),
      rule: "elien_no_match",
      result: "error",
      detail: "No product lines found",
    });
  }

  return {
    fournisseur: "elien",
    etablissement: etab,
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    ingredients,
    logs,
  };
}
