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
  supplier: "ARMOR";
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
  const invMatch = text.match(/Référence\s+(FA\d+)/);
  const invoice_number = invMatch ? invMatch[1] : null;

  const dateMatch = text.match(/Date:\s*(\d{2}\/\d{2}\/\d{4})/);
  const invoice_date = dateMatch ? dateMatch[1] : null;

  const htMatch = text.match(/Total HT\s*:\s*([\d,]+)/);
  const total_ht = htMatch ? parseFrenchNumber(htMatch[1]) : null;

  const ttcMatch = text.match(/Total TTC[^:]*:\s*([\d,]+)/);
  const total_ttc = ttcMatch ? parseFrenchNumber(ttcMatch[1]) : null;

  return { invoice_number, invoice_date, total_ht, total_ttc };
}

const SECTION_START_RE = /Référence\s+Libellé\s+Qté/;
const SECTION_END_RE = /^Taxes\s+Base/;
const SKIP_RE =
  /^Type de commande|^SO N°|^Référence\s+(?:Libellé|FA)|^Date:|^Code client|^Devise:|ARMOR EMBALLAGES|^501 Route|^\d{5} CAUDAN|^Téléphone|^Facturé|^Pour contacter|^Si vous|^N° réf\.|^LCR|Suite…|^Page \d|N° de TVA intracom|^www\.|FRATELLI|^57 RUE|^35400|^France$|^Expédié/i;

// Code-only line: 5+ leading letters, no spaces, no hyphens, has digits
const CODE_ONLY_RE = /^[A-Z]{5,}[A-Z0-9+X]*\d+[A-Z0-9+X]*$/;
const HAS_DIGITS_RE = /\d/;

function parseLines(text: string): ParsedLine[] {
  const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);

  let inSection = false;
  const sectionRows: string[] = [];
  for (const row of rows) {
    if (!inSection) {
      if (SECTION_START_RE.test(row)) inSection = true;
      continue;
    }
    if (SECTION_END_RE.test(row)) break;
    if (SKIP_RE.test(row)) continue;
    sectionRows.push(row);
  }

  const result: ParsedLine[] = [];
  let pendingCode: string | null = null;

  for (const row of sectionRows) {
    const hasPiece = row.includes("PIECE");
    const hasKg = row.includes(" KG ") || row.endsWith(" KG") || row.endsWith(" KG 0,00");

    if (hasPiece || hasKg) {
      const tokens = row.split(/\s+/);
      const unitIdx = tokens.findIndex((t) => t === "PIECE" || t === "KG");
      if (unitIdx < 2) {
        pendingCode = null;
        continue;
      }

      const qtyStr = tokens[unitIdx - 1];
      const unit: "pc" | "kg" = tokens[unitIdx] === "KG" ? "kg" : "pc";
      const afterUnit = tokens.slice(unitIdx + 1);

      let code: string;
      let nameTokens: string[];

      if (!HAS_DIGITS_RE.test(tokens[0]) && pendingCode) {
        // tokens[0] has no digits → code came from previous line
        code = pendingCode;
        nameTokens = tokens.slice(0, unitIdx - 1);
      } else {
        code = tokens[0];
        nameTokens = tokens.slice(1, unitIdx - 1);
      }
      pendingCode = null;

      const name = nameTokens.join(" ").trim();
      const qty = parseFrenchNumber(qtyStr.replace(",", "."));

      // Parse pricing: CODE NAME QTY UNIT PRIX REM% PUNET MONTANT
      let puNet: number | null = null;
      let total: number | null = null;
      if (afterUnit.length >= 4 && afterUnit[1]?.includes("%")) {
        puNet = parseFrenchNumber(afterUnit[2]);
        total = parseFrenchNumber(afterUnit[3]);
      } else if (afterUnit.length === 1) {
        total = parseFrenchNumber(afterUnit[0]) || null;
      }

      result.push({
        sku: code || null,
        name,
        quantity: qty,
        unit,
        unit_price: puNet,
        total_price: total,
        tax_rate: 20,
        notes: null,
        piece_weight_g: null,
        piece_volume_ml: null,
      });
    } else if (CODE_ONLY_RE.test(row)) {
      pendingCode = row;
    }
    // Name continuation lines or junk → ignore (pending code stays until consumed)
  }

  return result;
}

export function parseArmorInvoiceText(text: string): ParsedInvoice {
  const meta = extractMeta(text);
  const lines = parseLines(text);

  return {
    supplier: "ARMOR",
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    lines,
    raw_text_preview: text.slice(0, 2000),
  };
}
