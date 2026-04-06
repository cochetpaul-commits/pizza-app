type ParsedLine = {
  sku: string | null;
  name: string;
  quantity: number | null;
  unit: "pc" | "kg" | "l" | null;
  unit_price: number | null;
  total_price: number | null;
  tax_rate: number | null;
  notes: string | null;
  piece_weight_g: number | null;
  piece_volume_ml: number | null;
};

export type ParsedInvoice = {
  supplier: "CARNIATO";
  invoice_number: string | null;
  invoice_date: string | null; // "DD/MM/YYYY"
  total_ht: number | null;
  total_ttc: number | null;
  lines: ParsedLine[];
  raw_text_preview: string;
};

function parseFrenchNumber(s: string): number | null {
  const cleaned = s.trim().replace(/\s+/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractMeta(
  text: string
): Pick<ParsedInvoice, "invoice_number" | "invoice_date" | "total_ht" | "total_ttc"> {
  // Invoice number + date: "200937598 29667 11.02.2026 ..."
  const pieceMatch = text.match(/\b(\d{8,10})\s+\d{4,6}\s+(\d{2})\.(\d{2})\.(\d{4})\b/);
  const invoice_number = pieceMatch ? pieceMatch[1] : null;
  const invoice_date = pieceMatch
    ? `${pieceMatch[2]}/${pieceMatch[3]}/${pieceMatch[4]}`
    : null;

  // Total HT + TVA from VENTILATION summary line:
  // "TOTAL 12,70 1537,10 1537,10 1549,80 160,35"
  // or "14 ATTESTATION FACTURE TOTAL 10,64 1385,33 1385,33 1395,97 220,27 ..."
  const totalMatch = text.match(
    /TOTAL\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/
  );
  let total_ht: number | null = null;
  let total_ttc: number | null = null;
  if (totalMatch) {
    const ht = parseFrenchNumber(totalMatch[4]);
    const tva = parseFrenchNumber(totalMatch[5]);
    if (ht != null) total_ht = ht;
    if (ht != null && tva != null) total_ttc = Math.round((ht + tva) * 100) / 100;
  }

  return { invoice_number, invoice_date, total_ht, total_ttc };
}

// Product line tail: QTY PU A[24] MONTANT 8 EAN_DIGITS...
// EAN can be 8 or 13 digits, split with spaces: "8 002172 8" or "8 002010 680458"
const TAIL_RE = /(.*)\s(\d+)\s+([\d,]+)\s+(A[24])\s+([\d,]+)\s+8\s+\d{3,6}(?:\s+\d{1,6})?$/;

// Lines that are clearly not product continuations (page headers, footers, noise)
const NOISE_RE = /^(CONDITIONS|VOIR|VENTILATION|DROITS|MARCHANDISES|ATTESTATION|TOTAL|NB\.|VOL\.|VIGNETTE|RETARDS|AVIS|RECOMMANDATIONS|EXPEDITEUR|FACTURE|SIRET|COMMENTAIRES|NBRE|CODE\s+PR|CART\.|REMISES|RUM|IBAN|^\d{5}\s+SAINT|BONNEUIL|RUNGIS|^\*{3}|^-{3}|^N[°º]|^BL\s+N|REGLEMENT|HORS\s+TAXE|T\.V\.A|T\.T\.C|Société|BELLO|PICCOLA|FRATELLI|PLACE|FRANCE|SAINT\s+MALO|facture@|TVA\s*:|ACCISES|DOCUMENT\s+SIMP|COMMERCIAL|CONTROLE|Siège|Tel\s*:|Fax|E-mail|capital|R\.C\.S|Entrepôt|internet|LME\s+du)/i;

function parseLines(text: string): ParsedLine[] {
  const rows = text.split(/\r?\n/);

  // Product entries are between "BL N°..." and end of products
  const SECTION_START_RE = /^BL\s+N°/;
  const SECTION_END_RE = /^(LME\s+du|VOIR\s+CONDITIONS)/i;
  // Each entry starts with: CODE 01NAME...
  const PROD_START_RE = /^(\d{4,6})\s+01(.*)$/;

  const entries: Array<{ sku: string; lines: string[] }> = [];
  let currentEntry: { sku: string; lines: string[] } | null = null;
  let inProducts = false;
  let sectionCount = 0;

  for (const row of rows) {
    const trimmed = row.trim();

    if (!inProducts) {
      if (SECTION_START_RE.test(trimmed)) {
        inProducts = true;
        sectionCount++;
      }
      continue;
    }

    // End of a product section
    if (SECTION_END_RE.test(trimmed)) {
      if (currentEntry) entries.push(currentEntry);
      currentEntry = null;
      inProducts = false; // allow finding the next section (page 2)
      continue;
    }

    const m = PROD_START_RE.exec(trimmed);
    if (m) {
      if (currentEntry) entries.push(currentEntry);
      currentEntry = { sku: m[1], lines: [m[2].trim()] };
    } else if (currentEntry && trimmed) {
      // Real continuations are short name parts immediately after: "DOC 0,75", "SICILIA"
      // Stop collecting as soon as we see anything that isn't a short name part
      const isNamePart = trimmed.length < 25 && /[A-Za-z]/.test(trimmed) && !NOISE_RE.test(trimmed) && currentEntry.lines.length <= 2;
      if (isNamePart) {
        currentEntry.lines.push(trimmed);
      } else {
        // Not a continuation — finalize entry and stop collecting
        entries.push(currentEntry);
        currentEntry = null;
      }
    }
  }

  if (currentEntry) entries.push(currentEntry);

  const result: ParsedLine[] = [];

  for (const entry of entries) {
    // Strategy: try TAIL_RE on the first line alone first (handles multi-line
    // entries where continuation text like "DOC 0,75" comes AFTER the EAN).
    // If that fails, join all lines and try again.
    let tail = TAIL_RE.exec(entry.lines[0]);
    let nameSuffix = "";
    if (tail) {
      // Continuation lines are just name parts (e.g., "DOC 0,75", "0,75L", "SICILIA")
      // Only keep short ones that look like real name parts, not page footer noise
      if (entry.lines.length > 1) {
        const parts = entry.lines.slice(1)
          .filter((l) => l.length < 30 && !NOISE_RE.test(l));
        if (parts.length > 0) nameSuffix = " " + parts.join(" ").trim();
      }
    } else {
      // Try joined text
      const fullText = entry.lines.join(" ").trim();
      tail = TAIL_RE.exec(fullText);
      if (!tail) continue;
    }

    const prefix = tail[1]; // name + leading numeric noise
    const qty = parseInt(tail[2], 10);
    const pu = parseFrenchNumber(tail[3]);
    const tvaCode = tail[4]; // "A2" or "A4"
    const montant = parseFrenchNumber(tail[5]);
    const taxRate = tvaCode === "A2" ? 20.0 : 5.5;

    // Strip trailing pure-numeric tokens (e.g., NBRE, PAR, PRIX, VOL, ALC columns)
    const tokens = prefix.split(/\s+/);
    while (tokens.length > 0) {
      const last = tokens[tokens.length - 1];
      if (/^[\d,]+$/.test(last)) {
        tokens.pop();
      } else {
        break;
      }
    }
    let name = tokens.join(" ").trim();
    // Append continuation suffix (e.g., "DOC 0,75") to name
    if (nameSuffix) {
      // Clean suffix: remove pure numeric parts that are not volume/weight info
      const cleanSuffix = nameSuffix.trim();
      if (cleanSuffix && !/^\d+$/.test(cleanSuffix)) {
        name += " " + cleanSuffix;
      }
    }
    name = name.replace(/\s+/g, " ").trim();
    if (!name) continue;

    result.push({
      sku: entry.sku,
      name,
      quantity: qty,
      unit: "pc",
      unit_price: pu,
      total_price: montant,
      tax_rate: taxRate,
      notes: null,
      piece_weight_g: null,
      piece_volume_ml: null,
    });
  }

  return result;
}

export function parseCarniatoInvoiceText(text: string): ParsedInvoice {
  const meta = extractMeta(text);
  const lines = parseLines(text);

  return {
    supplier: "CARNIATO",
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    lines,
    raw_text_preview: text.slice(0, 2000),
  };
}
