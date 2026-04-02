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
 * Clean OCR price: remove currency chars (€ ¤ æ ê e), trailing dots,
 * fix common OCR errors (t→nothing, I→9, '→nothing), convert comma to dot.
 */
function cleanPrice(s: string): number | null {
  let t = s.trim();
  if (!t) return null;
  t = t
    .replace(/[€¤æêeQ]/gi, "")
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
  // Invoice number: "N° de facture : 8173" or "N" de facture : 8173"
  const invMatch = text.match(/N[°º"']\s*de\s*facture\s*[:i]\s*(\d+)/i);
  // Date: "Oate : 16t12t2025" or "Date : 16/12/2025"
  const dateMatch = text.match(/[OD]ate\s*[:;]\s*(\d{2})[t\/](\d{2})[t\/](\d{4})/i);
  // Sous-total (HT)
  const htMatch = text.match(/sous[-\s]?total\s+([\d\s,.''¤€æ]+)/i);
  // Total TTC: "Total 1 460,52 ¤" or "Totat 1 460,52"
  const ttcMatch = text.match(/[Tt]ota[lt]\s+([\d\s,.''¤€æ]+)/i);

  let invoice_date: string | null = null;
  if (dateMatch) invoice_date = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;

  return {
    invoice_number: invMatch?.[1]?.trim() ?? null,
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
  const rows = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const tmp: ParsedLine[] = [];

  for (let r of rows) {
    // Pre-normalize: strip currency symbols, trailing "e.", apostrophes (OCR artifacts)
    r = r.replace(/[¤€]/g, "").replace(/e\.\s*$/i, "").replace(/[''`]/g, "").replace(/\bt\s*\)/g, "").replace(/,\s*t\s+/g, ",").trim();

    // Skip header/footer lines
    if (/description|prix\s+unit/i.test(r)) continue;
    if (/sous[-\s]?total|^tva|^total|^solde|^escompte|^selon|^le\s+transfer/i.test(r)) continue;
    if (/^\s*[;)\-*_]+\s*$/.test(r)) continue;
    if (/facture|échéance|représentant|adresse|iban|marseille|rouet|poncel|vinoflo/i.test(r)) continue;

    // Pattern A: "qty sku name price total"
    const m = r.match(
      /^(\d{1,3})\s+(\d{1,4})\s+(.+?)\s+([\d,.æ]+)\s+([\d,.æt()Q]+)\s*$/
    );
    if (m) {
      const name = cleanName(m[3]);
      if (!name || name.length < 3) continue;
      tmp.push(makeLine(m[1], m[2], name, m[4], m[5]));
      continue;
    }

    // Pattern B: merged qty+sku (e.g. "631" = qty:6 sku:31)
    const mMerged = r.match(
      /^(\d)(\d{1,3})\s+(.+?)\s+([\d,.æ]+)\s+([\d,.æt()Q]+)\s*$/
    );
    if (mMerged) {
      const name = cleanName(mMerged[3]);
      if (!name || name.length < 3) continue;
      tmp.push(makeLine(mMerged[1], mMerged[2], name, mMerged[4], mMerged[5]));
      continue;
    }

    // Pattern C: "qty sku name total" — price missing, only total
    const mNoPrice = r.match(
      /^(\d{1,3})\s+(\d{1,4})\s+(.+?)\s+([\d,.æt()Q]+)\s*$/
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

  // Deduplicate
  const seen = new Set<string>();
  const out: ParsedLine[] = [];
  for (const l of tmp) {
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
// Digital PDF — clean text, no OCR issues.
// Header: "BORDEREAU DE COMMANDE - BELLO MIO N° 2729 du 03/01/2026"
// Lines:  Region / PRODUCER - WINE   [Vintage]  COLOR  FORMAT  QTY  PU_HT€  PHT€

function isVinofloOrder(text: string): boolean {
  return /BORDEREAU\s+DE\s+COMMANDE/i.test(text);
}

function extractOrderMeta(text: string): Pick<ParsedInvoice, "invoice_number" | "invoice_date" | "total_ht" | "total_ttc"> {
  // "N° 2729 du 03/01/2026"
  const numMatch = text.match(/N[°º]\s*(\d{3,6})\s+du\s+(\d{2}\/\d{2}\/\d{4})/i);
  // "Total : 2 130,90 €" or "Montant net total HT : 2 130,90 €"
  const totalMatch = text.match(/(?:Montant\s+net\s+total\s+HT|Total)\s*:?\s*([\d\s,.]+)\s*€/i);

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

function parseOrderLines(text: string): ParsedLine[] {
  // Normalize: strip € signs, collapse whitespace on each line
  const normalized = text
    .replace(/€/g, "")
    .replace(/\u00a0/g, " ");  // non-breaking spaces

  const rows = normalized.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const lines: ParsedLine[] = [];

  // SKIP patterns
  const SKIP = /Appellation|Designation|Millé|Couleur|Format|Remarque|montant\s+total|Qté\s+totale|Total\s*:|VINOFLO|ADRESSE|SIREN|FACTURATION|LIVRAISON|REGLEMENT|OBSERVATIONS|FRANCO|Tarif|Eq\.\s*Bout|Fermeture|livraison|PONCEL|SAINT-MALO|SASHA|COCHET|Edition|VinoVentes|Page\s+\d|BORDEREAU|COMMANDE|Exemplaire|C\.H\.R|FR\d{11}|SAMEDI|DIMANCHE|^\d{2}h\d{2}|^N[°º]/i;

  // Strategy 1: Full line with color
  // "Name stuff ROUGE 0,750 18 8,20 147,60"
  const RE1 = /^(.+?)\s+(ROUGE|BLANC|ROSE|ROSÉ)\s+(\d[,.]\d+)\s+(\d+)\s+([\d,.]+)\s+([\d\s,.]+)\s*$/i;

  // Strategy 2: Without color (spirits)
  // "Name stuff 0,700 18 13,90 250,20"
  const RE2 = /^(.+?)\s+(\d[,.]\d{2,3})\s+(\d+)\s+([\d,.]+)\s+([\d\s,.]+)\s*$/i;

  // Strategy 3: Just numbers at end — name ... qty unitPrice total
  // Handles cases where pdfToText drops some columns
  // "Name stuff 18 8,20 147,60"
  const RE3 = /^(.+?)\s+(\d{1,3})\s+([\d,.]+)\s+([\d\s,.]+)\s*$/;

  for (const row of rows) {
    if (SKIP.test(row)) continue;
    if (row.length < 10) continue;
    // Skip lines that are only numbers/dates
    if (/^\d[\d\s/,.]*$/.test(row)) continue;

    let name: string | null = null;
    let qty = 0;
    let unitPrice: number | null = null;
    let totalPrice: number | null = null;
    let volumeMl: number | null = null;

    const m1 = RE1.exec(row);
    if (m1) {
      name = m1[1].trim();
      volumeMl = Math.round((cleanOrderPrice(m1[3]) ?? 0) * 1000) || null;
      qty = parseInt(m1[4], 10);
      unitPrice = cleanOrderPrice(m1[5]);
      totalPrice = cleanOrderPrice(m1[6]);
    }

    if (!name) {
      const m2 = RE2.exec(row);
      if (m2) {
        name = m2[1].trim();
        volumeMl = Math.round((cleanOrderPrice(m2[2]) ?? 0) * 1000) || null;
        qty = parseInt(m2[3], 10);
        unitPrice = cleanOrderPrice(m2[4]);
        totalPrice = cleanOrderPrice(m2[5]);
      }
    }

    if (!name) {
      const m3 = RE3.exec(row);
      if (m3) {
        // Only match if name part looks like a wine (has letters)
        const candidate = m3[1].trim();
        if (/[a-zA-ZÀ-ÿ]{3,}/.test(candidate)) {
          name = candidate;
          qty = parseInt(m3[2], 10);
          unitPrice = cleanOrderPrice(m3[3]);
          totalPrice = cleanOrderPrice(m3[4]);
        }
      }
    }

    if (!name || name.length < 3 || !qty || !unitPrice) continue;

    // Sanity: unit price for wine typically 3-50€
    if (unitPrice < 1 || unitPrice > 80) continue;
    // Sanity: qty × unitPrice should be close to total
    if (totalPrice != null && Math.abs(qty * unitPrice - totalPrice) > totalPrice * 0.05) continue;

    // Clean name
    const cleanedName = name
      .replace(/\s+/g, " ")
      .replace(/\s*(ROUGE|BLANC|ROSE|ROSÉ)\s*$/i, "") // trailing color if captured in name
      .replace(/\s+\d[,.]\d{2,3}\s*$/, "") // trailing format like "0,750"
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
      piece_volume_ml: volumeMl ?? 750, // default wine bottle
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
