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
  // New format: "Facture n°A01-F-2025-00924"
  // Old format: "Facture N° 2500000157 du 05/09/2025"
  const invMatch = text.match(/Facture\s+[Nn]°?\s*([\w-]+)/i);
  const invoice_number = invMatch ? invMatch[1].trim() : null;

  // New format: "Date d'émission : 02/10/2025"
  // Old format: "Facture N° 2500000157 du 05/09/2025"
  const dateMatch = text.match(/Date\s+d.émission\s*:\s*(\d{2}\/\d{2}\/\d{4})/i)
    ?? text.match(/Facture\s+N°\s*[\w-]+\s+du\s+(\d{2}\/\d{2}\/\d{4})/i);
  const invoice_date = dateMatch ? dateMatch[1] : null;

  // New format: "Montant total HT 165.26€"
  // Old format: "Total H.T. 110,46 €" or "Net H.T. 110,46 €"
  const htMatch = text.match(/Montant\s+[Tt]otal\s+H\.?T\.?\s+([\d.,]+)\s*€/i)
    ?? text.match(/(?:Total|Net)\s+H\.T\.\s+([\d.,\s]+)\s*€/i);
  const total_ht = htMatch ? parseFloat(htMatch[1].replace(/\s/g, "").replace(",", ".")) : null;

  // New format: "Montant total TTC 191.15€"
  // Old format: "Total T.T.C. 132,55 €"
  const ttcMatch = text.match(/Montant\s+[Tt]otal\s+TTC\s+([\d.,]+)\s*€/i)
    ?? text.match(/Total\s+T\.T\.C\.\s+([\d.,\s]+)\s*€/i);
  const total_ttc = ttcMatch ? parseFloat(ttcMatch[1].replace(/\s/g, "").replace(",", ".")) : null;

  return { invoice_number, invoice_date, total_ht, total_ttc };
}

function toUnit(raw: string): "pc" | "kg" | "l" | null {
  const s = raw.toLowerCase();
  if (s === "pièce" || s === "piece" || s === "pcs") return "pc";
  if (s === "kg" || s === "kilogramme") return "kg";
  if (s === "l" || s === "litre") return "l";
  return "pc"; // fallback for unknown units
}

/** Detect which format: "new" (Winopos) or "old" (classic) */
function detectFormat(text: string): "new" | "old" {
  if (/^Nom\s+Quantité/m.test(text)) return "new";
  if (/Désignations\s+Quantité/i.test(text)) return "old";
  if (/P\.u\.\s*HT/i.test(text)) return "old";
  return "new";
}

/** New format (Winopos): "Nom | Quantité | Unité | Prix unitaire HT | TVA | Montant total TTC" */
function parseLinesNew(text: string): ParsedLine[] {
  const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  const HEADER_RE = /^Nom\s+Quantité/;
  const DATA_RE = /^(\d+(?:[,.]\d+)?)\s+(\S+)\s+([\d.]+)€\s+(\d+(?:[.,]\d+)?)%\s+([\d.]+)€$/;
  const END_RE = /^Montant\s+[Tt]otal\s+TTC\s+[\d.]+€/i;

  let inProducts = false;
  const result: ParsedLine[] = [];
  let nameLines: string[] = [];

  for (const row of rows) {
    if (!inProducts) { if (HEADER_RE.test(row)) inProducts = true; continue; }
    if (END_RE.test(row)) break;
    const m = DATA_RE.exec(row);
    if (m) {
      const qty = parseFloat(m[1].replace(",", "."));
      const unitPrice = parseFloat(m[3]);
      const name = nameLines.join(" - ").trim();
      if (name) {
        result.push({ sku: null, name, quantity: qty, unit: toUnit(m[2]), unit_price: unitPrice, total_price: Math.round(unitPrice * qty * 100) / 100, tax_rate: parseInt(m[4], 10), notes: null, piece_weight_g: null, piece_volume_ml: null });
      }
      nameLines = [];
    } else { nameLines.push(row); }
  }
  return result;
}

/** Old format (classic): "Désignations | Quantité | P.u. HT | Montant HT | Tva" */
function parseLinesOld(text: string): ParsedLine[] {
  const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  // Match lines like: "NUAGE GIN 70CL 2,00 17,55 € 35,10 € V5"
  // Or: "BERTO APERITIVO 1L 1,00 15,60 € 15,60 € V5"
  const LINE_RE = /^(.+?)\s+(\d+[,.]\d+)\s+([\d.,\s]+)\s*€\s+([\d.,\s]+)\s*€\s+(V\d+)$/;
  const END_RE = /^Total\s*:/i;

  // Find where product lines start (after "Désignations" header or "Tva" header)
  let started = false;
  const result: ParsedLine[] = [];

  for (const row of rows) {
    if (/Désignations\s+Quantité/i.test(row) || /Montant HT\s+Tva/i.test(row)) { started = true; continue; }
    if (!started) continue;
    if (END_RE.test(row)) break;

    const m = LINE_RE.exec(row);
    if (m) {
      const name = m[1].trim();
      const qty = parseFloat(m[2].replace(",", "."));
      const unitPrice = parseFloat(m[3].replace(/\s/g, "").replace(",", "."));
      const totalPrice = parseFloat(m[4].replace(/\s/g, "").replace(",", "."));
      // V5 = 20%, V1 = 5.5%
      const taxCode = m[5];
      const taxRate = taxCode === "V5" ? 20 : taxCode === "V1" ? 5.5 : 20;

      result.push({ sku: null, name, quantity: qty, unit: "pc", unit_price: unitPrice, total_price: totalPrice, tax_rate: taxRate, notes: null, piece_weight_g: null, piece_volume_ml: null });
    }
  }
  return result;
}

function parseLines(text: string): ParsedLine[] {
  const fmt = detectFormat(text);
  return fmt === "old" ? parseLinesOld(text) : parseLinesNew(text);
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
