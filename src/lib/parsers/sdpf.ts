/*
 * SDPF (Société de Distribution de Produits Fins) invoice parser
 *
 * Format:
 *   Facture N° FA067191
 *   MONT DOL le, 13/03/26
 *
 * Line format (pdfjs joins across lines):
 *   REFERENCE  DESIGNATION  [unit line: KG/PCE/...]  TIxxxxxx du DD/MM/YY  QTY  PU  [REMISE]  MONTANT_HT
 *
 * TVA table:
 *   V05  BASE  TAUX%  MONTANT_TVA
 *   TOTAL  TOTAL_HT  TOTAL_TVA
 *   NET A PAYER  TOTAL_TTC
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
  // Invoice number: "Facture N° FA067191"
  const invMatch = text.match(/Facture\s+N[°º]?\s*([A-Z]{2}\d{5,})/i);

  // Date: "13/03/26" or "13/03/2026"
  const dateMatch =
    text.match(/le,?\s+(\d{2})\/(\d{2})\/(\d{2,4})/i) ??
    text.match(/(\d{2})\/(\d{2})\/(\d{2,4})\s/);
  let invoice_date: string | null = null;
  if (dateMatch) {
    const year = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3];
    invoice_date = `${dateMatch[1]}/${dateMatch[2]}/${year}`;
  }

  // Total HT from TVA table: "TOTAL 444,90 24,47" (first number = total HT)
  // or from "Total HT" row
  const totalLineMatch = text.match(/\bTOTAL\s+([\d\s.,]+?)\s+([\d\s.,]+?)(?:\s|$)/m);
  let total_ht: number | null = null;
  if (totalLineMatch) {
    total_ht = parseFrenchNumber(totalLineMatch[1]);
  }

  // Total TTC: from V05 line (7th value = Total TTC) or "NET A PAYER" or "Conditions de règlement : XXX"
  const ttcMatch =
    text.match(/V\d+\s+[\d.,]+\s+[\d.,]+%\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+\s+([\d.,]+)/) ??
    text.match(/Conditions\s+de\s+r[èe]glement\s*:\s*([\d\s.,]+)/i) ??
    text.match(/NET\s+A\s+PAYER[^]*?([\d.,]+)\s*$/mi);
  let total_ttc: number | null = null;
  if (ttcMatch) {
    total_ttc = parseFrenchNumber(ttcMatch[1]);
  }

  return {
    invoice_number: invMatch?.[1] ?? null,
    invoice_date,
    total_ht,
    total_ttc,
  };
}

// ── Product line parsing ────────────────────────────────────────────────────
// pdfjs output for SDPF typically looks like:
// "010100401037 GIANDUJA NOISETTES LAIT 35% BLOC KG TI003272 du 11/03/26 15,000 29,660 444,90"
// or multi-line. We capture: REF NAME [UNIT] TIxxxxxx du DD/MM/YY QTY PU [REMISE] MONTANT

// Primary: REF NAME [UNIT] T[IC]ref du DD/MM/YY QTY PU [REMISE] MONTANT
const LINE_RE =
  /(\d{6,15})\s+(.+?)\s+(?:(KG|PCE?|PCS|L|CL|ML|BT|LOT|PIECE|UNITE?)\s+)?T[IC]\d+\s+du\s+\d{2}\/\d{2}\/\d{2,4}\s+([\d.,]+)\s+([\d.,]+)\s+(?:([\d.,]+)\s+)?([\d.,]+)/gi;

// Alternate: single-line without TI/TC ref (just numbers at end)
const LINE_ALT_RE =
  /(\d{6,15})\s+(.+?)\s+(?:(KG|PCE?|PCS|L|CL|ML|BT|LOT|PIECE|UNITE?)\s+)?([\d.,]+)\s+([\d.,]+)\s+(?:([\d.,]+)\s+)?([\d.,]+)/gi;

function parseLines(text: string, etab: string): { ingredients: ParsedIngredient[]; logs: ParseLog[] } {
  const ingredients: ParsedIngredient[] = [];
  const logs: ParseLog[] = [];
  const seen = new Set<string>();
  let matchCount = 0;

  // Try primary regex first
  LINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = LINE_RE.exec(text)) !== null) {
    matchCount++;
    const sku = m[1];
    const name = m[2].trim().replace(/\s+/g, " ");
    const rawUnit = m[3]?.toUpperCase() ?? null;
    const qty = parseFrenchNumber(m[4]);
    const pu = parseFrenchNumber(m[5]);
    // m[6] is optional remise
    const montant = parseFrenchNumber(m[7]);

    const key = `${sku}|${name}|${qty}|${pu}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (!name || pu == null) {
      logs.push({ line_number: matchCount, raw: m[0].slice(0, 120), rule: "sdpf_invalid", result: "error", detail: "Missing name or price" });
      continue;
    }

    // Detect unit: explicit keyword or infer from qty (fractional = kg)
    const isKg = rawUnit === "KG" || (rawUnit == null && qty != null && qty < 100 && qty % 1 !== 0);
    const unitRecette = isKg ? "kg" as const : "pcs" as const;
    const unitCommande = isKg ? "kg" as const : "pcs" as const;
    const cat = detectCategorieFromName(name);

    ingredients.push({
      name,
      reference: sku,
      unit_recette: unitRecette,
      unit_commande: unitCommande,
      prix_unitaire: pu,
      prix_commande: montant ?? (qty != null && pu != null ? Math.round(qty * pu * 100) / 100 : pu),
      categorie: cat,
      fournisseur_slug: "sdpf",
      etablissement_id: etab,
      raw_line: m[0].replace(/\s+/g, " ").slice(0, 200),
      confidence: "high",
    });

    logs.push({
      line_number: matchCount,
      raw: `${sku} ${name}`.slice(0, 120),
      rule: isKg ? "sdpf_weight" : "sdpf_piece",
      result: "ok",
      detail: `${name} ${qty} ${rawUnit} @${pu}€ = ${montant}€`,
    });
  }

  // Fallback: try alternate regex if nothing found
  if (matchCount === 0) {
    LINE_ALT_RE.lastIndex = 0;
    while ((m = LINE_ALT_RE.exec(text)) !== null) {
      matchCount++;
      const sku = m[1];
      const name = m[2].trim().replace(/\s+/g, " ");
      const rawUnit = m[3]?.toUpperCase() ?? null;
      const qty = parseFrenchNumber(m[4]);
      const pu = parseFrenchNumber(m[5]);
      const montant = parseFrenchNumber(m[7]);

      const key = `${sku}|${name}|${qty}|${pu}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (!name || pu == null) continue;

      const isKg = rawUnit === "KG" || (rawUnit == null && qty != null && qty < 100 && qty % 1 !== 0);
      const cat = detectCategorieFromName(name);

      ingredients.push({
        name,
        reference: sku,
        unit_recette: isKg ? "kg" : "pcs",
        unit_commande: isKg ? "kg" : "pcs",
        prix_unitaire: pu,
        prix_commande: montant ?? pu,
        categorie: cat,
        fournisseur_slug: "sdpf",
        etablissement_id: etab,
        raw_line: m[0].replace(/\s+/g, " ").slice(0, 200),
        confidence: "medium",
      });

      logs.push({
        line_number: matchCount,
        raw: `${sku} ${name}`.slice(0, 120),
        rule: "sdpf_alt",
        result: "ok",
        detail: `${name} ${qty} ${rawUnit} @${pu}€ = ${montant}€`,
      });
    }
  }

  if (matchCount === 0) {
    logs.push({
      line_number: 0,
      raw: text.slice(0, 200),
      rule: "sdpf_no_match",
      result: "error",
      detail: "No product lines found",
    });
  }

  return { ingredients, logs };
}

// ── Main parser ─────────────────────────────────────────────────────────────

export function parseSdpf(text: string, etablissement: string): ParseResult {
  const meta = extractMeta(text);
  const detectedEtab = detectEtablissement(text);
  const etab = etablissement || detectedEtab || "bello_mio";
  const { ingredients, logs } = parseLines(text, etab);

  return {
    fournisseur: "sdpf",
    etablissement: etab,
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    ingredients,
    logs,
  };
}
