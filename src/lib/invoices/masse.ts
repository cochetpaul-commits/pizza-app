import { extractWeightGFromName, extractVolumeFromName } from "./utils";

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
  supplier: "MASSE";
  invoice_number: string | null;
  invoice_date: string | null;
  total_ht: number | null;
  total_ttc: number | null;
  lines: ParsedLine[];
  raw_text_preview: string;
};

function parseFrenchNumber(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const cleaned = t
    .replace(/\s+/g, "")
    .replace(/[€]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractMeta(text: string): Pick<ParsedInvoice, "invoice_number" | "invoice_date" | "total_ht" | "total_ttc"> {
  // pdfjs output: "09/03/2026 Date Client FACTURE 51518 BELLO MIO FACN012600857"
  // or "N° facture : FACN012600857" at the bottom
  const invMatch =
    text.match(/N[°º]?\s*facture\s*:\s*([A-Z0-9]+)/i) ??
    text.match(/FACTURE\s+\d+\s+[A-Z\s]+\s+([A-Z]{3,5}\d{6,})/i);

  // Date at the start: "09/03/2026 Date" or "Date 09/03/2026"
  const dateMatch =
    text.match(/(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})\s+Date\b/i) ??
    text.match(/Date\s+(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/i);

  // Total HT (last occurrence before TTC, with value > 100 typically)
  // "251,98 Total HT" or "Total HT 251,98"
  const htMatches = [...text.matchAll(/(\d[\d\s.,]+)\s+Total\s+HT|Total\s+HT\s+(\d[\d\s.,]+)/gi)];
  let totalHt: number | null = null;
  for (const m of htMatches) {
    const v = parseFrenchNumber(m[1] ?? m[2] ?? "");
    if (v != null && v > (totalHt ?? 0)) totalHt = v;
  }

  // TOTAL TTC en EURO 265,84
  const ttcMatch = text.match(/TOTAL\s+TTC\s+(?:en\s+EURO\s+)?(\d[\d\s.,]*)/i);

  let invoice_date: string | null = null;
  if (dateMatch) invoice_date = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;

  return {
    invoice_number: invMatch?.[1]?.trim() ?? null,
    invoice_date,
    total_ht: totalHt,
    total_ttc: ttcMatch ? parseFrenchNumber(ttcMatch[1]) : null,
  };
}

function parseLines(text: string): ParsedLine[] {
  const tmp: ParsedLine[] = [];

  // pdfjs-dist joins everything with spaces. Lines look like:
  // "VOLC006   7,3260 KGM   13,50   98,90   5,50 13,50 MAGRET CANARD IMPORT CONGELE"
  // Pattern: SKU  QTY UNIT  PRIX_BRUT  TOTAL_HT  TAXE PRIX_NET  NAME
  const lineRe =
    /([A-Z]{2,6}\d{2,6})\s+(\d+[.,]\d+)\s+(KGM?|KG|PCE?|PCS|UNI|LIT?|L)\s+(\d+[.,]\d+)\s+(\d+[.,]\d+)\s+(\d+[.,]\d+)\s+(\d+[.,]\d+)\s+([A-Z][A-Z\s/'.()-]+?)(?=\s+[A-Z]{2,6}\d{2,6}\s|\s+Base\s|\s*$)/gi;

  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text)) !== null) {
    const sku = m[1];
    const qty = parseFrenchNumber(m[2]);
    const rawUnit = m[3].toUpperCase();
    const priceNet = parseFrenchNumber(m[7]);
    const totalHt = parseFrenchNumber(m[5]);
    const taxRate = parseFrenchNumber(m[6]);
    const name = m[8].trim();

    let unit: "pc" | "kg" | "l" | null = null;
    if (rawUnit.startsWith("KG") || rawUnit === "KGM") unit = "kg";
    else if (rawUnit.startsWith("LIT") || rawUnit === "L") unit = "l";
    else unit = "pc";

    tmp.push({
      sku,
      name,
      quantity: qty,
      unit,
      unit_price: priceNet,
      total_price: totalHt,
      tax_rate: taxRate,
      notes: null,
      piece_weight_g: unit === "pc" ? extractWeightGFromName(name) : null,
      piece_volume_ml: unit === "pc" ? extractVolumeFromName(name) : null,
    });
  }

  // Deduplicate
  const seen = new Set<string>();
  const out: ParsedLine[] = [];
  for (const l of tmp) {
    const key = [l.sku ?? "", l.name, l.quantity ?? "", l.unit_price ?? "", l.total_price ?? ""].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

export function parseMasseInvoiceText(text: string): ParsedInvoice {
  const meta = extractMeta(text);
  const lines = parseLines(text);
  return {
    supplier: "MASSE",
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    lines,
    raw_text_preview: text.slice(0, 2000),
  };
}
