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
  //        droits  march.  serv.   total_ht  total_tva
  const totalMatch = text.match(
    /^TOTAL\s+[\d,]+\s+[\d,]+\s+[\d,]+\s+([\d,]+)\s+([\d,]+)/m
  );
  let total_ht: number | null = null;
  let total_ttc: number | null = null;
  if (totalMatch) {
    const ht = parseFrenchNumber(totalMatch[1]);
    const tva = parseFrenchNumber(totalMatch[2]);
    if (ht != null) total_ht = ht;
    if (ht != null && tva != null) total_ttc = Math.round((ht + tva) * 100) / 100;
  }

  return { invoice_number, invoice_date, total_ht, total_ttc };
}

// Each product line ends with: QTY PU A[24] MONTANT 8 XXXXXX XXXXXX
// The greedy .* forces QTY to be the RIGHTMOST integer before the tail
const TAIL_RE = /(.*)\s(\d+)\s+([\d,]+)\s+(A[24])\s+([\d,]+)\s+8\s+\d{6}\s+\d{6}$/;

function parseLines(text: string): ParsedLine[] {
  const rows = text.split(/\r?\n/);

  // Product entries are between "BL N°..." and "LME du ..."
  const SECTION_START_RE = /^BL\s+N°/;
  const SECTION_END_RE = /^LME\s+du/i;
  // Each entry starts with: CODE 01NAME...
  const PROD_START_RE = /^(\d{4,6})\s+01(.*)$/;

  const entries: Array<{ sku: string; lines: string[] }> = [];
  let currentEntry: { sku: string; lines: string[] } | null = null;
  let inProducts = false;

  for (const row of rows) {
    const trimmed = row.trim();

    if (!inProducts) {
      if (SECTION_START_RE.test(trimmed)) inProducts = true;
      continue;
    }

    if (SECTION_END_RE.test(trimmed)) {
      if (currentEntry) entries.push(currentEntry);
      currentEntry = null;
      break;
    }

    const m = PROD_START_RE.exec(trimmed);
    if (m) {
      if (currentEntry) entries.push(currentEntry);
      currentEntry = { sku: m[1], lines: [m[2].trim()] };
    } else if (currentEntry && trimmed) {
      currentEntry.lines.push(trimmed);
    }
  }

  if (currentEntry) entries.push(currentEntry);

  const result: ParsedLine[] = [];

  for (const entry of entries) {
    const fullText = entry.lines.join(" ").trim();
    const tail = TAIL_RE.exec(fullText);
    if (!tail) continue;

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
    const name = tokens.join(" ").trim();
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
