/*
 * Cozigou invoice parser
 *
 * Format Cozigou — beverage distributor (Dinan)
 * pdfjs-dist produces columnar output (one long string per page).
 *
 * Column order in extracted text:
 *   NAMES → cas/fut → CODES(5-digit) → col/pack → PRICES(3dec)
 *   → TVA(1|2) → VOLUMES(cl) → consignment → accise → TOTALS(2dec)
 *   → address → NAME CONTINUATIONS → duplicated prices → DUPLICATA → ...
 *
 * Spacing heuristic:
 *   - 3+ spaces between words WITHIN same product name
 *   - 1 space BETWEEN different products/tokens
 *
 * Products: all beverages (beer, wine, spirits, sirops, coffee)
 * TVA: 1 = 5.5% (non-alcohol), 2 = 20% (alcohol)
 * Volumes: CONT. UNITE column in cl (100, 75, 70, 25)
 * Skip: consignment lines (code 500xxx), REPRISE DE VIDE
 */

import type { ParsedIngredient, ParseResult, ParseLog } from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function detectEtablissement(text: string): string | null {
  const upper = text.toUpperCase();
  if (upper.includes("SASHA") || upper.includes("BELLO MIO")) return "bello_mio";
  if (upper.includes("I FRATELLI") || upper.includes("IFRATELLI") || upper.includes("PICCOLA MIA")) return "piccola_mia";
  return null;
}

function extractMeta(text: string) {
  // Invoice number: 10-13 digit number (e.g., 6030100036)
  const numMatch = text.match(/\b(\d{10,13})\b/);
  // Date: DD/MM/YYYY (4-digit year)
  const dateMatch = text.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
  // Cozigou totals on page 2: "532.56   100.34 632.90 30.00 -30.00  662.90 632.90"
  // Pattern: HT  TVA_TOTAL  TTC  CONSIGNE  ...  NET_A_PAYER
  // HT + TVA: "XXX.XX   YYY.YY ZZZ.ZZ" where ZZZ = XXX + YYY
  const totalsMatch = text.match(/(\d{3,}\.\d{2})\s+(\d{2,}\.\d{2})\s+(\d{3,}\.\d{2})/);
  let total_ht: number | null = null;
  let total_ttc: number | null = null;
  if (totalsMatch) {
    const ht = parseFloat(totalsMatch[1]);
    const tva = parseFloat(totalsMatch[2]);
    const ttc = parseFloat(totalsMatch[3]);
    // Verify: HT + TVA ≈ TTC
    if (Math.abs(ht + tva - ttc) < 1) {
      total_ht = ht;
      total_ttc = ttc;
    }
  }

  return {
    invoice_number: numMatch?.[1] ?? null,
    invoice_date: dateMatch?.[1] ?? null,
    total_ht,
    total_ttc,
  };
}

// Split text into "name tokens" using the spacing heuristic:
// 3+ spaces = within same name, 1 space = between names
function splitBySpacing(text: string): string[] {
  const placeholder = "\x00";
  const withPlaceholder = text.replace(/\s{3,}/g, placeholder);
  return withPlaceholder
    .split(" ")
    .map((s) => s.replace(/\x00/g, " ").trim())
    .filter(Boolean);
}

// Check if a token looks like a product name (contains letters)
function isNameToken(s: string): boolean {
  return /[A-Za-zÀ-ÿ°]/.test(s) && s.length > 1;
}

// ── Parse a single page ─────────────────────────────────────────────────────

type PageData = {
  codes: string[];
  names: string[];
  colPack: number[];
  prices: number[];
  tvaValues: number[];
  volumes: number[];
  totals: number[];
  continuations: string[];
};

