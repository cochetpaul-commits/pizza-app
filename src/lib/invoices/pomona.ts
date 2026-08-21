import type { Category } from "@/types/ingredients";

/**
 * Parser factures Pomona TerreAzur (fruits & légumes / marée).
 *
 * Texte produit par pdfToText (unpdf) — une ligne produit :
 *   "60/ 103535 Sal jp roquette ½ 500gX2 100% FR°° 1,000 COL 1,000 KG 6,950 F 1 6,95"
 *    ligne/ article  désignation                       qté liv. UL  qté fact. UF  PU  famille codeTVA MT HT
 *
 * suivie d'une ligne origine ("Jeunes pousses - France"), parfois
 * avec le poids brut ("6,383 KG") et/ou la majoration de décolisage
 * ("0,22") — MT HT = PU × qté facturée + majoration.
 *
 *  - La quantité retenue est la quantité FACTURÉE (UF) : KG → kg,
 *    toute autre unité (COL, SAC, BQT, FLT, PU, BOT…) → pièce.
 *  - Famille : F = fruits & légumes, M = marée → catégorie ingrédient.
 *  - Code TVA : tableau récapitulatif "235,74 1 5,50 12,97" (code 1 = 5,5 %).
 *  - Forfait livraison (article FL…, 0,000 E 0) : ignoré.
 */

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
  category: Category | null;
};

export type ParsedInvoice = {
  supplier: "POMONA";
  invoice_number: string | null;
  invoice_date: string | null; // "DD/MM/YYYY"
  total_ht: number | null;
  total_ttc: number | null;
  lines: ParsedLine[];
  raw_text_preview: string;
};

const NUM = "-?\\d[\\d ]*,\\d+";

const LINE_RE = new RegExp(
  "^(\\d+)\\/\\s*([A-Z0-9]+)\\s+(.+?)\\s+(" + NUM + ")\\s+([A-Z]{2,4})\\s+(" + NUM + ")\\s+([A-Z]{2,4})\\s+(" + NUM + ")\\s+([A-Z])\\s+(\\d)\\s+(" + NUM + ")\\s*$"
);
const LINE_START_RE = /^\d+\/\s*[A-Z0-9]+\s+/;
const FOOTER_RE = /^(N° commande|N° BL|Page\s*:|TA BRETAGNE|TA RENNES|\d+ Rue Paul Ricard|35538|SIRET|Tél|Fax|FACTURE N°|AVOIR N°|EXEMPLAIRE|Livré|Code fournisseur|BELLO MIO|Montant HT|TOTAL HT|Echéance|Net à payer|Ligne - Article|Se reporter)/i;

