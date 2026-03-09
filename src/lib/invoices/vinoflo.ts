import { extractVolumeFromName } from "./utils";

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
  supplier: "VINOFLO";
  invoice_number: string | null;
  invoice_date: string | null;
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
    .replace(/[€æê]/g, "")
    .replace(/[''`]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractMeta(text: string): Pick<ParsedInvoice, "invoice_number" | "invoice_date" | "total_ht" | "total_ttc"> {
  const invoiceMatch = text.match(/N[°º'\u00b0"]\s*de\s*facture\s*[i:\s]+([0-9]+)/i);
  const dateMatch = text.match(/Date\s*[i:\s]+(\d{2})[t\/](\d{2})[t\/](\d{4})/i);
  const htMatch = text.match(/Sous[-\s]?total\s+([\d\s.,]+)/i);
  const ttcMatch = text.match(/(?:Total|lolal)\s+'?([0-9][\d\s.,]+)/i);
  let invoice_date: string | null = null;
  if (dateMatch) invoice_date = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
  return {
    invoice_number: invoiceMatch?.[1]?.trim() ?? null,
    invoice_date,
    total_ht: htMatch ? parseFrenchNumber(htMatch[1]) : null,
    total_ttc: ttcMatch ? parseFrenchNumber(ttcMatch[1]) : null,
  };
}

function isAlcoholTax(name: string): boolean {
  return /droits?\s+sur\s+alcool/i.test(name);
}

function cleanOcrSku(s: string): string {
  return s.replace(/I/g, "9").replace(/l/g, "1").replace(/O/g, "0").trim();
}

function cleanOcrPrice(s: string): string {
  return s
    .replace(/[€æê]/g, "")
    .replace(/[''`]/g, "")
    .replace(/I/g, "9")
    .replace(/\./g, "")
    .trim();
}

function parseLines(text: string): ParsedLine[] {
  const rows = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const tmp: ParsedLine[] = [];

  for (const r of rows) {
    // Pattern normal: qty  sku  name  price  total
    // Gère aussi le cas où qty+sku sont collés ex: "628" = qty:6 sku:28
    const m = r.match(/^\s*(\d{1,4})\s+([0-9IilO]{1,5})\s{2,}(.+?)\s{2,}([I0-9][\d\s,.']*[€æê]?)\s{2,}(['0-9][\d\s,.']*[€æê]?\.?)\s*$/);

    if (!m) {
      // Cas collé: "628   Barolo..."  => qty=6, sku=28
      const mCollé = r.match(/^\s*(\d)(\d{2})\s{3,}(.+?)\s{2,}([I0-9][\d\s,.']*[€æê]?)\s{2,}(['0-9][\d\s,.']*[€æê]?\.?)\s*$/);
      if (mCollé) {
        const name = mCollé[3].replace(/\s+/g, " ").trim();
        if (name.toLowerCase().includes("description") || name.toLowerCase().includes("prix")) continue;
        tmp.push({
          sku: mCollé[2],
          name,
          quantity: parseFrenchNumber(mCollé[1]),
          unit: "pc",
          unit_price: parseFrenchNumber(cleanOcrPrice(mCollé[4])),
          total_price: parseFrenchNumber(cleanOcrPrice(mCollé[5])),
          tax_rate: 20,
          notes: isAlcoholTax(name) ? "taxe_alcool" : null,
          piece_weight_g: null,
          piece_volume_ml: extractVolumeFromName(name),
        });
      }
      continue;
    }

    const name = m[3].replace(/\s+/g, " ").trim();
    if (name.toLowerCase().includes("description") || name.toLowerCase().includes("prix")) continue;
    if (/^[-*T]+$/.test(name)) continue;

    const rawSku = cleanOcrSku(m[2]);
    const qty = parseFrenchNumber(m[1]);
    const unit_price = parseFrenchNumber(cleanOcrPrice(m[4]));
    const total_price = parseFrenchNumber(cleanOcrPrice(m[5]));

    tmp.push({
      sku: rawSku || null,
      name,
      quantity: qty,
      unit: "pc",
      unit_price,
      total_price,
      tax_rate: 20,
      notes: isAlcoholTax(name) ? "taxe_alcool" : null,
      piece_weight_g: null,
      piece_volume_ml: extractVolumeFromName(name),
    });
  }

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

export function parseVinofloInvoiceText(text: string): ParsedInvoice {
  const meta = extractMeta(text);
  const lines = parseLines(text);
  return {
    supplier: "VINOFLO",
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    lines,
    raw_text_preview: text.slice(0, 2000),
  };
}
