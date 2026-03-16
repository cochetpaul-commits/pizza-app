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

export function parseVinofloInvoiceText(text: string): ParsedInvoice {
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
