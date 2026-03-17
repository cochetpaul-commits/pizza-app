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
  supplier: "SUM";
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
  // "FA2600056 09/01/26"
  const invMatch = text.match(/\b(FA\d+)\s+(\d{2})\/(\d{2})\/(\d{2})\b/);
  const invoice_number = invMatch ? invMatch[1] : null;
  const invoice_date = invMatch
    ? `${invMatch[2]}/${invMatch[3]}/20${invMatch[4]}`
    : null;

  // "C2 1 300,69€ 5,5% 71,54€ 1 300,69€ 0,00€ 1 372,23€ 0,00€ 1 372,23€"
  // C2 BASE_HT€ TVA% TVA€ TOTAL_HT€ ESCOMPTE€ TOTAL_TTC€ ACOMPTE€ NET€
  const totalMatch = text.match(/\bC2\s+([\d ]+,\d{2})€.*?([\d ]+,\d{2})€\s+0,00€\s+([\d ]+,\d{2})€/);
  const total_ht = totalMatch ? parseFrenchNumber(totalMatch[1]) : null;
  const total_ttc = totalMatch ? parseFrenchNumber(totalMatch[3]) : null;

  return { invoice_number, invoice_date, total_ht, total_ttc };
}

// Alphanumeric product code: 2+ letters + 2+ digits + optional trailing letter
const CODE_RE = /^[A-Z]{2,}[A-Z0-9]*\d{2,}[A-Z]?$/;

// RUPTURE single-line: NAME CODE RUPTURE
const RUPTURE_1LINE_RE = /^(.*?)\s+([A-Z]{2,}[A-Z0-9]*\d{2,}[A-Z]?)\s+RUPTURE$/;
// RUPTURE two-line (first line): NAME CODE
const RUPTURE_CODE_TAIL_RE = /^(.*?)\s+([A-Z]{2,}[A-Z0-9]*\d{2,}[A-Z]?)$/;

function parseLines(text: string): ParsedLine[] {
  const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);

  // Header: "Référence Désignation Qté N° Lot PU HT Remise PU Net Mt HT"
  const SECTION_START_RE = /Désignation.*(?:PU|Mt)\s+HT/;
  const SECTION_END_RE = /^(?:Conformément à la loi|Port HT|Code\s+Base\s+Taux)/;
  const SKIP_RE = /^Exemplaire provisoire$|^Désignation/;

  // Collect section lines
  let inSection = false;
  const sectionRows: string[] = [];
  for (const row of rows) {
    if (!inSection) {
      if (SECTION_START_RE.test(row)) inSection = true;
      continue;
    }
    if (SECTION_END_RE.test(row)) { inSection = false; continue; }
    if (SKIP_RE.test(row)) continue;
    sectionRows.push(row);
  }

  const result: ParsedLine[] = [];
  let i = 0;

  while (i < sectionRows.length) {
    const row = sectionRows[i];

    // Skip bare "RUPTURE" lines (already consumed by lookahead below)
    if (row === "RUPTURE") { i++; continue; }

    // Two-line RUPTURE: current line ends with CODE, next line is "RUPTURE"
    if (
      i + 1 < sectionRows.length &&
      sectionRows[i + 1] === "RUPTURE" &&
      !row.includes("€")
    ) {
      const m = RUPTURE_CODE_TAIL_RE.exec(row);
      result.push({
        sku: m ? m[2] : null,
        name: m ? m[1].trim() : row,
        quantity: null,
        unit: null,
        unit_price: null,
        total_price: null,
        tax_rate: null,
        notes: "RUPTURE",
        piece_weight_g: null,
        piece_volume_ml: null,
      });
      i += 2;
      continue;
    }

    // Single-line RUPTURE: NAME CODE RUPTURE
    if (row.includes("RUPTURE") && !row.includes("€")) {
      const m = RUPTURE_1LINE_RE.exec(row);
      if (m) {
        result.push({
          sku: m[2],
          name: m[1].trim(),
          quantity: null,
          unit: null,
          unit_price: null,
          total_price: null,
          tax_rate: null,
          notes: "RUPTURE",
          piece_weight_g: extractWeightGFromName(m[1].trim()),
          piece_volume_ml: extractVolumeFromName(m[1].trim()),
        });
      }
      i++;
      continue;
    }

    // Normal product line: CODE NAME... QTY LOT PU_HT [REMISE] PU_NET TOTAL€
    if (row.includes("€")) {
      const tokens = row.split(/\s+/);
      const eurIdx = tokens.findIndex((t) => /^[\d,]+€$/.test(t));

      if (eurIdx >= 5 && CODE_RE.test(tokens[0])) {
        const code = tokens[0];
        const total = parseFrenchNumber(tokens[eurIdx].replace("€", ""));
        // PU Net is right before total
        const puNet = parseFrenchNumber(tokens[eurIdx - 1]);
        // PU HT is before PU Net
        const puHt = parseFrenchNumber(tokens[eurIdx - 2]);
        // LOT is before PU HT (non-numeric token like L251007, L304/25)
        // Walk backwards to find it
        let lotIdx = eurIdx - 3;
        // If there's a Remise value between PU HT and PU Net, adjust
        // Remise would be numeric — if tokens[eurIdx-2] is a lot code, shift
        if (puHt == null && lotIdx > 0) {
          // No remise, lot is at eurIdx-3
          lotIdx = eurIdx - 2;
        }
        // QTY is before LOT — find the comma-decimal number before the lot token
        let qtyIdx = lotIdx - 1;
        // Walk back to find the quantity (comma-decimal number)
        while (qtyIdx > 0 && parseFrenchNumber(tokens[qtyIdx]) == null) {
          qtyIdx--;
        }
        const qty = parseFrenchNumber(tokens[qtyIdx]);
        const name = tokens.slice(1, qtyIdx).join(" ").trim();
        const pu = puNet ?? puHt ?? 0;

        if (name && qty != null) {
          result.push({
            sku: code,
            name,
            quantity: qty,
            unit: "pc",
            unit_price: pu,
            total_price: total,
            tax_rate: 5.5,
            notes: null,
            piece_weight_g: extractWeightGFromName(name),
            piece_volume_ml: extractVolumeFromName(name),
          });
        }
      }
    }

    i++;
  }

  return result;
}

export function parseSumInvoiceText(text: string): ParsedInvoice {
  const meta = extractMeta(text);
  const lines = parseLines(text);

  return {
    supplier: "SUM",
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    lines,
    raw_text_preview: text.slice(0, 2000),
  };
}
