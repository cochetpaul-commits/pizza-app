import type { ParsedInvoice } from "@/lib/invoices/importEngine";
import { extractWeightGFromName, extractVolumeFromName } from "./utils";

/**
 * Cafés Celtik (torréfacteur, Saint-Briac) — factures « 26-CFA05174 ».
 * Texte extrait (pdfToText), une ligne par article après l'en-tête
 * « Référence Désignation Qté P.U. HT Remise P.U. Net Montant HT » :
 *   BELLO_MIO BLEND BELLO MIO KG FR-BIO-01 6,00 20,750 20,750 124,50 € C55
 *   SAV FORFAIT ENTRETIEN -SAN REMO VERONA 1,00 105,000 105,000 105,00 € C20
 * - « … KG … » : la quantité est un poids et le P.U. est au kilo → unit "kg"
 *   (la note « prix au kg (poids variable) » empêche le moteur de rediviser par un poids).
 * - Les lignes SAV (« FORFAIT ENTRETIEN », « FORFAIT SAV ») sont des frais d'entretien machine :
 *   elles restent dans le parse (total cohérent) mais le moteur les écarte (estLigneDeFrais).
 * - Client 0P501709 = Bello Mio, 0P501777 = Piccola Mia (voir clientLuSurFacture).
 */
type Line = ParsedInvoice["lines"][number];

const n = (s: string): number => Number(s.replace(/\s/g, "").replace(",", "."));
const LINE_RE = /^(\S+)\s+(.+?)\s+(-?\d[\d ]*,\d{2})\s+(-?\d[\d ]*,\d{3})\s+(?:(-?\d[\d ]*,\d{3})\s+)?(-?\d[\d ]*,\d{3})\s+(-?\d[\d ]*,\d{2})\s*€(?:\s+C(\d{2}))?\s*$/;
const HEADER_RE = /^Référence\s+Désignation/i;
const END_RE = /^(Exemplaire provisoire|Toute palette|Base\s+Taux|Total HT|Port & Embal)/i;

export function parseCeltikInvoiceText(text: string): ParsedInvoice {
  const rows = text.split(/\r?\n/).map((r) => r.replace(/\s+/g, " ").trim());
  const numero = /Facture N°\s*([0-9A-Z-]+)/i.exec(text)?.[1] ?? null;
  const date = /\bDate\s+(\d{2}\/\d{2}\/\d{4})/.exec(text)?.[1] ?? null;
  const ht = /Total HT\s+(-?\d[\d ]*,\d{2})\s*€/.exec(text)?.[1];
  const ttc = /Net à payer\s+(-?\d[\d ]*,\d{2})\s*€/.exec(text)?.[1] ?? /Total TTC\s+(-?\d[\d ]*,\d{2})\s*€/.exec(text)?.[1];
  const estAvoir = /\bAVOIR\b/i.test(text.slice(0, 400));

  const lines: Line[] = [];
  let dans = false;
  for (const row of rows) {
    if (!row) continue;
    if (HEADER_RE.test(row)) { dans = true; continue; }
    if (!dans) continue;
    if (END_RE.test(row)) { dans = false; continue; }
    const m = LINE_RE.exec(row);
    if (!m) continue; // suite de désignation SAV (« -JOINTS / DOUCHETTES ») : ignorée
    const [, sku, name, qte, , , puNet, montant, taxe] = m;
    const auKilo = /\bKG\b/i.test(name) && !/\d\s*G\b/i.test(name);
    const sgn = estAvoir ? -1 : 1;
    lines.push({
      sku, name: name.trim(), quantity: sgn * n(qte), unit: auKilo ? "kg" : "pc",
      unit_price: n(puNet), total_price: sgn * n(montant), tax_rate: taxe ? Number(taxe) / (taxe === "55" ? 10 : 1) : null,
      notes: auKilo ? "prix au kg (poids variable)" : null,
      piece_weight_g: auKilo ? null : extractWeightGFromName(name), piece_volume_ml: extractVolumeFromName(name),
    });
  }
  return {
    supplier: "CAFES CELTIK", invoice_number: numero, invoice_date: date,
    total_ht: ht != null ? (estAvoir ? -1 : 1) * n(ht) : null, total_ttc: ttc != null ? (estAvoir ? -1 : 1) * n(ttc) : null,
    lines, raw_text_preview: text.slice(0, 2000),
  } as ParsedInvoice;
}
