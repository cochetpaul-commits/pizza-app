/*
 * LMDW (La Maison du Whisky) — old-style parser for importEngine
 *
 * Format: CODE  QTY  PU_NET  TOTAL  ...middle...  VOL(0,XXX)  TVA(01|02)  [CSS]  NAME
 * Prefers "Annexe Détaillée" page (net prices after discount)
 */

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
  supplier: "LMDW";
  invoice_number: string | null;
  invoice_date: string | null;
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
  // Facture N°: 10-digit number before a date
  const invMatch = text.match(/(\d{10})\s+\d{2}\/\d{2}\/\d{2}/);
  // Date: DD/MM/YY after facture number
  const dateMatch = text.match(/\d{10}\s+(\d{2})\/(\d{2})\/(\d{2,4})/);
  // Amounts: "1 383,19 EUR 1 154,76 228,43" → TTC EUR HT TVA
  const amountMatch = text.match(/([\d\s]+,\d{2})\s+EUR\s+([\d\s]+,\d{2})\s+([\d\s]+,\d{2})/);

  let invoice_date: string | null = null;
  if (dateMatch) {
    const y = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3];
    invoice_date = `${dateMatch[1]}/${dateMatch[2]}/${y}`;
  }

  return {
    invoice_number: invMatch?.[1] ?? null,
    invoice_date,
    total_ht: amountMatch ? parseFrenchNumber(amountMatch[2].replace(/\s/g, "")) : null,
    total_ttc: amountMatch ? parseFrenchNumber(amountMatch[1].replace(/\s/g, "")) : null,
  };
}

// Product regex: CODE  QTY  PU  TOTAL  ...middle...  VOL(0,XXX)  TVA(01|02)  [CSS]  NAME
const RE_PRODUCT =
  /(\d{3,5}[A-Z]?)\s+(\d+)\s+(\d+,\d{2})\s+(\d+,\d{2})[\d,.\sC]+?(0,\d{3})\s+(0[12])\s+(?:\d,\d{2}\s+)?([A-Z][A-Za-zÀ-ÿ'][A-Za-zÀ-ÿ'\s!.,()\d/-]+?)(?=\s+\d{3,5}[A-Z]?\s+\d|\s*$)/g;

function parseLines(text: string): ParsedLine[] {
  // Prefer "Annexe Détaillée" page (net prices)
  const pages = text.split("\n");
  let parseText = text;
  for (const page of pages) {
    if (page.includes("Annexe") && page.includes("taill")) {
      parseText = page;
      break;
    }
  }

  const seen = new Set<string>();
  const result: ParsedLine[] = [];

  RE_PRODUCT.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = RE_PRODUCT.exec(parseText)) !== null) {
    const code = m[1];
    const qty = parseInt(m[2]);
    const unitPrice = parseFrenchNumber(m[3]);
    const total = parseFrenchNumber(m[4]);
    const volume = parseFrenchNumber(m[5]);
    const tvaCode = m[6];
    const name = m[7].trim();

    if (seen.has(code)) continue;
    seen.add(code);

    if (!name || unitPrice == null) continue;

    result.push({
      sku: code,
      name,
      quantity: qty,
      unit: "pc",
      unit_price: unitPrice,
      total_price: total,
      tax_rate: tvaCode === "02" ? 5.5 : 20.0,
      notes: null,
      piece_weight_g: null,
      piece_volume_ml: volume != null ? Math.round(volume * 1000) : null,
    });
  }

  return result;
}

export function parseLmdwInvoiceText(text: string): ParsedInvoice {
  const meta = extractMeta(text);
  const lines = parseLines(text);

  return {
    supplier: "LMDW",
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    lines,
    raw_text_preview: text.slice(0, 2000),
  };
}
