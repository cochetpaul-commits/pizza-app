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
  supplier: "ELIEN";
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

function extractMeta(text: string) {
  const invMatch = text.match(/Facture\s+N[°º]?\s*([A-Z]?\d{4,})/i);

  const dateMatch = text.match(/Date\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  let invoice_date: string | null = null;
  if (dateMatch) invoice_date = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;

  const htMatch = text.match(/Total\s+HT\s+([\d\s.,]+)/i);
  const total_ht = htMatch ? parseFrenchNumber(htMatch[1]) : null;

  const ttcMatch =
    text.match(/Total\s+TTC\s+([\d\s.,]+)/i) ??
    text.match(/Net\s+[àa]\s+payer\s+([\d\s.,]+)/i);
  const total_ttc = ttcMatch ? parseFrenchNumber(ttcMatch[1]) : null;

  return { invoice_number: invMatch?.[1] ?? null, invoice_date, total_ht, total_ttc };
}

// DESCRIPTION  QTY  PU  MONTANT  TVA
const LINE_RE = /^(.+?)\s+([\d]+[.,]\d+)\s+([\d]+[.,]\d+)\s+([\d]+[.,]\d+)\s+([\d]+[.,]\d+)\s*$/;

function parseLines(text: string): ParsedLine[] {
  const result: ParsedLine[] = [];
  const seen = new Set<string>();

  for (const row of text.split(/\r?\n/)) {
    const trimmed = row.trim();
    if (!trimmed) continue;
    if (/^(Transformé|Récapitulatif|Date d|Escompte|En cas de|Coordonn|Banque|IBAN|BIC|Total|Net |Description|Qté|Mode de|Rue de|SAS au)/i.test(trimmed)) continue;
    if (/^\d{2}\/\d{2}\/\d{4}\s+LCR/i.test(trimmed)) continue;
    if (/^(BELLO|SASHA|PLACE|ST MALO|35400|Facture|Date\s*:)/i.test(trimmed)) continue;

    const m = LINE_RE.exec(trimmed);
    if (!m) continue;

    const name = m[1].trim().replace(/^\*\s*/, "").replace(/\s+/g, " ");
    const qty = parseFrenchNumber(m[2]);
    const pu = parseFrenchNumber(m[3]);
    const montant = parseFrenchNumber(m[4]);
    const tva = parseFrenchNumber(m[5]);

    if (!name || pu == null) continue;

    const key = `${name}|${pu}|${qty}|${montant}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Volume from name: "4.5 L VANILLE"
    const volMatch = name.match(/^(\d+(?:[.,]\d+)?)\s*L\s+/i);
    const volumeMl = volMatch ? parseFloat(volMatch[1].replace(",", ".")) * 1000 : null;

    result.push({
      sku: null,
      name,
      quantity: qty,
      unit: volumeMl ? "l" : "pc",
      unit_price: pu,
      total_price: montant,
      tax_rate: tva,
      notes: null,
      piece_weight_g: null,
      piece_volume_ml: volumeMl,
    });
  }

  return result;
}

export function parseElienInvoiceText(text: string): ParsedInvoice {
  const meta = extractMeta(text);
  const lines = parseLines(text);

  return {
    supplier: "ELIEN",
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    lines,
    raw_text_preview: text.slice(0, 2000),
  };
}
