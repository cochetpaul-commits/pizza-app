/**
 * Parser for Kezia "JOURNAL de SYNTHESE" PDF text output.
 * Expects text extracted via pdfToText (line breaks by Y-coordinate).
 */

export type KeziaDaily = {
  date: string; // YYYY-MM-DD
  date_raw: string; // DD/MM/YYYY as found in PDF
  ca_ttc: number;
  ca_ht: number;
  tva_total: number;
  tickets: number;
  couverts: number;
  panier_moyen: number;
  especes: number;
  cartes: number;
  cheques: number;
  virements: number;
  marge_total: number;
  taux_marque: number; // percentage as decimal e.g. 0.2989
  rayons: Array<{
    name: string;
    qty: number;
    ca_ht: number;
    ca_ttc: number;
    marge: number;
    marge_pct: number;
    repart_pct: number;
  }>;
  tva_details: Array<{
    rate: number; // e.g. 5.5, 10, 20
    montant: number;
    base_ht: number;
    base_ttc: number;
  }>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a French-formatted number: "1 234,56" → 1234.56, handles "Eur" / "€" suffixes */
function parseFr(raw: string): number {
  if (!raw) return 0;
  let s = raw.trim();
  // Remove currency suffixes
  s = s.replace(/\s*(Eur|€)\s*/gi, "");
  // Remove thousands separators (space or non-breaking space)
  s = s.replace(/[\s ]/g, "");
  // Comma → dot
  s = s.replace(",", ".");
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

/** Convert DD/MM/YYYY → YYYY-MM-DD */
function frDateToIso(raw: string): string {
  const m = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Find a number on the same line (or the next line) after a label.
 * Returns the first French-formatted number found after the label text.
 */
function findValueAfterLabel(
  lines: string[],
  labelRe: RegExp,
  opts?: { sameLineOnly?: boolean }
): number {
  for (let i = 0; i < lines.length; i++) {
    if (labelRe.test(lines[i])) {
      // Try to grab number from the same line, after the label match
      const after = lines[i].replace(labelRe, "");
      const numMatch = after.match(/-?[\d\s ]+,\d{2}/);
      if (numMatch) return parseFr(numMatch[0]);
      // Fallback: look at next line
      if (!opts?.sameLineOnly && i + 1 < lines.length) {
        const nextMatch = lines[i + 1].match(/-?[\d\s ]+,\d{2}/);
        if (nextMatch) return parseFr(nextMatch[0]);
      }
    }
  }
  return 0;
}

/**
 * Extract all French-formatted numbers from a string.
 * Matches patterns like "1 234,56" or "-12,34" or "0,00".
 */
function extractNumbers(s: string): number[] {
  const matches = s.match(/-?[\d\s ]*\d+,\d{2}/g);
  if (!matches) return [];
  return matches.map(parseFr);
}

/**
 * Find a payment line: "ESPECES 123,45 Eur 5"
 * Returns { amount, qty }.
 */
function findPayment(lines: string[], label: RegExp): number {
  for (const line of lines) {
    if (label.test(line)) {
      const nums = extractNumbers(line);
      if (nums.length > 0) return nums[0];
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseKeziaSynthese(text: string): KeziaDaily {
  const lines = text.split("\n").map((l) => l.trim());

  // ---- Date ----
  let dateRaw = "";
  for (const line of lines) {
    // Look for "DEBUT = DD/MM/YYYY" or "FIN = DD/MM/YYYY"
    const dm = line.match(/(?:DEBUT|FIN)\s*=\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (dm) {
      dateRaw = dm[1];
      // Prefer FIN date if both present; keep scanning
      if (/FIN/i.test(line)) break;
    }
  }
  const dateIso = frDateToIso(dateRaw);

  // ---- Payments ----
  const especes = findPayment(lines, /ESP[EÈ]CES/i);
  const cartes = findPayment(lines, /CARTES?/i);
  const cheques = findPayment(lines, /CH[EÈ]QUES?/i);
  const virements = findPayment(lines, /VIREMENTS?/i);

  // ---- Key figures ----
  const caTtc = findValueAfterLabel(lines, /Total\s+Global\s+R[eé]glements/i);
  const tickets = findValueAfterLabel(lines, /Nbre\s+factures?\s*\/?\s*tickets?\s+ventes?/i);
  const couverts = findValueAfterLabel(lines, /(?<!Moy\.\s*)Couverts(?!\s+Moy)/i);
  const panierMoyen = findValueAfterLabel(lines, /Panier\s+Moyen/i);

  // Use integer parsing for tickets and couverts (they are counts)
  const ticketsInt = Math.round(tickets);
  const couvertsInt = Math.round(couverts);

  // ---- TVA details ----
  const tvaDetails: KeziaDaily["tva_details"] = [];
  let tvaTotal = 0;

  for (const line of lines) {
    // Match TVA rate lines like "5,50 %" or "20,00 %"
    const tvaMatch = line.match(/(\d+,\d+)\s*%/);
    if (tvaMatch) {
      const rate = parseFr(tvaMatch[1]);
      // Skip if rate is unreasonable (> 100 means it's a percentage line like marge or repart)
      if (rate > 100 || rate <= 0) continue;
      // Only consider standard French TVA rates
      if (![2.1, 5.5, 10, 20].includes(rate)) continue;

      const nums = extractNumbers(line.replace(tvaMatch[0], ""));
      if (nums.length >= 3) {
        tvaDetails.push({
          rate,
          montant: nums[0],
          base_ht: nums[1],
          base_ttc: nums[2],
        });
      }
    }
  }

  // Look for TVA total line (often labelled "Total" in the TVA section)
  // Sum TVA montants as fallback
  if (tvaDetails.length > 0) {
    tvaTotal = tvaDetails.reduce((sum, d) => sum + d.montant, 0);
  }

  // ---- CA HT ----
  // Derive from TVA details if available, otherwise from total - tva
  let caHt = 0;
  if (tvaDetails.length > 0) {
    caHt = tvaDetails.reduce((sum, d) => sum + d.base_ht, 0);
  }
  if (caHt === 0 && caTtc > 0 && tvaTotal > 0) {
    caHt = caTtc - tvaTotal;
  }

  // ---- Rayons ----
  const rayons: KeziaDaily["rayons"] = [];
  let margeTotal = 0;
  let tauxMarque = 0;
  let inRayonsSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect start of rayons table
    if (/Rayon\b/i.test(line) && /Qt[eé]/i.test(line) && /CA\s*(HT|TTC)/i.test(line)) {
      inRayonsSection = true;
      continue;
    }

    // Taux de marque ends the section
    if (/Taux\s+de\s+marque/i.test(line)) {
      inRayonsSection = false;
      const tm = line.match(/(\d+,\d+)\s*%/);
      if (tm) {
        tauxMarque = parseFr(tm[1]) / 100;
      }
      continue;
    }

    if (!inRayonsSection) continue;

    // Skip empty or header-like lines
    if (!line || /^\s*$/.test(line)) continue;

    // A rayon line looks like: "RESTO 245 1 234,56 1 456,78 345,67 29,89 % 85,23 %"
    // Or "CAVE & SPIRITUEUX 12 ..."
    // The name is the leading text before the first number
    const nameMatch = line.match(/^([A-ZÀ-Ü\s&]+?)\s+(-?[\d\s ]*\d+[,.]?\d*)/i);
    if (!nameMatch) {
      // Could be a "Total" line
      if (/^Total\b/i.test(line)) {
        const nums = extractNumbers(line.replace(/^Total\s*/i, ""));
        if (nums.length >= 4) {
          // nums: qty, ca_ht, ca_ttc, marge, ...
          margeTotal = nums[3];
        }
        inRayonsSection = false;
        continue;
      }
      continue;
    }

    const name = nameMatch[1].trim();
    if (!name || /^(Rayon|Total)$/i.test(name)) continue;

    // Extract all numbers from the line
    const nums = extractNumbers(line.replace(name, ""));
    if (nums.length < 5) continue;

    // Expected order: Qté, CA HT, CA TTC, Marge, Marge %, Repart %
    // Marge % and Repart % may include "%" which extractNumbers ignores
    // Re-extract percentages
    const pctMatches = line.match(/([\d\s,]+)\s*%/g);
    const pcts = pctMatches
      ? pctMatches.map((p) => parseFr(p.replace("%", "")))
      : [];

    rayons.push({
      name,
      qty: Math.round(nums[0]),
      ca_ht: nums[1],
      ca_ttc: nums[2],
      marge: nums[3],
      marge_pct: pcts.length >= 1 ? pcts[0] / 100 : 0,
      repart_pct: pcts.length >= 2 ? pcts[1] / 100 : 0,
    });
  }

  // If CA HT still 0, sum from rayons
  if (caHt === 0 && rayons.length > 0) {
    caHt = rayons.reduce((sum, r) => sum + r.ca_ht, 0);
  }

  // If marge_total still 0, sum from rayons
  if (margeTotal === 0 && rayons.length > 0) {
    margeTotal = rayons.reduce((sum, r) => sum + r.marge, 0);
  }

  return {
    date: dateIso,
    date_raw: dateRaw,
    ca_ttc: caTtc,
    ca_ht: caHt,
    tva_total: tvaTotal,
    tickets: ticketsInt,
    couverts: couvertsInt,
    panier_moyen: panierMoyen,
    especes,
    cartes,
    cheques,
    virements,
    marge_total: margeTotal,
    taux_marque: tauxMarque,
    rayons,
    tva_details: tvaDetails,
  };
}