function parseNum(s: string): number | null {
  const n = Number(s.replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const r2 = (v: number) => Math.round(v * 100 + 1e-6) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Fruits (famille F = fruits ET légumes — on départage par le nom)
const FRUITS = [
  "fraise", "framboise", "myrtille", "groseille", "mure", "cassis", "fruit rouge", "fruits rouges",
  "citron", "lime", "orange", "clementine", "mandarine", "pamplemousse", "pomelo", "kumquat",
  "pomme", "poire", "raisin", "melon", "pasteque", "ananas", "mangue", "banane", "kiwi", "figue",
  "peche", "nectarine", "abricot", "cerise", "prune", "mirabelle", "grenade", "litchi", "passion",
  "coco", "rhubarbe", "physalis", "papaye", "fruit",
];

function pomonaCategory(famille: string, name: string): Category | null {
  if (famille === "M") return "maree";
  if (famille !== "F") return null;
  const n = " " + fold(name).replace(/[^a-z0-9 ]+/g, " ") + " ";
  return FRUITS.some((f) => n.includes(" " + f)) ? "fruit" : "legumes_herbes";
}

/**
 * Poids d'une pièce d'après la désignation :
 *   "sac zip 100g" → 100 · "bq 125gX12" → 125 · "plt 800g" → 800
 *   "975/1250g" → 1112 (calibre, milieu de fourchette) · "5K" → 5000
 * Si l'unité facturée est le colis (COL/CT/PLT) et que la désignation
 * donne "125gX12", le poids du colis est 12 × 125 g.
 */
function pieceWeightG(name: string, uf: string): number | null {
  const s = fold(name);
  const range = s.match(/(\d+)\/(\d+)\s*g(?![a-z])/);
  if (range) return Math.round((Number(range[1]) + Number(range[2])) / 2);

  const m = s.match(/(\d+(?:,\d+)?)\s*(kg|k|gr|g)(?:x(\d+))?(?![a-z])/);
  if (!m) return null;
  const q = parseNum(m[1]);
  if (q == null || q <= 0) return null;
  const grams = m[2] === "g" || m[2] === "gr" ? q : q * 1000;
  const mult = m[3] ? Number(m[3]) : 1;
  const perColis = /^(COL|CT|PLT|CAR)$/.test(uf) && mult > 1;
  const w = Math.round(perColis ? grams * mult : grams);
  return w > 0 && w < 50000 ? w : null;
}

function cleanName(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/½/g, "1/2")
    .replace(/¼/g, "1/4")
    .replace(/¾/g, "3/4")
    .trim();
}

/** Ligne origine : "58/67 - Afrique du Sud 6,383 KG" → "58/67 - Afrique du Sud" */
function cleanOrigin(raw: string): string {
  return raw
    .replace(/\s+\d[\d ]*,\d+\s*(KG)?\s*$/i, "") // majoration ou poids brut en fin
    .replace(/\s+\d[\d ]*,\d+\s*(KG)?\s*$/i, "") // les deux peuvent coexister
    .replace(/\s+/g, " ")
    .trim();
}

function extractMeta(text: string): Pick<ParsedInvoice, "invoice_number" | "invoice_date" | "total_ht" | "total_ttc"> & { taxByCode: Map<string, number> } {
  const head = text.match(/(?:FACTURE|AVOIR)\s*N[°º]\s*(\d+)\s+du\s+(\d{2})[.\/](\d{2})[.\/](\d{4})/i);
  const invoice_number = head?.[1] ?? null;
  const invoice_date = head ? `${head[2]}/${head[3]}/${head[4]}` : null;

  const ttcM = text.match(/Net\s+[àa]\s+payer\s*:\s*(-?\d[\d ]*,\d{2})\s*EUR/i);
  const total_ttc = ttcM ? parseNum(ttcM[1]) : null;

  // "TOTAL HT TOTAL TVA …" puis la ligne suivante commence par le total HT
  const htM = text.match(/TOTAL HT\s+TOTAL TVA[^\n]*\n\s*(-?\d[\d ]*,\d{2})\s+(-?\d[\d ]*,\d{2})/i);
  let total_ht = htM ? parseNum(htM[1]) : null;

  // Récapitulatif TVA : "235,74 1 5,50 12,97" → code 1 = 5,5 %
  const taxByCode = new Map<string, number>();
  const recap = text.matchAll(/^\s*(-?\d[\d ]*,\d{2})\s+(\d)\s+(\d{1,2},\d{2})\s+(-?\d[\d ]*,\d{2})\s*$/gm);
  let sumBases = 0;
  let nRecap = 0;
  for (const m of recap) {
    const rate = parseNum(m[3]);
    if (rate != null) taxByCode.set(m[2], rate);
    sumBases += parseNum(m[1]) ?? 0;
    nRecap++;
  }
  if (total_ht == null && nRecap > 0) total_ht = r2(sumBases);
  if (!taxByCode.has("1")) taxByCode.set("1", 5.5);
  if (!taxByCode.has("0")) taxByCode.set("0", 0);

  return { invoice_number, invoice_date, total_ht, total_ttc, taxByCode };
}

function parseLines(text: string, taxByCode: Map<string, number>): ParsedLine[] {
  const rows = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const out: ParsedLine[] = [];

  for (let i = 0; i < rows.length; i++) {
    const m = rows[i].match(LINE_RE);
    if (!m) continue;

    const sku = m[2];
    const name = cleanName(m[3]);
    if (/^FL/i.test(sku) || /^forfait/i.test(name)) continue; // forfait livraison

    const qtyLiv = parseNum(m[4]);
    const ul = m[5];
    const qty = parseNum(m[6]);
    const uf = m[7];
    const pu = parseNum(m[8]);
    const famille = m[9];
    const taxRate = taxByCode.get(m[10]) ?? null;
    const total = parseNum(m[11]);

    // Ligne(s) suivante(s) : origine / producteur, jusqu'à la prochaine ligne produit
    let origin: string | null = null;
    for (let k = 1; k <= 2 && i + k < rows.length; k++) {
      const next = rows[i + k];
      if (LINE_START_RE.test(next) || FOOTER_RE.test(next)) break;
      if (/^\d{3,}\s/.test(next)) continue; // "14480 -LES CHAMPIGNONS DE NORMAN" (code producteur)
      const o = cleanOrigin(next);
      if (o && !/^[\d ,.]+$/.test(o)) { origin = o; break; }
    }

    const unit: "kg" | "pc" = uf === "KG" ? "kg" : "pc";

    // Majoration (décolisage) : MT HT − PU × qté
    let unitPrice = pu;
    const notes: string[] = [];
    if (qtyLiv != null && ul !== uf) notes.push(`livré ${String(qtyLiv).replace(".", ",")} ${ul}`);
    if (origin) notes.push(origin);
    if (pu != null && qty != null && total != null && qty > 0) {
      const diff = r2(total - r2(pu * qty));
      if (Math.abs(diff) >= 0.01) {
        unitPrice = r3(total / qty);
        notes.push(`${diff > 0 ? "majoration" : "remise"} ${String(Math.abs(diff)).replace(".", ",")} € incluse`);
      }
    }

    out.push({
      sku,
      name,
      quantity: qty,
      unit,
      unit_price: unitPrice,
      total_price: total,
      tax_rate: taxRate,
      notes: notes.length ? notes.join(" · ") : null,
      piece_weight_g: unit === "pc" ? pieceWeightG(name, uf) : null,
      piece_volume_ml: null,
      category: pomonaCategory(famille, name),
    });
  }
  return out;
}

export function parsePomonaInvoiceText(text: string): ParsedInvoice {
  const meta = extractMeta(text);
  const lines = parseLines(text, meta.taxByCode);
  return {
    supplier: "POMONA",
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    lines,
    raw_text_preview: text.slice(0, 2000),
  };
}
