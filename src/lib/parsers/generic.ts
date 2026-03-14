/*
 * Generic fallback parser
 *
 * Attempts to parse invoice lines using common patterns.
 * Used when no dedicated supplier parser matches or as fallback.
 */

import type { ParsedIngredient, ParseResult, ParseLog } from "./types";
import { parseFrenchNumber, extractInlineUnit } from "./normalizeUnit";
import { detectCategorieFromName } from "./categories";

// Generic line: tries to find name + numbers (price, quantity)
// Heuristic: look for lines with at least one decimal number
const RE_NUMBERS = /([\d]+[.,]\d{2,3})/g;

export function parseGeneric(
  text: string,
  fournisseur: string,
  etablissement: string,
): ParseResult {
  const rows = text.split(/\r?\n/);
  const ingredients: ParsedIngredient[] = [];
  const logs: ParseLog[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length < 5) continue;

    // Find all numbers in the line
    const numbers: number[] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(RE_NUMBERS.source, "g");
    while ((m = re.exec(trimmed)) !== null) {
      const n = parseFrenchNumber(m[1]);
      if (n != null) numbers.push(n);
    }

    // Need at least 2 numbers (price + total or qty + price)
    if (numbers.length < 2) {
      if (trimmed.length > 10) {
        logs.push({ line_number: i + 1, raw: trimmed, rule: "generic_skip", result: "skipped", detail: "not enough numbers" });
      }
      continue;
    }

    // Extract name: everything before the first number
    const firstNumIdx = trimmed.search(/\d+[.,]\d{2}/);
    if (firstNumIdx < 3) {
      logs.push({ line_number: i + 1, raw: trimmed, rule: "generic_skip", result: "skipped", detail: "name too short" });
      continue;
    }

    const name = trimmed.slice(0, firstNumIdx).trim();
    if (!name || name.length < 2) continue;

    // Heuristic: last number is total, second-to-last is unit price
    const total = numbers[numbers.length - 1];
    const unitPrice = numbers.length >= 2 ? numbers[numbers.length - 2] : total;

    const inline = extractInlineUnit(name);
    const cat = detectCategorieFromName(name);

    ingredients.push({
      name,
      unit_recette: inline?.unit_recette ?? "pcs",
      unit_commande: "pcs",
      poids_unitaire: inline?.type === "poids" ? inline.value : undefined,
      volume_unitaire: inline?.type === "volume" ? inline.value : undefined,
      prix_unitaire: unitPrice,
      prix_commande: total,
      categorie: cat,
      fournisseur_slug: fournisseur,
      etablissement_id: etablissement,
      raw_line: trimmed,
      confidence: "low",
    });

    logs.push({ line_number: i + 1, raw: trimmed, rule: "generic_heuristic", result: "ok", detail: `${name} @${unitPrice}€` });
  }

  return {
    fournisseur,
    etablissement,
    invoice_number: null,
    invoice_date: null,
    total_ht: null,
    total_ttc: null,
    ingredients,
    logs,
  };
}
