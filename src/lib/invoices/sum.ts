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

// Nombre au format mixte : "1 046,90", "1046.9", "2,292.07", "1104,48"
function parseAnyNumber(s: string): number | null {
  let cleaned = s.trim().replace(/[\s€]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // Le séparateur le plus à droite est la décimale, l'autre les milliers
    if (lastComma > lastDot) cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    else cleaned = cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    cleaned = cleaned.replace(",", ".");
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractMeta(
  text: string
): Pick<ParsedInvoice, "invoice_number" | "invoice_date" | "total_ht" | "total_ttc"> {
  // "FA2600056 09/01/26" (ancien) ou "FA2505499 10/10/2025" (nouveau)
  const invMatch = text.match(/\b(FA\d+)\s+(\d{2})\/(\d{2})\/(\d{4}|\d{2})\b/);
  const invoice_number = invMatch ? invMatch[1] : null;
  const year = invMatch ? (invMatch[4].length === 2 ? `20${invMatch[4]}` : invMatch[4]) : null;
  const invoice_date = invMatch ? `${invMatch[2]}/${invMatch[3]}/${year}` : null;

  // Ancien format : "C2 1 300,69€ 5,5% 71,54€ ... 1 372,23€"
  const totalMatchOld = text.match(/\bC2\s+([\d ]+,\d{2})€.*?([\d ]+,\d{2})€\s+0,00€\s+([\d ]+,\d{2})€/);
  if (totalMatchOld) {
    return {
      invoice_number, invoice_date,
      total_ht: parseFrenchNumber(totalMatchOld[1]),
      total_ttc: parseFrenchNumber(totalMatchOld[3]),
    };
  }
  // Nouveau format : une ligne par taux de TVA — "C2 1046.9 5.50% 57.57 [TTC]" / "C5 86 20.00% 17.20"
  let ht = 0, tva = 0, found = false;
  for (const m of text.matchAll(/\bC\d\s+([\d.,]+)\s+[\d.,]+%\s+([\d.,]+)/g)) {
    const base = parseAnyNumber(m[1]);
    const tax = parseAnyNumber(m[2]);
    if (base != null && tax != null) { ht += base; tva += tax; found = true; }
  }
  return {
    invoice_number, invoice_date,
    total_ht: found ? Math.round(ht * 100) / 100 : null,
    total_ttc: found ? Math.round((ht + tva) * 100) / 100 : null,
  };
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

  // Nouveau format (2025+), sans € : "CODE NOM... QTE LOT PU [REMISE] MT"
  // ex: "ANT016 S.A. - Câpres au sel 70gr 12,000 L180827 3,10 37,20"
  // Le lot peut être numérique ("1126") et les longues désignations passent sur 2 lignes.
  // Remise optionnelle : "14,76 50% 11,07" (pourcentage) ou montant "1,00"
  const NEW_LINE_RE = /^([A-Z]{2,}[A-Z0-9]*\d{2,}[A-Z]?)\s+(.+?)\s+(\d[\d\s.]*,\d{1,3})\s+(\S+)\s+(\d[\d\s.]*,\d{2})(?:\s+(\d[\d\s.]*,\d{2}|\d+(?:[.,]\d+)?%))?\s+(\d[\d\s.]*,\d{2})$/;
  // RUPTURE nouveau format : "NOM... CODE RUPTURE 0,000 0,00 0,00"
  const NEW_RUPTURE_RE = /^(.*?)\s+([A-Z]{2,}[A-Z0-9]*\d{2,}[A-Z]?)\s+RUPTURE\b/;

  const pushNewFormat = (m: RegExpExecArray) => {
    const name = m[2].trim();
    const qty = parseFrenchNumber(m[3]);
    const total = parseFrenchNumber(m[7]);
    // Si remise présente (m[6]), le PU affiché est avant remise → PU net = MT / qté
    const pu = m[6] && total != null && qty
      ? Math.round((total / qty) * 1000) / 1000
      : parseFrenchNumber(m[5]);
    if (!name || qty == null) return false;
    result.push({
      sku: m[1], name, quantity: qty, unit: "pc",
      unit_price: pu, total_price: total, tax_rate: 5.5, notes: null,
      piece_weight_g: extractWeightGFromName(name),
      piece_volume_ml: extractVolumeFromName(name),
    });
    return true;
  };

  while (i < sectionRows.length) {
    const row = sectionRows[i];

    // Skip bare "RUPTURE" lines (already consumed by lookahead below)
    if (row === "RUPTURE") { i++; continue; }

    // ── Nouveau format (lignes sans €) ──
    if (!row.includes("€")) {
      // RUPTURE : "NOM CODE RUPTURE 0,000 0,00 0,00"
      if (row.includes("RUPTURE")) {
        const m = NEW_RUPTURE_RE.exec(row);
        if (m) {
          result.push({
            sku: m[2], name: m[1].trim(), quantity: null, unit: null,
            unit_price: null, total_price: null, tax_rate: null, notes: "RUPTURE",
            piece_weight_g: extractWeightGFromName(m[1].trim()),
            piece_volume_ml: extractVolumeFromName(m[1].trim()),
          });
          i++;
          continue;
        }
      }
      // Ligne produit, éventuellement coupée sur 2-3 rangées par le PDF
      if (/^[A-Z]{2,}[A-Z0-9]*\d{2,}[A-Z]?\s/.test(row)) {
        let matched = false;
        let buffer = row;
        for (let extra = 0; extra <= 2; extra++) {
          if (extra > 0) {
            const next = sectionRows[i + extra];
            if (!next || next.includes("€") || /^[A-Z]{2,}[A-Z0-9]*\d{2,}[A-Z]?\s/.test(next)) break;
            buffer += " " + next;
          }
          const m = NEW_LINE_RE.exec(buffer);
          if (m && pushNewFormat(m)) {
            i += extra + 1;
            matched = true;
            break;
          }
        }
        if (matched) continue;
      }
    }

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
