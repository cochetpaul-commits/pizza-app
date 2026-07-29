// Parser pour les factures SNAK Srl (fournisseur thés italiens)
// Format : facture italienne, lignes multi-lignes avec code produit
// Lignes type :
//   CR44
//   BOX ENERGY HERBAL TEA x100 COTTON TEA BAGS x 2,5 g. NON
//   PREFERENTIAL ITALY ORIGIN NR 2,00 42,500 85,00 E41

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
  supplier: "SNAK";
  invoice_number: string | null;
  invoice_date: string | null;
  total_ht: number | null;
  total_ttc: number | null;
  lines: ParsedLine[];
  raw_text_preview: string;
};

function parseFrenchNumber(s: string): number | null {
  const cleaned = s
    .replace(/\s+/g, "")
    .replace(/[€]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "") // remove thousand separator dots
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseItalianNumber(s: string): number | null {
  // Italian: 42,500 means 42.5 — comma is decimal separator
  // But 1.221,25 means 1221.25 — dot is thousand separator
  const cleaned = s
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3})/g, "") // remove thousand separator dots
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseSnakInvoiceText(text: string): ParsedInvoice {
  // ── Meta ──
  // Factura Nr. 7639 del 11/12/2025
  const invoiceMatch = text.match(/Fattura\s+Nr\.?\s*(\d+)\s+del\s+(\d{2}\/\d{2}\/\d{4})/i);
  const invoice_number = invoiceMatch?.[1] ?? null;
  const invoice_date = invoiceMatch?.[2] ?? null;

  // TOTALE FATTURA € 1.221,25
  const totalMatch = text.match(/TOTALE\s+FATTURA\s*€?\s*([\d.,]+)/i);
  const total_ht = totalMatch ? parseItalianNumber(totalMatch[1]) : null;
  // Intra-communautaire → TTC = HT (TVA 0%)
  const total_ttc = total_ht;

  // ── Lines ──
  const rows = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const lines: ParsedLine[] = [];

  // Pattern: description line ends with NR <qty> <price> <total> <tax_code>
  // e.g. "PREFERENTIAL ITALY ORIGIN NR 2,00 42,500 85,00 E41"
  const dataRe = /NR\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+\w+\s*$/;

  // Skip patterns
  const skipRe = /^(SNAK\s+Srl|via\s+|Cascine|50023|tel\s|fax\s|P\.IVA|CCIAA|Reg\.Soc|Capitale|Spett|SARL|F\s*A\s*T\s*T\s*U\s*R\s*A|BELLO|3\s+Place|35400|FRANCIA|Condizione|IBAN|Rif\.\s|Codice\s+cliente|30\.01\.|Codice\s+Descrizione|Totale\s+Importi|C\.I\.\s+Imponibile|E41|TOTALE|Tot\.|Scadenza|CONDIZIONI|\.\.\.|\.\s*$)/i;

  let currentCode = "";
  let currentDesc = "";

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (skipRe.test(row)) continue;

    // Check if this line has data (ends with NR qty price total code)
    const dm = row.match(dataRe);
    if (dm) {
      // Extract description part (before NR)
      const descPart = row.replace(dataRe, "").trim();
      if (descPart) {
        currentDesc = currentDesc ? currentDesc + " " + descPart : descPart;
      }

      const qty = parseItalianNumber(dm[1]);
      const unitPrice = parseItalianNumber(dm[2]);
      const totalPrice = parseItalianNumber(dm[3]);

      // Clean up the name
      const name = currentDesc
        .replace(/\s+/g, " ")
        .replace(/^[\s.]+|[\s.]+$/g, "")
        .trim();

      // Skip shipping costs line
      if (name.toUpperCase().includes("SHIPMENT") || name.toUpperCase().includes("SPESE")) {
        currentCode = "";
        currentDesc = "";
        continue;
      }

      lines.push({
        sku: currentCode || null,
        name: name || "?",
        quantity: qty,
        unit: "pc",
        unit_price: unitPrice,
        total_price: totalPrice,
        tax_rate: 0, // intra-communautaire
        notes: null,
        piece_weight_g: null,
        piece_volume_ml: null,
      });

      currentCode = "";
      currentDesc = "";
    } else {
      // Check if line starts with a product code (e.g. "CR44", "FT1", "J346/BIO")
      const codeLineMatch = row.match(/^([A-Z][A-Z0-9/]{1,10})\s+(.+)$/);
      const codeOnlyMatch = row.match(/^([A-Z][A-Z0-9/]{1,10})$/);
      if (codeOnlyMatch) {
        currentCode = codeOnlyMatch[1];
        currentDesc = "";
      } else if (codeLineMatch && !currentCode) {
        // Code + start of description on same line
        currentCode = codeLineMatch[1];
        currentDesc = codeLineMatch[2];
      } else {
        // Continuation of description
        currentDesc = currentDesc ? currentDesc + " " + row : row;
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const uniqueLines: ParsedLine[] = [];
  for (const l of lines) {
    const key = `${l.sku}|${l.name}|${l.total_price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueLines.push(l);
  }

  return {
    supplier: "SNAK",
    invoice_number,
    invoice_date,
    total_ht,
    total_ttc,
    lines: uniqueLines,
    raw_text_preview: text.substring(0, 500),
  };
}
