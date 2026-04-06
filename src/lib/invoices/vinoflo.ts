import { extractVolumeFromName } from "./utils";

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
  supplier: "VINOFLO";
  invoice_number: string | null;
  invoice_date: string | null;
  total_ht: number | null;
  total_ttc: number | null;
  lines: ParsedLine[];
  raw_text_preview: string;
};

/**
 * Clean OCR price: remove currency chars (€ ¤ æ ê e ç), trailing dots,
 * fix common OCR errors (t→nothing, I→9, '→nothing), convert comma to dot.
 */
function cleanPrice(s: string): number | null {
  let t = s.trim();
  if (!t) return null;
  t = t
    .replace(/[€¤æêçeQ]/gi, "")
    .replace(/[''`]/g, "")
    .replace(/t\)/g, "")       // OCR: "170,4t)" → "170,4"
    .replace(/t\s/g, "")       // OCR: "56, t 0" → "56,0"
    .replace(/I/g, "9")        // OCR: I→9
    .replace(/\s+/g, "")
    .replace(/\.+$/, "")       // trailing dots
    .replace(/\.(?=\d{3}\b)/g, "") // thousand sep
    .replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function extractMeta(text: string): Pick<ParsedInvoice, "invoice_number" | "invoice_date" | "total_ht" | "total_ttc"> {
  // Invoice number: "N° de facture : 8173" or "N' de facture : u40" (OCR)
  // OCR can mangle digits: u→8, handle alphanumeric
  const invMatch = text.match(/N[°º"']\s*de\s*facture\s*[:i;]\s*([a-zA-Z0-9]+)/i);
  // Date: "Oate : 16t12t2025" or "Date : 16/12/2025"
  const dateMatch = text.match(/[OD]ate\s*[:;]\s*(\d{2})[t\/](\d{2})[t\/](\d{4})/i);
  // Sous-total (HT)
  const htMatch = text.match(/sous[-\s]?total\s+([\d\s,.''¤€æç]+)/i);
  // Total TTC: "Total 1 460,52 ¤" or "Totat 1 460,52"
  const ttcMatch = text.match(/[Tt]ota[lt]\s+([\d\s,.''¤€æç]+)/i);

  let invoice_date: string | null = null;
  if (dateMatch) invoice_date = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;

  // Fix OCR-mangled invoice number: u→8, o→0, l→1, etc.
  let invoiceNumber = invMatch?.[1]?.trim() ?? null;
  if (invoiceNumber) {
    invoiceNumber = invoiceNumber
      .replace(/[uU]/g, "8")
      .replace(/[oO]/g, "0")
      .replace(/[lL]/g, "1")
      .replace(/[^0-9]/g, "");
    if (!invoiceNumber) invoiceNumber = null;
  }

  return {
    invoice_number: invoiceNumber,
    invoice_date,
    total_ht: htMatch ? cleanPrice(htMatch[1]) : null,
    total_ttc: ttcMatch ? cleanPrice(ttcMatch[1]) : null,
  };
}

/**
 * Parse product lines from Vinoflo OCR text.
 *
 * Format observed:
 *   qty sku name unit_price ¤ total ¤
 * Or merged:
 *   qtysku name unit_price ¤ total ¤
 *
 * Examples:
 *   6 200 Chianti Luggiêno 6,90 ¤ 41,40e.
 *   12 71 Rosso DiMontalcino 1420 ¤ 170,4t) ¤
 *   631 Barbera d'Astisuæriore 11,2æ. 67,50 ¤
 */
function parseLines(text: string): ParsedLine[] {
  const rawRows = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  // Pre-pass: merge split lines — if a line has only prices (no leading qty+sku),
  // append it to the previous line. Handles OCR splitting like:
  //   '18 81 Vâlpo icella Clâssico A legretto
  //   8,35 ¤ 150,30 ¤
  const rows: string[] = [];
  for (const raw of rawRows) {
    const stripped = raw.replace(/[¤€''`]/g, "").replace(/[ç.]+\s*$/i, "").trim();
    // Line that is only prices: "8,35 150,30" or "8,35 ¤ 150,30 ¤"
    if (/^[\d,.æ]+\s+[\d,.æ]+\s*$/.test(stripped) && rows.length > 0) {
      rows[rows.length - 1] += " " + raw;
    } else {
      rows.push(raw);
    }
  }

  const tmp: ParsedLine[] = [];

  for (let r of rows) {
    // Pre-normalize: strip currency symbols, trailing "e.", "ç.", apostrophes (OCR artifacts)
    r = r
      .replace(/[¤€]/g, "")
      .replace(/[çe]\.\s*$/i, "")
      .replace(/[''`]/g, "")
      .replace(/\bt\s*\)/g, "")
      .replace(/,\s*t\s+/g, ",")
      .replace(/^[']/g, "") // leading apostrophe (OCR: "'18" → "18")
      .trim();

    // Skip header/footer lines
    if (/description|prix\s+unit|articl/i.test(r)) continue;
    if (/sous[-\s]?total|^tva|^total|^solde|^escompte|^selon|^le\s+transfer/i.test(r)) continue;
    if (/^\s*[;)\-*_]+\s*$/.test(r)) continue;
    if (/facture|échéance|représentant|adresse|iban|marseille|rouet|poncel|vinoflo|sasha|malo|live\.fr|FR\d{8,}/i.test(r)) continue;
    if (/^\d[\d\s/,.]*$/.test(r)) continue; // only numbers/dates

    // Pattern A: "qty sku name price total"
    const m = r.match(
      /^(\d{1,3})\s+(\d{1,4})\s+(.+?)\s+([\d,.æ]+)\s+([\d,.æçt()Q]+)\s*$/
    );
    if (m) {
      const name = cleanName(m[3]);
      if (!name || name.length < 3) continue;
      tmp.push(makeLine(m[1], m[2], name, m[4], m[5]));
      continue;
    }

    // Pattern B: merged qty+sku (e.g. "631" = qty:6 sku:31)
    const mMerged = r.match(
      /^(\d)(\d{1,3})\s+(.+?)\s+([\d,.æ]+)\s+([\d,.æçt()Q]+)\s*$/
    );
    if (mMerged) {
      const name = cleanName(mMerged[3]);
      if (!name || name.length < 3) continue;
      tmp.push(makeLine(mMerged[1], mMerged[2], name, mMerged[4], mMerged[5]));
      continue;
    }

    // Pattern C: "qty sku name total" — price missing, only total
    const mNoPrice = r.match(
      /^(\d{1,3})\s+(\d{1,4})\s+(.+?)\s+([\d,.æçt()Q]+)\s*$/
    );
    if (mNoPrice) {
      const name = cleanName(mNoPrice[3]);
      if (!name || name.length < 3) continue;
      const qty = parseInt(mNoPrice[1], 10);
      const total = cleanPrice(mNoPrice[4]);
      const unitPrice = qty > 0 && total ? Math.round((total / qty) * 100) / 100 : null;
      tmp.push({
        sku: mNoPrice[2],
        name,
        quantity: qty,
        unit: "pc",
        unit_price: unitPrice,
        total_price: total,
        tax_rate: 20,
        notes: null,
        piece_weight_g: null,
        piece_volume_ml: extractVolumeFromName(name),
      });
    }
  }

  // Post-fix: if unit_price seems missing a decimal (OCR dropped comma),
  // cross-check with total/qty
  for (const l of tmp) {
    if (l.unit_price && l.total_price && l.quantity && l.quantity > 0) {
      const expected = l.total_price / l.quantity;
      if (l.unit_price > expected * 5 && l.unit_price / 100 > expected * 0.5 && l.unit_price / 100 < expected * 2) {
        l.unit_price = Math.round(l.unit_price) / 100;
      }
    }
  }

  // Post-fix: calculate missing unit_price from total/qty
  for (const l of tmp) {
    if ((!l.unit_price || l.unit_price === 0) && l.total_price && l.quantity && l.quantity > 0) {
      l.unit_price = Math.round((l.total_price / l.quantity) * 100) / 100;
    }
  }

  // Post-fix: clean up spaced-out characters in names from pdfToText
  for (const l of tmp) {
    l.name = cleanSpacedChars(l.name);
  }

  // Post-fix: remove lines with absurd prices (IBAN/reference lines that snuck through)
  // Wine unit prices are typically 3-80€
  const filtered = tmp.filter(l => {
    if (l.unit_price && l.unit_price > 200) return false;
    if (l.total_price && l.total_price > 5000) return false;
    return true;
  });

  // Deduplicate
  const seen = new Set<string>();
  const out: ParsedLine[] = [];
  for (const l of filtered) {
    const key = [l.sku ?? "", l.name, l.quantity ?? "", l.total_price ?? ""].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

/** Fix spaced-out characters from pdfToText: "R O U G E" → "ROUGE", "2 0 2 2" → "2022" */
function cleanSpacedChars(name: string): string {
  // Remove trailing spaced format/color: ", 7 5 0 6 1 1 ," etc.
  let cleaned = name.replace(/,\s*[\d\s,]+\s*,?\s*$/, "").trim();
  // Fix spaced-out words (single chars separated by spaces): "R O U G E" → "ROUGE"
  cleaned = cleaned.replace(/\b([A-ZÀ-Ü])\s(?=[A-ZÀ-Ü]\s[A-ZÀ-Ü])/g, "$1");
  // Fix remaining sequences: "B L A N C O" → "BLANCO"
  cleaned = cleaned.replace(/(?:^|\s)([A-ZÀ-Ü](?:\s[A-ZÀ-Ü]){2,})\b/g, (_, m) => " " + m.replace(/\s/g, ""));
  // Fix spaced numbers: "2 0 2 2" → "2022"
  cleaned = cleaned.replace(/(\d)\s(\d)\s(\d)\s(\d)/g, "$1$2$3$4");
  cleaned = cleaned.replace(/(\d)\s(\d)\s(\d)/g, "$1$2$3");
  // Clean multiple spaces
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  // Remove trailing comma
  cleaned = cleaned.replace(/,\s*$/, "").trim();
  return cleaned;
}

function cleanName(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/[¤€]/g, "")
    .trim();
}

function makeLine(qtyStr: string, sku: string, name: string, priceStr: string, totalStr: string): ParsedLine {
  return {
    sku: sku || null,
    name,
    quantity: parseInt(qtyStr, 10) || null,
    unit: "pc",
    unit_price: cleanPrice(priceStr),
    total_price: cleanPrice(totalStr),
    tax_rate: 20,
    notes: null,
    piece_weight_g: null,
    piece_volume_ml: extractVolumeFromName(name),
  };
}

// ── Vinoflo Order (Bordereau de Commande) parser ─────────────────────────────
// Digital PDF — but pdfToText produces spaced-out text:
//   "R O U G E" instead of "ROUGE", "0 , 7 5 0" instead of "0,750"
// Header: "BORDEREAU DE COMMANDE - BELLO MIO N° 2729 du 03/01/2026"
// Lines:  Region / PRODUCER - WINE   [Vintage]  COLOR  FORMAT  QTY  PU_HT€  PHT€

function isVinofloOrder(text: string): boolean {
  return /BORDEREAU\s+DE\s+COMMANDE/i.test(text);
}

/** Collapse spaced digits in a captured group: "1 4 7 , 6 0" → "147,60" */
function collapseSpacedDigits(s: string): string {
  return s.replace(/\s+/g, "");
}

function extractOrderMeta(text: string): Pick<ParsedInvoice, "invoice_number" | "invoice_date" | "total_ht" | "total_ttc"> {
  // "N° 2729 du 03/01/2026"
  const numMatch = text.match(/N[°º]\s*(\d{3,6})\s+du\s+(\d{2}\/\d{2}\/\d{4})/i);
  // "Montant net total HT : 2 130,90 €" — with possible spaced digits
  const totalMatch = text.match(/Montant\s+net\s+total\s+HT\s*:\s*([\d\s,.]+)\s*€/i);

  return {
    invoice_number: numMatch?.[1] ?? null,
    invoice_date: numMatch?.[2] ?? null,
    total_ht: totalMatch ? cleanOrderPrice(totalMatch[1]) : null,
    total_ttc: null, // Orders are HT only
  };
}

function cleanOrderPrice(s: string): number | null {
  const t = s.replace(/\s+/g, "").replace(",", ".").trim();
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Split a collapsed "qty+price" string like "188,20" into qty=18 and price=8.20
 * Uses the total to validate which split is correct.
 * The comma always belongs to the price (2 decimal digits).
 */
function splitQtyPrice(qtyPrice: string, total: number | null): { qty: number; price: number } | null {
  const commaIdx = qtyPrice.indexOf(",");
  if (commaIdx < 0) return null;
  const beforeComma = qtyPrice.slice(0, commaIdx);   // "188"
  const afterComma = qtyPrice.slice(commaIdx + 1);     // "20"
  if (beforeComma.length < 1 || afterComma.length !== 2) return null;

  // Try splitting beforeComma: last N digits are price integer, rest is qty
  // Wine prices are typically 3-80€, so price integer is 1-2 digits
  for (const priceIntLen of [1, 2]) {
    if (beforeComma.length <= priceIntLen) continue;
    const qtyStr = beforeComma.slice(0, beforeComma.length - priceIntLen);
    const priceStr = beforeComma.slice(beforeComma.length - priceIntLen) + "." + afterComma;
    const q = parseInt(qtyStr, 10);
    const p = parseFloat(priceStr);
    if (!q || !Number.isFinite(p)) continue;
    // Validate against total if available
    if (total != null) {
      if (Math.abs(q * p - total) < total * 0.02) return { qty: q, price: p };
    } else {
      // Without total, prefer 1-digit price integer (more common for wine)
      if (p >= 3 && p <= 80) return { qty: q, price: p };
    }
  }
  // Fallback: entire beforeComma is qty (no price integer portion)
  // This handles cases like "6,10" → qty is ambiguous
  return null;
}

function parseOrderLines(text: string): ParsedLine[] {
  // pdfToText produces spaced-out characters: "R O U G E", "0 , 7 5 0", "8 , 2 0 €"
  // Strategy: collapse spaced uppercase words, then use € as anchor to parse numbers

  // Step 1: collapse spaced uppercase words (ROUGE, BLANC, etc.)
  let normalized = text.replace(/\u00a0/g, " ");
  normalized = normalized.replace(/\b([A-ZÀ-Ü])((?:\s[A-ZÀ-Ü]){2,})\b/g, (_, first, rest) => first + rest.replace(/\s/g, ""));

  const rows = normalized.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const lines: ParsedLine[] = [];

  const SKIP = /Appellation|Designation|Millé|Couleur|Format|Remarque|montant\s+total|Qté\s+totale|Total\s*:|VINOFLO|ADRESSE|SIREN|FACTURATION|LIVRAISON|REGLEMENT|OBSERVATIONS|FRANCO|Tarif|Eq\.\s*Bout|Fermeture|livraison|PONCEL|SAINT-MALO|SASHA|COCHET|Edition|VinoVentes|Page\s+\d|BORDEREAU|COMMANDE|Exemplaire|C\.H\.R|FR\d{11}|SAMEDI|DIMANCHE|^\d{2}h\d{2}|^N[°º]|Xavier|POTET|potet|gmail|piccolamia|contact@|Famille|CAVE\s*\d|droits\s+et\s+la\s+vignette|articles/i;

  // Spaced number patterns — digits/commas separated by spaces:
  //   format: "0 , 7 5 0" → 0,750 (always 0,XXX — exactly 3 decimal digits)
  //   qtyAndPrice: "1 8 8 , 2 0" — qty+price merged, split programmatically using total
  //   total: "1 4 7 , 6 0" (always X,XX — 2 decimal digits)
  // Use € as anchor between price and total

  const FMT = "0\\s*,\\s*\\d\\s*\\d\\s*\\d";  // format: 0,750 (exactly 3 decimals)

  // Strategy 1: with color — name COLOR format qtyPrice € total €
  const RE1 = new RegExp(
    `^(.+?)\\s+(ROUGE|BLANC|ROSE|ROSÉ)\\s+(${FMT})\\s+([\\d\\s,]+?)\\s*€\\s*([\\d\\s,]+?)\\s*€`,
    "i"
  );

  // Strategy 2: without color (spirits) — name format qtyPrice € total €
  const RE2 = new RegExp(
    `^(.+?)\\s+(${FMT})\\s+([\\d\\s,]+?)\\s*€\\s*([\\d\\s,]+?)\\s*€`,
    "i"
  );

  for (const row of rows) {
    if (SKIP.test(row)) continue;
    if (row.length < 10) continue;
    if (/^\d[\d\s/,.]*$/.test(row)) continue;

    let name: string | null = null;
    let qty = 0;
    let unitPrice: number | null = null;
    let totalPrice: number | null = null;
    let volumeMl: number | null = null;

    const m1 = RE1.exec(row);
    if (m1) {
      name = m1[1].trim();
      volumeMl = Math.round((cleanOrderPrice(collapseSpacedDigits(m1[3])) ?? 0) * 1000) || null;
      const qtyPriceStr = collapseSpacedDigits(m1[4]); // e.g. "188,20" (qty=18, price=8.20)
      totalPrice = cleanOrderPrice(collapseSpacedDigits(m1[5]));
      const split = splitQtyPrice(qtyPriceStr, totalPrice);
      if (split) { qty = split.qty; unitPrice = split.price; }
    }

    if (!name) {
      const m2 = RE2.exec(row);
      if (m2) {
        name = m2[1].trim();
        volumeMl = Math.round((cleanOrderPrice(collapseSpacedDigits(m2[2])) ?? 0) * 1000) || null;
        const qtyPriceStr = collapseSpacedDigits(m2[3]);
        totalPrice = cleanOrderPrice(collapseSpacedDigits(m2[4]));
        const split = splitQtyPrice(qtyPriceStr, totalPrice);
        if (split) { qty = split.qty; unitPrice = split.price; }
      }
    }

    if (!name || name.length < 3 || !qty || !unitPrice) continue;

    // Sanity: unit price for wine typically 3-80€
    if (unitPrice < 1 || unitPrice > 80) continue;
    // Sanity: qty × unitPrice should be close to total
    if (totalPrice != null && Math.abs(qty * unitPrice - totalPrice) > totalPrice * 0.05) continue;

    // Clean name: collapse spaced digits (vintage "2 0 2 0" → "2020"), remove trailing color/format
    const cleanedName = cleanSpacedChars(name)
      .replace(/\s+/g, " ")
      .replace(/\s*(ROUGE|BLANC|ROSE|ROSÉ)\s*$/i, "")
      .replace(/\s+\d[,.]\d{2,3}\s*$/, "")
      .trim();

    if (cleanedName.length < 3) continue;

    lines.push({
      sku: null,
      name: cleanedName,
      quantity: qty,
      unit: "pc",
      unit_price: unitPrice,
      total_price: totalPrice,
      tax_rate: 20,
      notes: null,
      piece_weight_g: null,
      piece_volume_ml: volumeMl ?? 750,
    });
  }

  // Deduplicate
  const seen = new Set<string>();
  return lines.filter(l => {
    const key = l.name + "|" + l.quantity + "|" + l.unit_price;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseVinofloInvoiceText(text: string): ParsedInvoice {
  // Auto-detect: order (bordereau) vs invoice (facture)
  if (isVinofloOrder(text)) {
    const meta = extractOrderMeta(text);
    const lines = parseOrderLines(text);
    return {
      supplier: "VINOFLO",
      invoice_number: meta.invoice_number ? `CMD-${meta.invoice_number}` : null,
      invoice_date: meta.invoice_date,
      total_ht: meta.total_ht,
      total_ttc: meta.total_ttc,
      lines,
      raw_text_preview: text.slice(0, 2000),
    };
  }

  // Fallback: original OCR invoice parser
  const meta = extractMeta(text);
  const lines = parseLines(text);
  return {
    supplier: "VINOFLO",
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    lines,
    raw_text_preview: text.slice(0, 2000),
  };
}
