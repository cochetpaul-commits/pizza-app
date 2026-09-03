/**
 * Parser for Kezia "JOURNAL de SYNTHESE" PDF text output.
 * Expects text extracted via pdfToText (line breaks by Y-coordinate).
 */

/** Un mode de règlement du bloc « Encaissements Nets / Dont Remboursement / Qté » */
export type KeziaReglement = { montant: number; qte: number; remboursement?: number };

export type KeziaDaily = {
  date: string; // YYYY-MM-DD — la date DEBUT du journal (jamais la date du mail)
  date_raw: string; // DD/MM/YYYY as found in PDF
  date_debut: string; // YYYY-MM-DD ("" si absente)
  date_fin: string; // YYYY-MM-DD — différente de date_debut ⇒ récapitulatif mensuel
  /** Modes non nuls seulement : ESPECES, CHEQUES, CARTES, VIREMENT, CONECS, CREDIT, REGUL, BON ACHAT */
  reglements: Record<string, KeziaReglement>;
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
    taux: number; // e.g. 5.5, 10, 20
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
    const lm = lines[i].match(labelRe);
    if (lm && lm.index != null) {
      // Le nombre cherché est APRÈS le libellé : sur « 5,50 % 20,71 Eur … Panier Moyen 20,95 Eur »
      // (deux colonnes du PDF sur une même ligne), supprimer le libellé rendait 5,50.
      const after = lines[i].slice(lm.index + lm[0].length);
      const numMatch = after.match(/(?<![\d,])-?(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+),\d{2,3}(?![\d])/);
      if (numMatch) return parseFr(numMatch[0]);
      // Fallback: look at next line
      if (!opts?.sameLineOnly && i + 1 < lines.length) {
        const nextMatch = lines[i + 1].match(/(?<![\d,])-?(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+),\d{2,3}(?![\d])/);
        if (nextMatch) return parseFr(nextMatch[0]);
      }
    }
  }
  return 0;
}

/**
 * Entier après un libellé (« Nbre factures/tickets ventes 35 annulations 0 » → 35,
 * « Couverts 0 » → 0) : les compteurs n'ont pas de décimales.
 */
function findIntAfterLabel(lines: string[], labelRe: RegExp): number {
  for (const line of lines) {
    const lm = line.match(labelRe);
    if (!lm || lm.index == null) continue;
    const after = line.slice(lm.index + lm[0].length);
    const m = after.match(/-?\d[\d\s ]*/);
    if (m) {
      const n = parseInt(m[0].replace(/[\s ]/g, ""), 10);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

/**
 * Extract all French-formatted numbers from a string.
 * Matches patterns like "1 234,56" or "-12,34" or "0,00".
 */
function extractNumbers(s: string): number[] {
  // Un nombre = milliers optionnels (espace) + virgule + 2 ou 3 décimales, pris d'un bloc :
  // les quantités Kezia ont 3 décimales (« 105,797 ») et coupaient le montant suivant.
  const matches = s.match(/(?<![\d,])-?(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+),\d{2,3}(?![\d])/g);
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

export function parseKeziaSynthese(textBrut: string): KeziaDaily {
  // Le PDF Kezia sort ses milliers avec un « † » (U+2020) ou une espace
  // insécable : « 1†056,62 » — sans ce nettoyage, 1 056,62 devenait 56,62.
  // Le chiffre avant le s\u00e9parateur ne doit pas appartenir \u00e0 une d\u00e9cimale :
  // \u00ab 105,797 823,34 \u00bb (quantit\u00e9 \u00e0 3 d\u00e9cimales puis montant) reste en deux nombres.
  const text = textBrut.replace(/(?<![,.]\d*)(\d)[\u2020\u00a0\u202f ](?=\d{3}(?:[,.]|\b))/g, "$1");
  const lines = text.split("\n").map((l) => l.trim());

  // ---- Date ----
  // « DEBUT = JJ/MM/AAAA » et « FIN = JJ/MM/AAAA » : la journée est la date
  // DEBUT. Si FIN diffère, c'est le récapitulatif mensuel (à refuser en amont).
  let debutRaw = "", finRaw = "";
  for (const line of lines) {
    const d = line.match(/DEBUT\s*=\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (d && !debutRaw) debutRaw = d[1];
    const f = line.match(/FIN\s*=\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (f && !finRaw) finRaw = f[1];
    if (debutRaw && finRaw) break;
  }
  const dateRaw = debutRaw || finRaw;
  const dateIso = frDateToIso(dateRaw);
  const dateDebut = debutRaw ? frDateToIso(debutRaw) : "";
  const dateFin = finRaw ? frDateToIso(finRaw) : "";

  // ---- Payments ----
  // Lignes « ESPECES 110,70 Eur 0,00 Eur 7 » : montant net, dont remboursement, quantité
  const reglements: Record<string, KeziaReglement> = {};
  const modeRe = /^(ESP[EÈ]CES|CH[EÈ]QUES?|CARTES?|VIREMENTS?|CONECS|CREDIT|REGUL|BON\s+ACHAT)\b(.*)$/i;
  for (const line of lines) {
    const m = line.match(modeRe);
    if (!m) continue;
    const nums = extractNumbers(m[2]);
    if (nums.length === 0) continue; // « VIREMENT Réguls et BA » : titre de colonne, pas de valeur
    const qteM = m[2].match(/(-?\d+)\s*$/);
    const qte = qteM ? parseInt(qteM[1], 10) : 0;
    const montant = nums[0];
    const remboursement = nums.length >= 2 ? nums[1] : 0;
    if (montant === 0 && qte === 0 && remboursement === 0) continue;
    const mode = m[1].toUpperCase().replace(/È/g, "E").replace(/\s+/g, " ")
      .replace(/^CHEQUE$/, "CHEQUES").replace(/^CARTE$/, "CARTES").replace(/^VIREMENTS$/, "VIREMENT");
    reglements[mode] = { montant, qte, ...(remboursement !== 0 ? { remboursement } : {}) };
  }
  const especes = reglements.ESPECES?.montant ?? findPayment(lines, /ESP[EÈ]CES/i);
  const cartes = reglements.CARTES?.montant ?? findPayment(lines, /CARTES?/i);
  const cheques = reglements.CHEQUES?.montant ?? findPayment(lines, /CH[EÈ]QUES?/i);
  const virements = reglements.VIREMENT?.montant ?? findPayment(lines, /VIREMENTS?/i);

  // ---- Key figures ----
  const caTtc = findValueAfterLabel(lines, /Total\s+Global\s+R[eé]glements/i);
  const tickets = findIntAfterLabel(lines, /Nbre\s+factures?\s*\/?\s*tickets?\s+ventes?/i);
  const couverts = findIntAfterLabel(lines, /^\s*Couverts\b(?!\s+Moy)/i);
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
          taux: rate,
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
    if (/Rayon\b/i.test(line) && /Qt[eéèÈÉ]/i.test(line) && /CA\s*(HT|TTC)/i.test(line)) {
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
    const nameMatch = line.match(/^([A-Za-zÀ-ÿ\s&.'’\/-]+?)\s+(-?\d[\d\s ]*[,.]?\d*)/);
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
      qty: Math.round(nums[0] * 1000) / 1000, // Kezia imprime 3 décimales (« 59,194 » : poids traiteur)
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
    date_debut: dateDebut,
    date_fin: dateFin,
    reglements,
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