function parsePage(pageText: string): PageData | null {
  const tokens = pageText.split(/\s+/).filter(Boolean);

  // 1. Find codes block: consecutive 5-digit numbers (minimum 3)
  let codeStart = -1;
  let codeEnd = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (/^\d{5}$/.test(tokens[i])) {
      let run = 0;
      while (i + run < tokens.length && /^\d{5}$/.test(tokens[i + run])) run++;
      if (run >= 3) {
        codeStart = i;
        codeEnd = i + run;
        break;
      }
    }
  }
  if (codeStart === -1) return null;

  const codes = tokens.slice(codeStart, codeEnd);
  const N = codes.length;

  // 2. Parse numeric columns after codes
  let idx = codeEnd;

  // Col/pack: N integers
  const colPack: number[] = [];
  while (idx < tokens.length && colPack.length < N) {
    if (/^\d{1,3}$/.test(tokens[idx])) {
      colPack.push(parseInt(tokens[idx], 10));
      idx++;
    } else break;
  }

  // Unit prices: N numbers with 3 decimal places
  const prices: number[] = [];
  while (idx < tokens.length && prices.length < N) {
    if (/^\d+\.\d{3}$/.test(tokens[idx])) {
      prices.push(parseFloat(tokens[idx]));
      idx++;
    } else break;
  }

  // TVA codes: N digits (1 or 2)
  const tvaValues: number[] = [];
  while (idx < tokens.length && tvaValues.length < N) {
    if (/^[12]$/.test(tokens[idx])) {
      tvaValues.push(parseInt(tokens[idx], 10));
      idx++;
    } else break;
  }

  // Volumes (cl): N integers (typically 25, 70, 75, 100)
  const volumes: number[] = [];
  while (idx < tokens.length && volumes.length < N) {
    if (/^\d{2,3}$/.test(tokens[idx])) {
      const v = parseInt(tokens[idx], 10);
      if (v >= 10 && v <= 200) {
        volumes.push(v);
        idx++;
      } else break;
    } else break;
  }

  // Totals: skip consignment/accise, collect 2-decimal numbers
  const twoDecNumbers: number[] = [];
  while (idx < tokens.length) {
    const t = tokens[idx];
    if (/^\d+\.\d{2}$/.test(t)) {
      twoDecNumbers.push(parseFloat(t));
      idx++;
    } else if (/^\d+\.\d{3}$/.test(t)) {
      idx++; // skip accise (3 decimals)
    } else if (/^[A-Z]{2,}/.test(t)) {
      break; // hit address block
    } else {
      idx++;
    }
  }
  // Last N values are the line totals
  const totals = twoDecNumbers.slice(-N);

  // 3. Extract names using spacing heuristic
  // Find the raw text position of the codes block
  const firstCode = codes[0];
  // Find the codes in the raw text (search after "Marie-Claude" or page marker)
  const mcIdx = pageText.indexOf("Marie-Claude");
  const searchFrom = mcIdx >= 0 ? mcIdx : 0;
  const codesPosInText = pageText.indexOf(firstCode, searchFrom + 10);

  let names: string[] = [];
  if (codesPosInText > 0) {
    let nameSection = pageText.slice(searchFrom > 0 ? searchFrom + 14 : 0, codesPosInText);
    // Remove trailing cas/fut digits (single digits separated by spaces)
    nameSection = nameSection.replace(/[\s\d]+$/, "").trim();
    // Split by spacing heuristic
    const parts = splitBySpacing(nameSection);
    // Filter: keep only name-like tokens, take last N
    const nameParts = parts.filter(isNameToken);
    names = nameParts.slice(-N);
  }

  // 4. Name continuations (second lines of multi-line product names)
  // Found after the address block, before phone number / duplicated prices
  let continuations: string[] = [];
  // Look for the command number (6-digit after address)
  const cmdMatch = pageText.match(/SAINT-MALO\s+\d+\s+\d+\s+(\d{6})\s+([\s\S]*?)(?:\d{2}\s+\d{2}\s+\d{2}\s+\d{2}\s+\d{2})/);
  if (cmdMatch) {
    const contText = cmdMatch[2];
    const contParts = splitBySpacing(contText);
    continuations = contParts.filter(isNameToken);
  }

  return { codes, names, colPack, prices, tvaValues, volumes, totals, continuations };
}

// ── Main parser ─────────────────────────────────────────────────────────────

export function parseCozigou(text: string, etablissement: string): ParseResult {
  const meta = extractMeta(text);
  const detectedEtab = detectEtablissement(text);
  const etab = etablissement || detectedEtab || "bello_mio";

  const pages = text.split("\n");
  const ingredients: ParsedIngredient[] = [];
  const logs: ParseLog[] = [];

  for (let p = 0; p < pages.length; p++) {
    const pageData = parsePage(pages[p]);
    if (!pageData || pageData.codes.length === 0) continue;

    const { codes, names, colPack, prices, tvaValues, volumes, totals, continuations } = pageData;
    const N = codes.length;

    // Merge continuations with base names
    // Continuations are for products with multi-line names, in order
    // Match by index: continuation i goes to the i-th product that has one
    // Heuristic: append continuations to names that look incomplete
    // (end with preposition, or continuation starts with matching context)
    // Simple approach: try to append each continuation to the matching name
    let contIdx = 0;
    const mergedNames = names.map((name) => {
      if (contIdx < continuations.length) {
        const lastWord = name.split(/\s+/).pop() || "";
        if (/^(DE|DI|ET|DU|AU|BLONDE|RIBE|DOC|VENEZIE)$/i.test(lastWord)) {
          const cont = continuations[contIdx];
          contIdx++;
          return name + " " + cont;
        }
      }
      return name;
    });

    for (let i = 0; i < N; i++) {
      const code = codes[i];
      const name = mergedNames[i] || names[i] || `ARTICLE ${code}`;

      // Skip consignment lines (code 500xxx or similar)
      if (/^5\d{4,}$/.test(code)) {
        logs.push({ line_number: i + 1, raw: `${code} ${name}`, rule: "cozigou_consignment", result: "skipped" });
        continue;
      }

      const col = colPack[i] ?? 1;
      const price = prices[i] ?? 0;
      const tva = tvaValues[i] ?? null;
      const volumeCl = volumes[i] ?? null;
      const total = totals[i] ?? 0;

      // Confidence check
      let confidence: "high" | "medium" | "low" = "high";
      if (!names[i] || names[i].startsWith("ARTICLE")) confidence = "low";
      else if (price === 0 || total === 0) confidence = "low";
      else {
        // Verify: col × price ≈ total (with possible accise adjustment)
        const expected = col * price;
        if (Math.abs(expected - total) > total * 0.15) confidence = "medium";
      }

      ingredients.push({
        name: name.replace(/\s+/g, " ").trim(),
        reference: code,
        unit_recette: volumeCl ? "cl" : "pcs",
        unit_commande: col > 1 ? "colis" : "pcs",
        colisage: col > 1 ? col : undefined,
        volume_unitaire: volumeCl ?? undefined,
        prix_unitaire: price,
        prix_commande: total,
        categorie: "boissons",
        fournisseur_slug: "cozigou",
        etablissement_id: etab,
        raw_line: `${code} ${col}x ${name} @${price} = ${total}€`,
        confidence,
      });

      logs.push({
        line_number: i + 1,
        raw: `${code} ${name}`,
        rule: "cozigou_product",
        result: "ok",
        detail: `${col}x @${price}€ ${volumeCl ?? "?"}cl = ${total}€ TVA${tva}`,
      });
    }
  }

  return {
    fournisseur: "cozigou",
    etablissement: etab,
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    ingredients,
    logs,
  };
}
