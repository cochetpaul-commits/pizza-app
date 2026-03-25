/*
 * Metro invoice parser
 *
 * Format Metro (colonnes PDF → texte extrait) :
 * EAN | N°Article | Désignation | Vol% | VAP |
 * Poids/VE | Prix unitaire | Qté | Colisage |
 * Montant | TVA
 *
 * Cas A — Produit à la pièce (poids vide) :
 *   EAN ARTICLE NOM  PRIX_UNIT  QTE  COLIS  MONTANT  TVA
 *
 * Cas B — Produit au poids (poids renseigné) :
 *   EAN ARTICLE NOM  POIDS_REEL  PRIX_KG  QTE  COLIS  MONTANT  TVA
 *
 * Cas C — Ligne "PRIX AU KG OU AU LITRE:" → associer au précédent
 *
 * Sections catégories : "*** BOUCHERIE Total: 107,85"
 */

import type { ParsedIngredient, ParseResult, ParseLog, Categorie } from "./types";
import { parseFrenchNumber, extractInlineUnit } from "./normalizeUnit";
import { categorieFromMetroSection, detectCategorieFromName } from "./categories";

// ── Detect establishment ────────────────────────────────────────────────────

function detectEtablissement(text: string): string | null {
  const upper = text.toUpperCase();
  if (upper.includes("SASHA") || upper.includes("BELLO MIO")) return "bello_mio";
  if (upper.includes("I FRATELLI") || upper.includes("IFRATELLI") || upper.includes("PICCOLA MIA")) return "piccola_mia";
  return null;
}

// ── Extract invoice metadata ────────────────────────────────────────────────

function extractMeta(text: string) {
  const invoiceMatch = text.match(/N[\xb0\xba]\s*FACTURE\s+([0-9/()A-Z]+)/i);
  const dateMatch = text.match(/Date\s+facture\s*:\s*(\d{2}-\d{2}-\d{4})/i);
  const htMatch = text.match(/Total\s+H\.?T\.?\s*[: ]+([0-9][0-9\s.,]*)/i);
  const ttcMatch = text.match(/Total\s+[àa]\s+payer\s+([0-9][0-9\s.,]*)/i);
  return {
    invoice_number: invoiceMatch?.[1]?.trim() ?? null,
    invoice_date: dateMatch?.[1] ?? null,
    total_ht: htMatch ? parseFrenchNumber(htMatch[1]) : null,
    total_ttc: ttcMatch ? parseFrenchNumber(ttcMatch[1]) : null,
  };
}

// ── Lines to skip ───────────────────────────────────────────────────────────

const SKIP_PATTERNS = [
  /^BIO\*\s+SIGNIFIE/i,
  /^Mention\s+MSC/i,
  /^\*{3}\s+.*Total\s*:/i,
  /^Page\s+\d/i,
  /^N[\xb0\xba]\s*FACTURE/i,
  /^Date\s+facture/i,
  /^Total\s+H\.?T/i,
  /^Total\s+[àa]\s+payer/i,
  /^EAN\s+/i,
  /^Récapitulatif\s+TVA/i,
  /^Taux\s+Base\s+HT/i,
];

function shouldSkipLine(line: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(line.trim()));
}

// ── Parse lines ─────────────────────────────────────────────────────────────

// Regex for standard Metro product line (piece — no weight column)
// EAN(8-13) ARTICLE(7) NAME... PRIX_UNIT QTE COLIS MONTANT TVA
const RE_PIECE = /^(\d{8,13})\s+(\d{7})\s+(.+?)\s+([\d,]+)\s+(\d+)\s+(\d+)\s+([\d,]+)\s+([ABD])\s*$/;

// Regex for VAP line (weight present) — has extra columns
// EAN ARTICLE NAME... POIDS PRIX_KG QTE COLIS MONTANT TVA
const RE_VAP = /^(\d{8,13})\s+(\d{7})\s+(.+?)\s+([\d,]+)\s+([\d,]+)\s+(\d+)\s+(\d+)\s+([\d,]+)\s+([ABD])\s*$/;

// Section header
const RE_SECTION = /^\*{3}\s+(.+?)(?:\s+Total\s*:.*)?$/;

// Prix au kg/litre line
const RE_PRIX_KG = /PRIX\s+AU\s+KG\s+OU\s+AU\s+LITRE\s*:\s*([\d,.]+)/i;

