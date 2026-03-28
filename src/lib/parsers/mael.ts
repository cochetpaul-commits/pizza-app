/*
 * Maël invoice parser
 *
 * Format Maël (colonnes PDF):
 * Réf | DLC/DLUO + Désignation | Quantité | Unité | P/HT | Mt Tot HT | TVA
 *
 * Ref: ART\d{4} or RESTO\d+\.?\d*
 * DLC/DLUO: "NC" (pas de date) ou date(s) — DD/MM/YY, MM/YY, N*DD/MM/YY
 * Quantité: toujours 3 décimales (ex: 10,000 / 1,176 / 4,889)
 * Unité: "U" (pièce) ou "kg~" (au poids approx)
 * P/HT: prix unitaire HT, 2 décimales
 * Mt Tot HT: montant total HT, 2 décimales
 * TVA: code chiffre (2 = 5.5%, 5 = 20%)
 *
 * Particularités:
 * - Une facture regroupe plusieurs bons de livraison
 * - Articles en double possible (même ART sur différents BL)
 * - Désignations multi-lignes (jointures pdfjs-dist)
 * - REMISE CASSE -XX% : prix déjà ajusté dans Mt Tot HT
 * - REPRISE : lignes de retour à ignorer
 * - Détection établissement : "BELLO MIO (SASHA)" / "I FRATELLI"
 */

import type { ParsedIngredient, ParseResult, ParseLog } from "./types";
import { parseFrenchNumber, extractInlineUnit } from "./normalizeUnit";
import { detectCategorieFromName } from "./categories";

// ── Detect establishment ────────────────────────────────────────────────────

function detectEtablissement(text: string): string | null {
  const upper = text.toUpperCase();
  if (upper.includes("SASHA") || upper.includes("BELLO MIO")) return "bello_mio";
  if (upper.includes("I FRATELLI") || upper.includes("IFRATELLI") || upper.includes("PICCOLA MIA")) return "piccola_mia";
  return null;
}

// ── Extract invoice metadata ────────────────────────────────────────────────

function extractMeta(text: string) {
  const numMatch = text.match(/Facture\s+N[°º]?\s*(\S+)/i);
  // Date format in Maël: "Client  06/03/2026  177  Date  Facture N°"
  // or "Date  06/03/2026"
  const dateMatch = text.match(/(?:Client|Date)\s+(\d{2}\/\d{2}\/\d{4})\s+\d/);
  // Maël totals layout (pdfjs): "3 892,62 216,37  Totaux  H.T.   : T.V.A. :"
  // Numbers appear BEFORE their labels. Also: "Total TTC  3 892,62" or "4 108,99  Total TTC"
  // Strategy: look for "Totaux" marker, then numbers nearby
  const htMatch = text.match(/([\d][\d\s]*[.,]\d{2})\s+[\d\s,]+Totaux\s+H\.T\./);
  const ttcMatch = text.match(/([\d][\d\s]*[.,]\d{2})\s+Total\s+TTC/i)
    || text.match(/Total\s+TTC\s+([\d][\d\s]*[.,]\d{2})/i);
  const netMatch = text.match(/([\d][\d\s]*[.,]\d{2})\s+Net\s+[àa]\s+payer/i)
    || text.match(/Net\s+[àa]\s+payer\s+([\d][\d\s]*[.,]\d{2})/i);
  return {
    invoice_number: numMatch?.[1]?.trim() ?? null,
    invoice_date: dateMatch?.[1] ?? null,
    total_ht: htMatch ? parseFrenchNumber(htMatch[1]) : null,
    total_ttc: (ttcMatch ? parseFrenchNumber(ttcMatch[1]) : null) ?? (netMatch ? parseFrenchNumber(netMatch[1]) : null),
  };
}

// ── Product line regex ──────────────────────────────────────────────────────
// Matches: REF  NAME_AREA  QTY(3dec)  UNIT  PRIX(2dec)  TOTAL(2dec)  TVA(1digit)
// Uses [\s\S]*? (lazy, dotall) for name area to handle multi-line designations.
// Quantity with 3 decimal places is the key anchor distinguishing it from
// numbers in product names (100 g, 2.5 kg, etc.)

const RE_PRODUCT = /(ART\d{4}|RESTO\d+(?:\.\d+)?)\s+([\s\S]*?)\s+(\d+[.,]\d{3})\s+(U|kg~)\s+(\d+[.,]\d{2})\s+(\d+[.,]\d{2})\s+(\d)(?:\s.*?)?$/gm;

