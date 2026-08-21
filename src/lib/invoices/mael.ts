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
  let s = toText(raw).replace(/\s+/g, " ").trim();
  // Strip leading labels (NC, DLUO, DLC)
  s = s.replace(/^(NC|DLUO|DLC)\s+/i, "");
  // Strip leading noise: dates (DD/MM/YY, D/M/YY), numbers with *, bare numbers
  // before the actual product name (starts with a letter).
  // Examples: "05/0/26 PARMESAN..." → "PARMESAN..."
  //           "10* 15/02/26 14* 22/02/26 MOZZARELLA..." → "MOZZARELLA..."
  s = s.replace(/^(?:\d{1,2}(?:[/*]\d{0,2}(?:\/\d{2,4})?)?\*?\s+)+/, "").trim();
  return s;
}

function stripTrailingUnitCount(s: string): string {
  return s
    .replace(/\s*\b\d+(?:[.,]\d+)?\s*(U|PIECE|PCS?)\b\s*$/i, "")
    .trim();
}


function extractMeta(text: string): Pick<ParsedInvoice, "invoice_number" | "invoice_date" | "total_ht" | "total_ttc"> {
  const invoiceMatch = text.match(/Facture\s*N[°º]\s*([A-Z0-9]+)/i);
  const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);

  const totalHtMatch = text.match(/H\.T\.\s*:\s*([0-9][0-9 .,]*)/i);

  // TTC: captured from the line "T.V.A. : 36,61 702,30" (TTC follows TVA amount)
  // or fallback to "Net à payer" on same line
  const totalTtcMatch =
    text.match(/T\.V\.A\.\s*:\s*[\d,.]+\s+([\d,.]+)/i) ??
    text.match(/Net\s+[àa]\s+payer\b[^\n]*([\d][0-9.,]+)/i);

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

// Lignes d'en-tête / de page qui ne sont jamais une suite de désignation
const NON_CONTINUATION = /^(Pensez|Facture\s*N|Date\b|Client\b|Page\b|SAS MAEL|\d{2}\/\d{2}\/\d{4}\b|\d+\s+rue|35400|Tél|N\.I\.I|S\.I\.R|R\.C\.S|N\.A\.F|IBAN|BIC|Mode de r|Prélèvement|Echéance|Réf\b|DLC\/DLUO|Bon de livraison|Commande|Reprise|Pénalités|Indemnité|Bases HT|Totaux?\b|H\.T\.|T\.V\.A\.|Net\s+[àa]\s+payer)/i;

/** Codes TVA Mael → taux réels (2 = 5,5 %, 5 = 20 %) */
function maelTaxRate(code: number | null): number | null {
  if (code === 2) return 5.5;
  if (code === 5) return 20;
  return code;
}

/** Vide une suite de désignation de ses préfixes DLC ("1*18/11/26", "PIECES X 2") */
function cleanContinuation(raw: string): string {
  return toText(raw)
    .replace(/\s+/g, " ")
    .replace(/^(?:\d+\*\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*)+/i, "")
    .replace(/^PIECES?\s+X\s*\d+\s*/i, "")
    .trim();
}

function parseLines(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];

  const rows = text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const TAIL = /([0-9][0-9\s.,]*)\s+([0-9][0-9\s.,]*)\s+([0-9]{1,2}(?:[.,][0-9]+)?)\s*%?\s*$/;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const m = r.match(/\b(ART[0-9A-Z]{3,})\b\s+(.*)$/i);
    if (!m) continue;

    const sku = m[1].toUpperCase();
    const rest = m[2];

    const tail = rest.match(TAIL);
    if (!tail) continue;

    const unitPrice = parseFrenchNumber(tail[1]);
    const totalPrice = parseFrenchNumber(tail[2]);
    const taxRate = maelTaxRate(parseFrenchNumber(tail[3]));

    const headRaw = rest.slice(0, Math.max(0, rest.length - tail[0].length)).trim();
    const norm = normalizeLineHead(headRaw);

    // Suite de désignation sur les 1-2 lignes suivantes (Mael coupe les
    // libellés longs : "…IGP ~" / "1,5 kg", "(128 x" / "12,5 g) 1,6 kg",
    // ou DLC multiples "2*04/11/26" / "1*18/11/26 Blanc d'oeuf liquide 1 kg").
    const suite: string[] = [];
    for (let k = 1; k <= 2 && i + k < rows.length; k++) {
      const next = rows[i + k];
      if (/\bART[0-9A-Z]{3,}\b/i.test(next)) break;
      if (NON_CONTINUATION.test(next)) break;
      if (TAIL.test(next) && /\d+,\d{2}\s+\d+,\d{2}/.test(next)) break; // une autre ligne chiffrée
      suite.push(cleanContinuation(next));
    }

    // Nom : la 1re ligne, sauf si elle ne contenait que des DLC ("2*04/11/26")
    // → le nom est alors sur la suite. Les libellés coupés gardent leur
    // 1re ligne comme nom (stabilité du rattachement aux produits existants),
    // la suite ne sert qu'à lire le poids/volume du conditionnement.
    let name = norm.name;
    if (!name || /^[\d*\/\s]+$/.test(name)) {
      name = suite.filter(Boolean).join(" ").trim();
    }
    const libelleComplet = [name, ...suite].filter(Boolean).join(" ");

    const volMl = norm.piece_volume_ml ?? (norm.unit === "pc" ? extractVolumeFromName(libelleComplet) : null);

    out.push({
      sku,
      name,
      quantity: norm.qty,
      unit: norm.unit,
      unit_price: unitPrice,
      total_price: totalPrice,
      tax_rate: taxRate,
      notes: norm.notes,
      // piece_weight_g seulement si c'est une pièce sans volume connu
      piece_weight_g: (norm.unit === "pc" && volMl == null)
        ? (extractWeightGFromName(name) ?? extractWeightGFromName(libelleComplet))
        : null,
      piece_volume_ml: volMl,
    });
  }

  // PAS de déduplication : un même produit livré deux fois à l'identique
  // (deux bons de livraison sur la même facture) est deux lignes réelles —
  // l'ancienne dédup jetait ~270 € par facture (FB9599 du 21/08/2026).
  return out;
}

/**
 * Remise globale en pied de facture ("Tx: 2,00" dans le bloc Bases HT) :
 * les lignes sont facturées AVANT remise. On la répercute sur chaque ligne
 * uniquement si le calcul retombe sur le total HT (sinon on ne touche à
 * rien) — le food cost reflète ainsi le prix réellement payé.
 */
function applyGlobalDiscount(lines: ParsedLine[], text: string, totalHt: number | null): void {
  if (totalHt == null || lines.length === 0) return;
  const m = text.match(/Tx\s*:\s*([0-9]+(?:[.,][0-9]+)?)/i);
  const rate = m ? parseFrenchNumber(m[1]) : null;
  if (!rate || rate <= 0 || rate >= 50) return;
  const factor = 1 - rate / 100;
  const sum = lines.reduce((a, l) => a + (l.total_price ?? 0), 0);
  if (Math.abs(sum * factor - totalHt) > 1) return; // remise non uniforme : on n'invente rien
  const r2 = (v: number) => Math.round(v * 100) / 100;
  for (const l of lines) {
    if (l.unit_price != null) l.unit_price = r2(l.unit_price * factor);
    if (l.total_price != null) l.total_price = r2(l.total_price * factor);
    const note = `remise ${String(rate).replace(".", ",")} % déduite`;
    l.notes = l.notes ? `${l.notes} · ${note}` : note;
  }
}

export function parseMaelInvoiceText(text: string): ParsedInvoice {
  const meta = extractMeta(text);
  const lines = parseLines(text);
  applyGlobalDiscount(lines, text, meta.total_ht);

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
