/*
 * Bar Spirits invoice parser
 *
 * Format Bar Spirits :
 * - Facture n°A01-F-2025-00924
 * - Date d'émission : DD/MM/YYYY
 * - Table: product names on separate lines, then "QTY UNIT PRIX€ TVA% TOTAL€"
 * - Units: Pièce, kg, l
 * - Multi-line product names (accumulated until data line)
 * - Totals: "Montant Total HT XX.XX€", "Montant Total TTC XX.XX€"
 */

import type { ParsedIngredient, ParseResult, ParseLog } from "./types";
import { extractInlineUnit } from "./normalizeUnit";
import { detectCategorieFromName } from "./categories";

// ── Helpers ─────────────────────────────────────────────────────────────────

function detectEtablissement(text: string): string | null {
  const upper = text.toUpperCase();
  if (upper.includes("SASHA") || upper.includes("BELLO MIO")) return "bello_mio";
  if (upper.includes("FRATELLI") || upper.includes("PICCOLA MIA")) return "piccola_mia";
  return null;
}

function extractMeta(text: string) {
  const invMatch = text.match(/Facture\s+n°([\w-]+)/i);
  const dateMatch = text.match(/Date\s+d.émission\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const htMatch = text.match(/Montant\s+Total\s+HT\s+([\d.]+)€/i);
  const ttcMatch = text.match(/Montant\s+Total\s+TTC\s+([\d.]+)€/i);

  return {
    invoice_number: invMatch?.[1] ?? null,
    invoice_date: dateMatch?.[1] ?? null,
    total_ht: htMatch ? parseFloat(htMatch[1]) : null,
    total_ttc: ttcMatch ? parseFloat(ttcMatch[1]) : null,
  };
}

function toUnitCommande(raw: string): "pcs" | "kg" {
  const s = raw.toLowerCase();
  if (s === "kg" || s === "kilogramme") return "kg";
  return "pcs";
}

// ── Parser ──────────────────────────────────────────────────────────────────

// Data line: "1 Pièce 29.00€ 20% 34.80€" or "2.5 kg 12.50€ 5.5% 31.25€"
const RE_DATA = /^(\d+(?:[,.]\d+)?)\s+(\S+)\s+([\d.]+)€\s+(\d+(?:\.\d+)?)%\s+([\d.]+)€$/;

// Column header
const RE_HEADER = /^Nom\s+Quantit[eé]/;

// End of product section
const RE_END = /^Montant\s+Total\s+TTC\s+[\d.]+€/i;

export function parseBarSpirits(text: string, etablissement: string): ParseResult {
  const meta = extractMeta(text);
  const detectedEtab = detectEtablissement(text);
  const etab = etablissement || detectedEtab || "bello_mio";

  const rows = text.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
  const ingredients: ParsedIngredient[] = [];
  const logs: ParseLog[] = [];

  let inProducts = false;
  let nameLines: string[] = [];
  let matchCount = 0;

  for (const row of rows) {
    if (!inProducts) {
      if (RE_HEADER.test(row)) inProducts = true;
      continue;
    }
    if (RE_END.test(row)) break;

    const m = RE_DATA.exec(row);
    if (m) {
      matchCount++;
      const qty = parseFloat(m[1].replace(",", "."));
      const unitRaw = m[2];
      const unitPrice = parseFloat(m[3]);
      const total = parseFloat(m[5]);
      const name = nameLines.join(" - ").trim();
      nameLines = [];

      if (!name) {
        logs.push({
          line_number: matchCount,
          raw: row.slice(0, 120),
          rule: "barspirits_no_name",
          result: "error",
          detail: "Data line without preceding name",
        });
        continue;
      }

      const unitCommande = toUnitCommande(unitRaw);
      const inline = unitCommande === "pcs" ? extractInlineUnit(name) : null;
      const unitRecette = unitCommande === "kg"
        ? ("kg" as const)
        : (inline?.unit_recette ?? ("pcs" as const));
      const cat = detectCategorieFromName(name);

      // Confidence: qty × prix ≈ total
      let confidence: "high" | "medium" | "low" = "high";
      const expected = qty * unitPrice;
      const tolerance = Math.max(0.05, total * 0.01);
      if (Math.abs(expected - total) > tolerance) {
        confidence = "medium";
      }

      ingredients.push({
        name,
        unit_recette: unitRecette,
        unit_commande: unitCommande,
        poids_unitaire: inline?.type === "poids" ? inline.value : undefined,
        volume_unitaire: inline?.type === "volume" ? inline.value : undefined,
        prix_unitaire: unitPrice,
        prix_commande: total,
        categorie: cat,
        fournisseur_slug: "bar_spirits",
        etablissement_id: etab,
        raw_line: `${name} | ${qty} ${unitRaw} @${unitPrice}€ = ${total}€`,
        confidence,
      });

      logs.push({
        line_number: matchCount,
        raw: `${name} | ${row}`.slice(0, 120),
        rule: "barspirits_product",
        result: "ok",
        detail: `${name} @${unitPrice}€ = ${total}€`,
      });
    } else {
      nameLines.push(row);
    }
  }

  if (matchCount === 0) {
    logs.push({
      line_number: 0,
      raw: text.slice(0, 200),
      rule: "barspirits_no_match",
      result: "error",
      detail: "No product lines found",
    });
  }

  return {
    fournisseur: "bar_spirits",
    etablissement: etab,
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    ingredients,
    logs,
  };
}