// Strip DLC/DLUO prefix from name area
// "NC ", "01/27 ", "08/06/26 ", "3*17/05/26 1*15/11/26 ", "24/01/27Olive" (no space)
const RE_DLC_PREFIX = /^(?:NC|(?:\d+\*)?(?:\d{2}\/){1,2}\d{2,4}(?:\s+(?:\d+\*)?(?:\d{2}\/){1,2}\d{2,4})*)\s*/;

// Strip REMISE suffix
const RE_REMISE = /\s*REMISE\s+.*$/i;

// TVA code → rate mapping
const _TVA_MAP: Record<string, number> = { "2": 5.5, "5": 20.0 };
void _TVA_MAP;

// ── Parser ──────────────────────────────────────────────────────────────────

export function parseMael(text: string, etablissement: string): ParseResult {
  const meta = extractMeta(text);
  const detectedEtab = detectEtablissement(text);
  const etab = etablissement || detectedEtab || "bello_mio";

  const ingredients: ParsedIngredient[] = [];
  const logs: ParseLog[] = [];

  let match: RegExpExecArray | null;
  let matchCount = 0;

  RE_PRODUCT.lastIndex = 0;

  while ((match = RE_PRODUCT.exec(text)) !== null) {
    matchCount++;
    const [fullMatch, ref, nameArea, qtyStr, unit, prixStr, totalStr, _tvaCode] = match;

    // Clean name: strip DLC prefix → REMISE suffix → collapse whitespace
    void _tvaCode;
    const name = nameArea
      .replace(RE_DLC_PREFIX, "")
      .replace(RE_REMISE, "")
      .replace(/\s+/g, " ")
      .trim();

    const qty = parseFrenchNumber(qtyStr);
    const prixUnit = parseFrenchNumber(prixStr);
    const total = parseFrenchNumber(totalStr);

    if (!name || prixUnit == null || total == null) {
      logs.push({
        line_number: matchCount,
        raw: fullMatch.replace(/\s+/g, " ").slice(0, 120),
        rule: "mael_invalid",
        result: "error",
        detail: "missing name or price",
      });
      continue;
    }

    // Unit detection: kg~ → weight, U → piece
    const isWeight = unit === "kg~";
    const unitCommande = isWeight ? ("kg" as const) : ("pcs" as const);

    // For piece items, extract inline weight/volume from name
    // e.g., "Beurre doux 500 g" → unit_recette=g, poids=500
    // e.g., "Huile d'olive 5 L" → unit_recette=L, volume=5
    // e.g., "Farine tipo 1 SOFFIO 25 kg" → unit_recette=kg, poids=25
    const inline = !isWeight ? extractInlineUnit(name) : null;
    const unitRecette = isWeight ? ("kg" as const) : (inline?.unit_recette ?? ("pcs" as const));

    // Category detection from name
    const cat = detectCategorieFromName(name);

    // Confidence: check qty × prix ≈ total (allow rounding tolerance)
    let confidence: "high" | "medium" | "low" = "high";
    if (qty != null && prixUnit != null && total != null) {
      const expected = qty * prixUnit;
      const tolerance = Math.max(0.10, total * 0.01);
      if (Math.abs(expected - total) > tolerance) {
        confidence = "medium";
      }
    }

    ingredients.push({
      name,
      reference: ref,
      unit_recette: unitRecette,
      unit_commande: unitCommande,
      poids_unitaire: inline?.type === "poids" ? inline.value : undefined,
      volume_unitaire: inline?.type === "volume" ? inline.value : undefined,
      prix_unitaire: prixUnit,
      prix_commande: total,
      categorie: cat,
      fournisseur_slug: "mael",
      etablissement_id: etab,
      raw_line: fullMatch.replace(/\s+/g, " ").slice(0, 200),
      confidence,
    });

    logs.push({
      line_number: matchCount,
      raw: fullMatch.replace(/\s+/g, " ").slice(0, 120),
      rule: isWeight ? "mael_weight" : "mael_piece",
      result: "ok",
      detail: `${name} @${prixUnit}€${isWeight ? "/kg" : ""} = ${total}€`,
    });
  }

  if (matchCount === 0) {
    logs.push({
      line_number: 0,
      raw: text.slice(0, 200),
      rule: "mael_no_match",
      result: "error",
      detail: "No product lines found",
    });
  }

  return {
    fournisseur: "mael",
    etablissement: etab,
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    ingredients,
    logs,
  };
}
