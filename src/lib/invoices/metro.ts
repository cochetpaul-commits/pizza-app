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
  supplier: "METRO";
  invoice_number: string | null;
  invoice_date: string | null; // "DD/MM/YYYY"
  total_ht: number | null;
  total_ttc: number | null;
  lines: ParsedLine[];
  raw_text_preview: string;
};

function toText(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function parseFrenchNumber(s: string): number | null {
  const t = toText(s).trim();
  if (!t) return null;
  const cleaned = t
    .replace(/\s+/g, "")
    .replace(/[€]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}



function extractWeightGFromName(name: string): number | null {
  // ex: "1 kg", "1,5 kg", "500 g", "2 x 500 g", "10 x 100 g x 2"
  const kgMatch = name.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  if (kgMatch) {
    const kg = parseFrenchNumber(kgMatch[1]);
    if (kg != null) return Math.round(kg * 1000);
  }
  const gMatch = name.match(/(\d+(?:[.,]\d+)?)\s*g\b/i);
  if (gMatch) {
    const g = parseFrenchNumber(gMatch[1]);
    if (g != null) return Math.round(g);
  }
  return null;
}

function extractMeta(text: string): Pick<ParsedInvoice, "invoice_number" | "invoice_date" | "total_ht" | "total_ttc"> {
  const invoiceMatch = text.match(/N[\xb0\xba]\s*FACTURE\s+([0-9\/()A-Z]+)/i);
  const dateMatch = text.match(/Date\s+facture\s*:\s*(\d{2}-\d{2}-\d{4})/i);
  const htMatch = text.match(/Total\s+H\.?T\.?\s*[: ]+([0-9][0-9\s.,]*)/i);
  const ttcMatch = text.match(/Total\s+[\u00e0a]\s+payer\s+([0-9][0-9\s.,]*)/i);
  return {
    invoice_number: invoiceMatch?.[1]?.trim() ?? null,
    invoice_date: dateMatch?.[1] ?? null,
    total_ht: htMatch ? parseFrenchNumber(htMatch[1]) : null,
    total_ttc: ttcMatch ? parseFrenchNumber(ttcMatch[1]) : null,
  };
}


function parseLines(text: string): ParsedLine[] {
  const rows = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const tmp: ParsedLine[] = [];
  const taxMap: Record<string, number> = { A: 2.1, B: 5.5, D: 20.0 };

  for (const r of rows) {
    const lineMatch = r.match(/^\d{8,13}\s+(\d{7})\s+(.+?)\s+([\d,]+)\s+(\d+)\s+\d+\s+([\d,]+)\s+([ABD])\b/i);
    if (!lineMatch) {
      const vapMatch = r.match(/^\d{8,13}\s+(\d{7})\s+(.+?)\s+([\d,]+)\s+([\d,]+)\s+(\d+)\s+\d+\s+([\d,]+)\s+([ABD])\b/i);
      if (vapMatch) {
        tmp.push({ sku: vapMatch[1], name: vapMatch[2].trim(), quantity: parseFrenchNumber(vapMatch[5]), unit: "kg", unit_price: parseFrenchNumber(vapMatch[4]), total_price: parseFrenchNumber(vapMatch[6]), tax_rate: taxMap[vapMatch[7].toUpperCase()] ?? null, notes: "VAP=" + vapMatch[3], piece_weight_g: null });
      }
      continue;
    }
    const name = lineMatch[2].trim();
    let unit = "pc";
    if (/\b\d+(?:[.,]\d+)?\s*kg\b/i.test(name)) unit = "kg";
    else if (/\b\d+(?:[.,]\d+)?\s*(?:cl|ml|l)\b/i.test(name)) unit = "l";
    tmp.push({ sku: lineMatch[1], name, quantity: parseFrenchNumber(lineMatch[4]), unit: unit as "pc" | "kg" | "l" | null, unit_price: parseFrenchNumber(lineMatch[3]), total_price: parseFrenchNumber(lineMatch[5]), tax_rate: taxMap[lineMatch[6].toUpperCase()] ?? null, notes: null, piece_weight_g: unit === "pc" ? extractWeightGFromName(name) : null });
  }

  const seen = new Set();
  const out = [];
  for (const l of tmp) {
    const key = [l.sku ?? "", l.name, l.quantity ?? "", l.unit ?? "", l.unit_price ?? "", l.total_price ?? ""].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

export function parseMetroInvoiceText(text: string): ParsedInvoice {
  const meta = extractMeta(text);
  const lines = parseLines(text);

  return {
    supplier: "METRO",
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    lines,
    raw_text_preview: text.slice(0, 2000),
  };
}