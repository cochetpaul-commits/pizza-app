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
  supplier: "SDPF";
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
  // Invoice number: "Facture N° FA067191"
  const invMatch = text.match(/Facture\s+N[°º]?\s*([A-Z]{2}\d{5,})/i);

  // Date: "le, 13/03/26" or "13/03/2026"
  const dateMatch =
    text.match(/le,?\s+(\d{2})\/(\d{2})\/(\d{2,4})/i) ??
    text.match(/(\d{2})\/(\d{2})\/(\d{2,4})\s/);
  let invoice_date: string | null = null;
  if (dateMatch) {
    const year = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3];
    invoice_date = `${dateMatch[1]}/${dateMatch[2]}/${year}`;
  }

  // Total HT: "TOTAL 444,90 24,47"
  const totalLineMatch = text.match(/\bTOTAL\s+([\d\s.,]+?)\s+([\d\s.,]+?)(?:\s|$)/m);
  const total_ht = totalLineMatch ? parseFrenchNumber(totalLineMatch[1]) : null;

  // Total TTC: "NET A PAYER" or "469,37 LCR"
  const ttcMatch =
    text.match(/NET\s+A\s+PAYER\s+([\d\s.,]+)/i) ??
    text.match(/Total\s+TTC\s+([\d\s.,]+)/i);
  let total_ttc: number | null = null;
  if (ttcMatch) {
    total_ttc = parseFrenchNumber(ttcMatch[1]);
  }
  // Fallback: compute from HT + TVA
  if (total_ttc == null && total_ht != null && totalLineMatch) {
    const tva = parseFrenchNumber(totalLineMatch[2]);
    if (tva != null) total_ttc = Math.round((total_ht + tva) * 100) / 100;
  }

  return { invoice_number: invMatch?.[1] ?? null, invoice_date, total_ht, total_ttc };
}

// Line regex: REF NAME UNIT TIxxxxxx du DD/MM/YY QTY PU [REMISE] MONTANT_HT
const LINE_RE =
  /(\d{6,15})\s+(.+?)\s+(KG|PCE?|PCS|L|CL|ML|BT|LOT|PIECE|UNITE?)\s+TI\d+\s+du\s+\d{2}\/\d{2}\/\d{2,4}\s+([\d.,]+)\s+([\d.,]+)\s+(?:([\d.,]+)\s+)?([\d.,]+)/gi;

const LINE_ALT_RE =
  /(\d{6,15})\s+(.+?)\s+(KG|PCE?|PCS|L|CL|ML|BT|LOT|PIECE|UNITE?)\s+([\d.,]+)\s+([\d.,]+)\s+(?:([\d.,]+)\s+)?([\d.,]+)/gi;

function parseLines(text: string): ParsedLine[] {
  const result: ParsedLine[] = [];
  const seen = new Set<string>();

  function unitMap(raw: string): "kg" | "l" | "pc" {
    const u = raw.toUpperCase();
    if (u === "KG") return "kg";
    if (u === "L" || u === "CL" || u === "ML" || u === "LIT") return "l";
    return "pc";
  }

  function extractTaxRate(text: string): number | null {
    // Look for TVA rate in the TVA summary: "V05 444,90 5,5% 24,47" or "V20 ... 20% ..."
    const m = text.match(/(\d+[.,]?\d*)\s*%/);
    return m ? parseFrenchNumber(m[1]) : null;
  }

  const defaultTaxRate = extractTaxRate(text);

  LINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = LINE_RE.exec(text)) !== null) {
    const sku = m[1];
    const name = m[2].trim().replace(/\s+/g, " ");
    const rawUnit = m[3];
    const qty = parseFrenchNumber(m[4]);
    const pu = parseFrenchNumber(m[5]);
    const montant = parseFrenchNumber(m[7]);

    const key = `${sku}|${name}|${qty}|${pu}`;
    if (seen.has(key)) continue;
    seen.add(key);

    result.push({
      sku,
      name,
      quantity: qty,
      unit: unitMap(rawUnit),
      unit_price: pu,
      total_price: montant,
      tax_rate: defaultTaxRate,
      notes: null,
      piece_weight_g: null,
      piece_volume_ml: null,
    });
  }

  // Fallback
  if (result.length === 0) {
    LINE_ALT_RE.lastIndex = 0;
    while ((m = LINE_ALT_RE.exec(text)) !== null) {
      const sku = m[1];
      const name = m[2].trim().replace(/\s+/g, " ");
      const rawUnit = m[3];
      const qty = parseFrenchNumber(m[4]);
      const pu = parseFrenchNumber(m[5]);
      const montant = parseFrenchNumber(m[7]);

      const key = `${sku}|${name}|${qty}|${pu}`;
      if (seen.has(key)) continue;
      seen.add(key);

      result.push({
        sku,
        name,
        quantity: qty,
        unit: unitMap(rawUnit),
        unit_price: pu,
        total_price: montant,
        tax_rate: defaultTaxRate,
        notes: null,
        piece_weight_g: null,
        piece_volume_ml: null,
      });
    }
  }

  return result;
}

export function parseSdpfInvoiceText(text: string): ParsedInvoice {
  const meta = extractMeta(text);
  const lines = parseLines(text);

  return {
    supplier: "SDPF",
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    lines,
    raw_text_preview: text.slice(0, 2000),
  };
}