export function parseMetro(text: string, etablissement: string): ParseResult {
  const meta = extractMeta(text);
  const detectedEtab = detectEtablissement(text);
  const etab = etablissement || detectedEtab || "bello_mio";

  const rows = text.split(/\r?\n/);
  const ingredients: ParsedIngredient[] = [];
  const logs: ParseLog[] = [];

  let currentCategorie: Categorie = "autre";

  // Stop parsing at page 2 (TVA recap)
  let reachedPage2 = false;

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    if (reachedPage2) continue;

    // Detect page 2
    if (/^Page\s+2\b/i.test(trimmed) || /Récapitulatif\s+TVA/i.test(trimmed)) {
      reachedPage2 = true;
      logs.push({ line_number: i + 1, raw: trimmed, rule: "page2_stop", result: "skipped" });
      continue;
    }

    // Section headers
    const sectionMatch = trimmed.match(RE_SECTION);
    if (sectionMatch) {
      currentCategorie = categorieFromMetroSection(sectionMatch[1]);
      logs.push({ line_number: i + 1, raw: trimmed, rule: "section", result: "ok", detail: currentCategorie });
      continue;
    }

    // Skip irrelevant lines
    if (shouldSkipLine(trimmed)) {
      logs.push({ line_number: i + 1, raw: trimmed, rule: "skip_pattern", result: "skipped" });
      continue;
    }

    // Prix au kg line → attach to previous ingredient
    const prixKgMatch = trimmed.match(RE_PRIX_KG);
    if (prixKgMatch && ingredients.length > 0) {
      const prev = ingredients[ingredients.length - 1];
      const prixKg = parseFrenchNumber(prixKgMatch[1]);
      if (prixKg != null) {
        prev.prix_unitaire = prixKg;
        prev.unit_recette = "kg";
      }
      logs.push({ line_number: i + 1, raw: trimmed, rule: "prix_kg_attach", result: "ok", detail: `→ ${prev.name}` });
      continue;
    }

    // Try VAP line first (more columns)
    const vapMatch = trimmed.match(RE_VAP);
    if (vapMatch) {
      const ean = vapMatch[1];
      const article = vapMatch[2];
      const name = vapMatch[3].trim();
      const poidsReel = parseFrenchNumber(vapMatch[4]);
      const prixKg = parseFrenchNumber(vapMatch[5]);
      const qte = parseInt(vapMatch[6], 10);
      const montant = parseFrenchNumber(vapMatch[8]);

      if (prixKg != null && montant != null) {
        const cat = currentCategorie !== "autre" ? currentCategorie : detectCategorieFromName(name);

        ingredients.push({
          name,
          reference: article,
          ean,
          unit_recette: "kg",
          unit_commande: "kg",
          poids_unitaire: poidsReel ?? undefined,
          prix_unitaire: prixKg,
          prix_commande: montant,
          categorie: cat,
          fournisseur_slug: "metro",
          etablissement_id: etab,
          raw_line: trimmed,
          confidence: "high",
        });

        logs.push({ line_number: i + 1, raw: trimmed, rule: "vap_line", result: "ok", detail: `${name} @${prixKg}€/kg x${qte}` });
        continue;
      }
    }

    // Standard piece line
    const pieceMatch = trimmed.match(RE_PIECE);
    if (pieceMatch) {
      const ean = pieceMatch[1];
      const article = pieceMatch[2];
      const name = pieceMatch[3].trim();
      const prixUnit = parseFrenchNumber(pieceMatch[4]);
      const qte = parseInt(pieceMatch[5], 10);
      const colisage = parseInt(pieceMatch[6], 10);
      const montant = parseFrenchNumber(pieceMatch[7]);

      if (prixUnit != null && montant != null) {
        const cat = currentCategorie !== "autre" ? currentCategorie : detectCategorieFromName(name);

        // Check inline unit from name (e.g., "COURG FILET 2K" → kg)
        const inline = extractInlineUnit(name);
        let unitRecette = inline?.unit_recette ?? "pcs";
        let unitCommande: "pcs" | "colis" | "kg" = colisage > 1 ? "colis" : "pcs";

        // If product name has kg, it's sold by weight
        if (inline?.type === "poids" && (inline.unit_recette === "kg" || inline.unit_recette === "g")) {
          unitRecette = "kg";
          unitCommande = "kg";
        }

        ingredients.push({
          name,
          reference: article,
          ean,
          unit_recette: unitRecette,
          unit_commande: unitCommande,
          colisage: colisage > 1 ? colisage : undefined,
          poids_unitaire: inline?.type === "poids" ? inline.value : undefined,
          volume_unitaire: inline?.type === "volume" ? inline.value : undefined,
          prix_unitaire: prixUnit,
          prix_commande: montant,
          categorie: cat,
          fournisseur_slug: "metro",
          etablissement_id: etab,
          raw_line: trimmed,
          confidence: "high",
        });

        logs.push({ line_number: i + 1, raw: trimmed, rule: "piece_line", result: "ok", detail: `${name} @${prixUnit}€ x${qte} col=${colisage}` });
        continue;
      }
    }

    // Unmatched non-empty line
    if (trimmed.length > 5) {
      logs.push({ line_number: i + 1, raw: trimmed, rule: "unmatched", result: "skipped" });
    }
  }

  return {
    fournisseur: "metro",
    etablissement: etab,
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    ingredients,
    logs,
  };
}
