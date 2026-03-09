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
  supplier: "BAR SPIRITS";
  invoice_number: string | null;
  invoice_date: string | null; // "DD/MM/YYYY"
  total_ht: number | null;
  total_ttc: number | null;
  lines: ParsedLine[];
  raw_text_preview: string;
};

function extractMeta(
  text: string
): Pick<ParsedInvoice, "invoice_number" | "invoice_date" | "total_ht" | "total_ttc"> {
  // "Facture n°A01-F-2025-00924"
  const invMatch = text.match(/Facture\s+n°([\w-]+)/i);
  const invoice_number = invMatch ? invMatch[1] : null;

  // "Date d'émission : 02/10/2025"
  const dateMatch = text.match(/Date\s+d.émission\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const invoice_date = dateMatch ? dateMatch[1] : null;

  // "Montant Total HT 46.90€"
  const htMatch = text.match(/Montant\s+Total\s+HT\s+([\d.]+)€/i);
  const total_ht = htMatch ? parseFloat(htMatch[1]) : null;

  // "Montant Total TTC 56.28€" (the one followed by a number, not the table header)
  const ttcMatch = text.match(/Montant\s+Total\s+TTC\s+([\d.]+)€/i);
  const total_ttc = ttcMatch ? parseFloat(ttcMatch[1]) : null;

  return { invoice_number, invoice_date, total_ht, total_ttc };
}

function toUnit(raw: string): "pc" | "kg" | "l" | null {
  const s = raw.toLowerCase();
  if (s === "pièce" || s === "piece" || s === "pcs") return "pc";
  if (s === "kg" || s === "kilogramme") return "kg";
  if (s === "l" || s === "litre") return "l";
  return "pc"; // fallback for unknown units
}

function parseLines(text: string): ParsedLine[] {
  const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);

  // Products sit between the column header and the summary total line
  const HEADER_RE = /^Nom\s+Quantité/;
  // Data line: "1 Pièce 29.00€ 20% 34.80€"
  const DATA_RE = /^(\d+(?:[,.]\d+)?)\s+(\S+)\s+([\d.]+)€\s+(\d+)%\s+([\d.]+)€$/;
  // End of product section
  const END_RE = /^Montant\s+Total\s+TTC\s+[\d.]+€/i;

  let inProducts = false;
  const result: ParsedLine[] = [];
  let nameLines: string[] = [];

  for (const row of rows) {
    if (!inProducts) {
      if (HEADER_RE.test(row)) inProducts = true;
      continue;
    }
    if (END_RE.test(row)) break;

    const m = DATA_RE.exec(row);
    if (m) {
      const qty = parseFloat(m[1].replace(",", "."));
      const unitRaw = m[2];
      const unitPrice = parseFloat(m[3]);
      const taxRate = parseInt(m[4], 10);

      const unit = toUnit(unitRaw);
      const name = nameLines.join(" - ").trim();

      if (name) {
        result.push({
          sku: null,
          name,
          quantity: qty,
          unit,
          unit_price: unitPrice,
          total_price: Math.round(unitPrice * qty * 100) / 100,
          tax_rate: taxRate,
          notes: null,
          piece_weight_g: null,
          piece_volume_ml: null,
        });
      }
      nameLines = [];
    } else {
      nameLines.push(row);
    }
  }

  return result;
}

export function parseBarSpiritsInvoiceText(text: string): ParsedInvoice {
  const meta = extractMeta(text);
  const lines = parseLines(text);

  return {
    supplier: "BAR SPIRITS",
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    lines,
    raw_text_preview: text.slice(0, 2000),
  };
}
