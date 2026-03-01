import { extractVolumeFromName, extractWeightGFromName } from "./utils";

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
  supplier: "MAEL";
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
  const cleaned = t
    .replace(/\s+/g, "")
    .replace(/[€]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function cleanName(raw: string): string {
  return toText(raw)
    .replace(/\s+/g, " ")
    .replace(/^(NC|DLUO|DLC)\s+/i, "")
    .replace(/^\d{2}\/\d{2}(?:\/\d{2,4})?\s+/, "")
    .trim();
}

function stripTrailingUnitCount(s: string): string {
  return s
    .replace(/\s*\b\d+(?:[.,]\d+)?\s*(U|PIECE|PCS?)\b\s*$/i, "")
    .trim();
}


function extractMeta(text: string): Pick<ParsedInvoice, "invoice_number" | "invoice_date" | "total_ht" | "total_ttc"> {
  const invoiceMatch = text.match(/Facture\s*N[°º]\s*([A-Z0-9]+)/i);
  const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);

  const totalTtcMatch = text.match(/Totals*TTC[s:]+([0-9][0-9 .,]*)/i);
  const totalHtMatch = text.match(/H\.T\.\s*:\s*([0-9][0-9 .,]*)/i);

  return {
    invoice_number: invoiceMatch?.[1] ?? null,
    invoice_date: dateMatch?.[1] ?? null,
    total_ht: totalHtMatch ? parseFrenchNumber(totalHtMatch[1]) : null,
    total_ttc: totalTtcMatch ? parseFrenchNumber(totalTtcMatch[1]) : null,
  };
}

function normalizeLineHead(
  headRaw: string
): { name: string; qty: number | null; unit: "pc" | "kg" | "l" | null; notes: string | null; piece_volume_ml: number | null } {
  let head = cleanName(headRaw);

  const varKg = head.match(/(\d+(?:[.,]\d+)?)\s*kg~\s*$/i);
  if (varKg) {
    const q = parseFrenchNumber(varKg[1]);
    head = head.replace(/\s*\d+(?:[.,]\d+)?\s*kg~\s*$/i, "").trim();
    head = stripTrailingUnitCount(head);
    return { name: head, qty: q, unit: "kg", notes: "poids variable", piece_volume_ml: null };
  }

  const varL = head.match(/(\d+(?:[.,]\d+)?)\s*l~\s*$/i);
  if (varL) {
    const q = parseFrenchNumber(varL[1]);
    head = head.replace(/\s*\d+(?:[.,]\d+)?\s*l~\s*$/i, "").trim();
    head = stripTrailingUnitCount(head);
    return { name: head, qty: q, unit: "l", notes: "volume variable", piece_volume_ml: null };
  }

  // Compter les unités (ex: "10 U", "6 PCS")
  const uMatch = head.match(/\b(\d+(?:[.,]\d+)?)\s*(U|PIECE|PCS?)\b\s*$/i);
  let qty: number | null = null;
  if (uMatch) {
    qty = parseFrenchNumber(uMatch[1]);
    head = stripTrailingUnitCount(head);
  }

  // Détecter un volume fixe dans le nom (ex: "AMARETTO 70CL", "BIERE 33CL")
  const volMl = extractVolumeFromName(head);
  if (volMl != null) {
    return { name: head, qty, unit: "pc", notes: null, piece_volume_ml: volMl };
  }

  return { name: head, qty, unit: uMatch ? "pc" : null, notes: null, piece_volume_ml: null };
}

function parseLines(text: string): ParsedLine[] {
  const tmp: ParsedLine[] = [];

  const rows = text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  for (const r of rows) {
    const m = r.match(/\b(ART[0-9A-Z]{3,})\b\s+(.*)$/i);
    if (!m) continue;

    const sku = m[1].toUpperCase();
    const rest = m[2];

    const tail = rest.match(/([0-9][0-9\s.,]*)\s+([0-9][0-9\s.,]*)\s+([0-9]{1,2}(?:[.,][0-9]+)?)\s*%?\s*$/);
    if (!tail) continue;

    const unitPrice = parseFrenchNumber(tail[1]);
    const totalPrice = parseFrenchNumber(tail[2]);
    const taxRate = parseFrenchNumber(tail[3]);

    const headRaw = rest.slice(0, Math.max(0, rest.length - tail[0].length)).trim();
    const norm = normalizeLineHead(headRaw);

    const volMl = norm.piece_volume_ml;

    tmp.push({
      sku,
      name: norm.name,
      quantity: norm.qty,
      unit: norm.unit,
      unit_price: unitPrice,
      total_price: totalPrice,
      tax_rate: taxRate,
      notes: norm.notes,
      // piece_weight_g seulement si c'est une pièce sans volume connu
      piece_weight_g: (norm.unit === "pc" && volMl == null) ? extractWeightGFromName(norm.name) : null,
      piece_volume_ml: volMl,
    });
  }

  const seen = new Set<string>();
  const out: ParsedLine[] = [];
  for (const l of tmp) {
    const key = [
      l.sku ?? "",
      l.name,
      l.quantity ?? "",
      l.unit ?? "",
      l.unit_price ?? "",
      l.total_price ?? "",
      l.tax_rate ?? "",
      l.notes ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }

  return out;
}

export function parseMaelInvoiceText(text: string): ParsedInvoice {
  const meta = extractMeta(text);
  const lines = parseLines(text);

  return {
    supplier: "MAEL",
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    lines,
    raw_text_preview: text.slice(0, 2000),
  };
}
