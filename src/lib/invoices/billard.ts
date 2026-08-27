import type { Category } from "@/types/ingredients";

/**
 * Parser factures Le Père Billard (poissonnerie, Saint-Malo — Bello Mio).
 *
 * Relevé mensuel : une ligne par livraison, datée dans le libellé :
 *   "HOMARD VIVANT 4/600 LE 22/07 4,72 kg 28,90 € 136,41 € 5,50%"
 *   "POULPE le 02/06 7,30 kg 12,90 € 94,17 € 5,50%"
 *
 * Le nom retenu est le libellé SANS la date (« HOMARD VIVANT 4/600 ») pour
 * un rattachement stable ; la date part en note. Un même produit livré
 * plusieurs fois = plusieurs lignes (comme sur la facture) ; l'offre de
 * prix retenue par l'import est celle de la dernière ligne (chronologique).
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
  supplier: "BILLARD";
  invoice_number: string | null;
  invoice_date: string | null; // "DD/MM/YYYY"
  total_ht: number | null;
  total_ttc: number | null;
  lines: ParsedLine[];
  raw_text_preview: string;
};

function parseFr(s: string): number | null {
  const n = Number(s.replace(/\s+/g, "").replace(/€/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// "LIBELLÉ  QTÉ  UNITÉ  PU €  MONTANT €  TVA%"
const LINE_RE = /^(.+?)\s+(\d[\d ]*(?:,\d+)?)\s+(kg|pi[eè]ces?|pce|unit[ée]s?|u|lot|douzaines?|bq|barquettes?)\s+(-?\d[\d ]*,\d{2})\s*€\s+(-?\d[\d ]*,\d{2})\s*€\s+(\d{1,2},\d{2})\s*%$/i;
// Date de livraison dans le libellé : "LE 22/07", "le 02/06"
const DATE_IN_NAME = /\s+le\s+(\d{1,2}\/\d{1,2})\s*$/i;
const SKIP = /^(Libellé\b|FACTURE$|SARL LE PERE|Poissonnerie|N° :|Date d|35400|FRANCE|Siret|N° TVA|N° client|SASHA|3 PLACE|Port\.|Email|Monsieur|CORSAIRE MAREE|Page \d|Type de vente|Détail de la TVA|Code Base|Réduite|Conditions|Échéance|Echeance|IBAN|BIC)/i;

export function parseBillardInvoiceText(text: string): ParsedInvoice {
  const invM = text.match(/N°\s*:\s*(FAC\d+)/i);
  const dateM = text.match(/Date d'émission\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const htM = text.match(/Total HT\s+(-?\d[\d ]*,\d{2})\s*€/i);
  const ttcM = text.match(/Total TTC\s+(-?\d[\d ]*,\d{2})\s*€/i);

  const lines: ParsedLine[] = [];
  for (const rowRaw of text.split(/\r?\n/)) {
    const row = rowRaw.trim();
    if (!row || SKIP.test(row)) continue;
    const m = row.match(LINE_RE);
    if (!m) continue;

    let name = m[1].replace(/\s+/g, " ").trim();
    let note: string | null = null;
    const d = name.match(DATE_IN_NAME);
    if (d) {
      note = `livré le ${d[1]}`;
      name = name.replace(DATE_IN_NAME, "").trim();
    }
    if (!name) continue;

    const qty = parseFr(m[2]);
    const unitRaw = m[3].toLowerCase();
    const unit: "kg" | "pc" = unitRaw === "kg" ? "kg" : "pc";
    const pu = parseFr(m[4]);
    const total = parseFr(m[5]);
    const tva = parseFr(m[6]);

    lines.push({
      sku: null,
      name,
      quantity: qty,
      unit,
      unit_price: pu,
      total_price: total,
      tax_rate: tva,
      notes: note,
      piece_weight_g: null,
      piece_volume_ml: null,
      category: "maree",
    });
  }

  return {
    supplier: "BILLARD",
    invoice_number: invM?.[1] ?? null,
    invoice_date: dateM?.[1] ?? null,
    total_ht: htM ? parseFr(htM[1]) : null,
    total_ttc: ttcM ? parseFr(ttcM[1]) : null,
    lines,
    raw_text_preview: text.slice(0, 2000),
  };
}
