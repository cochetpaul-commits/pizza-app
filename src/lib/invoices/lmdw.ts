/*
 * LMDW (La Maison du Whisky) invoice parser
 *
 * Format (pdfToText output):
 *   CODE  NAME  QTY  VOL  DEG  [C]  PRIX_VENTE  [DROITS]  [CSS]  PU_HT  TOTAL_HT  TVA
 *
 * Example lines:
 *   4476 QUAGLIA Ciliegia 12 0,700 25,00 C 14,50 3,32 1,07 18,89 226,68 01
 *   66279 JNPR n°2 6 0,700 C 21,23 21,23 127,38 02
 *
 * Invoice number: "Facture N° : 1851324" (7 digits)
 * Date: "Date : 11/02/25"
 * Total HT: "Total H.T. : 1 143,28" or in amount block
 * Total TTC: "Total TTC : 1 354,21"
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

function parseFr(s: string): number | null {
  const cleaned = s.trim().replace(/\s+/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractMeta(text: string): Pick<ParsedInvoice, "invoice_number" | "invoice_date" | "total_ht" | "total_ttc"> {
  // Facture N° : 1851324
  const invMatch = text.match(/Facture\s*N[°º]\s*:\s*(\d{5,10})/i);

  // Date : 11/02/25
  const dateMatch = text.match(/Date\s*:\s*(\d{2})\/(\d{2})\/(\d{2,4})/);
  let invoice_date: string | null = null;
  if (dateMatch) {
    const y = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3];
    invoice_date = `${dateMatch[1]}/${dateMatch[2]}/${y}`;
  }

  // Total H.T. : 1 143,28
  const htMatch = text.match(/Total\s*H\.?T\.?\s*:?\s*([\d\s]+,\d{2})/i);
  // Total TTC : 1 354,21
  const ttcMatch = text.match(/Total\s*TTC\s*:?\s*([\d\s]+,\d{2})/i);

  return {
    invoice_number: invMatch?.[1] ?? null,
    invoice_date,
    total_ht: htMatch ? parseFr(htMatch[1]) : null,
    total_ttc: ttcMatch ? parseFr(ttcMatch[1]) : null,
  };
}

function parseLines(text: string): ParsedLine[] {
  // Prefer "Annexe Détaillée" section (net prices after discount)
  const annexeIdx = text.indexOf("Annexe");
  const parseText = annexeIdx >= 0 ? text.slice(annexeIdx) : text;

  const rows = parseText.split("\n").map(l => l.trim()).filter(Boolean);
  const result: ParsedLine[] = [];
  const seen = new Set<string>();

  // Skip headers/footers
  const SKIP = /^(Code art|Désignation|Total|Montant|Remise|Base|Merci|HSBC|IBAN|Agent|Réf|Page|Adresse|Client|Facture|Date|Mode|Cond|Vos|SOCIETE|S\.A\.S|DIRECTION|Tél|E-mail|UE|SIRET|ACCISES|EUR|BL M3|N° cmde|SARL|Liv |57 |35400|FRANCE|escompte|Les éventuels)/i;

  // Product line regex:
  // CODE(3-6 digits) NAME QTY VOL(0,xxx) [DEG] [C] PRICES... PU_HT TOTAL_HT TVA(01|02)
  //
  // Strategy: look for lines starting with a 3-6 digit code and ending with 01 or 02 (TVA)
  const RE_LINE = /^(\d{3,6})\s+(.+?)\s+(\d{1,3})\s+(0,\d{3})\s+(.+?)\s+([\d\s]+,\d{2})\s+(0[12])\s*$/;

  for (const row of rows) {
    if (SKIP.test(row)) continue;
    if (row.length < 20) continue;

    const m = RE_LINE.exec(row);
    if (!m) continue;

    const code = m[1];
    if (seen.has(code)) continue;
    seen.add(code);

    const name = m[2].trim();
    const qty = parseInt(m[3]);
    const vol = parseFr(m[4]);
    const totalHt = parseFr(m[6]);
    const tvaCode = m[7];

    // Extract PU_HT: second-to-last comma-decimal number in the middle section
    const middlePart = m[5];
    const allDecimals = middlePart.match(/\d+,\d{2}/g) ?? [];
    // Last decimal in middle is PU_HT (the one before totalHt)
    const puHt = allDecimals.length > 0 ? parseFr(allDecimals[allDecimals.length - 1]) : null;

    if (!name || totalHt == null) continue;

    result.push({
      sku: code,
      name,
      quantity: qty,
      unit: "pc",
      unit_price: puHt ?? (qty > 0 && totalHt ? Math.round((totalHt / qty) * 100) / 100 : null),
      total_price: totalHt,
      tax_rate: tvaCode === "02" ? 5.5 : 20.0,
      notes: null,
      piece_weight_g: null,
      piece_volume_ml: vol != null ? Math.round(vol * 1000) : null,
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
