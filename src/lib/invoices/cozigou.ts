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
  supplier: "COZIGOU";
  invoice_number: string | null;
  invoice_date: string | null; // "DD/MM/YYYY"
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
  const cleaned = t.replace(/\s+/g, "").replace(/[€]/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractMeta(
  text: string
): Pick<ParsedInvoice, "invoice_number" | "invoice_date" | "total_ht" | "total_ttc"> {
  let invoice_number: string | null = null;
  let invoice_date: string | null = null;
  let total_ht: number | null = null;
  let total_ttc: number | null = null;

  // --- Invoice number ---
  // Tabular: "FACTURE/AVOIR N° 6030100036"
  const factureMatch = text.match(/FACTURE.*?N°\s*(\d{8,12})/);
  if (factureMatch) {
    invoice_number = factureMatch[1];
  } else {
    // Column format: code client 6 digits on previous line
    const blockMatch = text.match(/^\d{6}\s*\n\s*(\d{8,12})\s*\n/m);
    if (blockMatch) invoice_number = blockMatch[1];
    else {
      const fallback = text.match(/\b(\d{9,12})\b/);
      if (fallback) invoice_number = fallback[1];
    }
  }

  // --- Invoice date ---
  // Tabular: "DATE 02/03/26" (DD/MM/YY)
  const dateMarker = text.match(/\bDATE\s+(\d{2})\/(\d{2})\/(\d{2})\b/);
  if (dateMarker) {
    invoice_date = `${dateMarker[1]}/${dateMarker[2]}/20${dateMarker[3]}`;
  } else {
    // Column format fallback
    const blockDate = text.match(/^\d{6}\s*\n\s*\d{8,12}\s*\n\s*(\d{2})\/(\d{2})\/(\d{2})\b/m);
    if (blockDate) {
      invoice_date = `${blockDate[1]}/${blockDate[2]}/20${blockDate[3]}`;
    } else {
      const date4 = text.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
      if (date4) invoice_date = date4[1];
    }
  }

  // --- Totals ---
  // Tabular: "TOTAL TTC 632.90" and "TOTAL 532.56 ... NET A 632.90"
  const ttcMatch = text.match(/TOTAL\s+TTC\s+([\d.,]+)/);
  if (ttcMatch) total_ttc = parseFrenchNumber(ttcMatch[1]);

  const htMatch = text.match(/TOTAL\s+([\d.,]+)\s+[\d.,]+\s+[\d.,]+\s+NET\s+A/);
  if (htMatch) total_ht = parseFrenchNumber(htMatch[1]);

  // Column format fallback: HT + TVA on same line
  if (total_ht == null && total_ttc == null) {
    const htTvaMatch = text.match(/^(\d{2,}\.\d{2})[ \t]+(\d+\.\d{2})[ \t]*$/m);
    if (htTvaMatch) {
      const ht = parseFrenchNumber(htTvaMatch[1]);
      const tva = parseFrenchNumber(htTvaMatch[2]);
      if (ht != null) total_ht = ht;
      if (ht != null && tva != null) total_ttc = Math.round((ht + tva) * 100) / 100;
    }
  }

  return { invoice_number, invoice_date, total_ht, total_ttc };
}

/**
 * Parse tabular rows produced by pdfjs-dist (horizontal lines with all data).
 * Each product line starts with a 4-6 digit SKU code followed by quantities, name, and prices.
 * Price pattern: PU_HT (3 dec) + TVA code (1|2) + PU_NET (3 dec) + [ACCISE (3 dec)] + MONT_HT (2 dec)
 */
function parseLines(text: string): ParsedLine[] {
  const rows = text.split(/\r?\n/);
  const lines: ParsedLine[] = [];

  // Price block: PU_HT TVA PU_NET [ACCISE] MONT_HT
  const PRICE_RE = /(\d+\.\d{3})\s+([12])\s+(\d+\.\d{3})(?:\s+(\d+\.\d{3}))?\s+(\d+\.\d{2})/;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].trim();
    if (!row) continue;

    // Product line starts with 4-6 digit SKU
    const codeMatch = row.match(/^(\d{4,6})\s+(.+)/);
    if (!codeMatch) continue;

    const sku = codeMatch[1];
    const rest = codeMatch[2];

    // Must contain recognisable price data
    const pm = rest.match(PRICE_RE);
    if (!pm) continue;

    const unitPrice = parseFrenchNumber(pm[1]);
    const tvaCode = parseInt(pm[2], 10);
    const montHt = parseFrenchNumber(pm[5]);
    const tax_rate = tvaCode === 1 ? 5.5 : tvaCode === 2 ? 20.0 : null;

    // --- extract name & quantities from the part before the prices ---
    const priceIdx = rest.indexOf(pm[0]);
    const beforePrices = rest.slice(0, priceIdx).trim();

    // Leading integers: cas/fut then optional col/pack
    const qm = beforePrices.match(/^(\d+)(?:\s+(\d+))?\s+([\s\S]*)/);
    let qty = 1;
    let nameRaw = beforePrices;

    if (qm) {
      const cas = parseInt(qm[1], 10);
      const colPack = qm[2] ? parseInt(qm[2], 10) : null;
      qty = colPack ?? cas;
      nameRaw = qm[3];
    }

    // Trailing container_cl (2-3 digit int) + optional degree (X.X)
    let containerCl: number | null = null;
    const trailingMatch = nameRaw.match(/^(.+?)\s+(\d{2,3})(?:\s+\d{1,2}\.\d)?\s*$/);
    if (trailingMatch) {
      nameRaw = trailingMatch[1];
      containerCl = parseInt(trailingMatch[2], 10);
    }

    // Clean container-type prefix from name (FUT 30L, PET, 70CL …)
    nameRaw = nameRaw
      .replace(/^FUT\s+\d+L\s+/i, "")
      .replace(/^(?:PET|BOUT\.?|BIB)\s+/i, "")
      .replace(/^\d+CL\s+/i, "")
      .trim();

    // Append continuation line (next row without SKU prefix, starting with a letter)
    if (i + 1 < rows.length) {
      const next = rows[i + 1].trim();
      if (next && !/^\d{4,6}\s/.test(next) && /^[A-Za-zÀ-ÿ]/.test(next)) {
        const cont = next.replace(/\s+\d+[\.,]?\d*°?\s*$/, "").trim();
        if (cont.length > 1) nameRaw += " " + cont;
      }
    }

    const pieceVolumeMl = containerCl != null ? containerCl * 10 : null;

    lines.push({
      sku,
      name: nameRaw,
      quantity: qty,
      unit: "pc",
      unit_price: unitPrice,
      total_price: montHt,
      tax_rate,
      notes: null,
      piece_weight_g: null,
      piece_volume_ml: pieceVolumeMl,
    });
  }

  // Dédoublonnage (pages can repeat header + some lines)
  const seen = new Set<string>();
  const out: ParsedLine[] = [];
  for (const l of lines) {
    const key = [l.sku ?? "", l.name, l.quantity ?? "", l.unit_price ?? "", l.total_price ?? ""].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }

  return out;
}

export function parseCozigouInvoiceText(text: string): ParsedInvoice {
  const meta = extractMeta(text);
  const lines = parseLines(text);

  return {
    supplier: "COZIGOU",
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    lines,
    raw_text_preview: text.slice(0, 2000),
  };
}
