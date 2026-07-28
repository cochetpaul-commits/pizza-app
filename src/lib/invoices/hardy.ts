// Parser pour les factures Maison Hardy (SAS CHEVILLE 35 — code CHEVI35)
// Format : viandes en kg, articles avec code numérique 5 chiffres
// Lignes type :
//   20111 COTES DE VEAU 8 P 3,000 Kg 260820438 23,5000 /Kg 23,9033 /Kg TR 70,50
//   70150 MAGRET DE CANARD SV X1P 10 P 3,918 Kg 260750335 16,5000 /Kg 16,8326 /Kg TR 64,65

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
  supplier: "HARDY";
  invoice_number: string | null;
  invoice_date: string | null; // "DD/MM/YYYY"
  total_ht: number | null;
  total_ttc: number | null;
  lines: ParsedLine[];
  raw_text_preview: string;
};

function parseFrenchNumber(s: string): number | null {
  const cleaned = s
    .replace(/\s+/g, "")
    .replace(/[€]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractMeta(text: string): Pick<ParsedInvoice, "invoice_number" | "invoice_date" | "total_ht" | "total_ttc"> {
  // Numéro facture ou avoir : "Facture 00108746" ou "Avoir 00112671"
  const invoiceMatch = text.match(/(?:Facture|Avoir)\s+(\d{6,})/i);

  // Date facturation : on prend la première date au format DD/MM/YYYY
  // après "Date de facturation". Sinon, première date du document.
  let invoiceDate: string | null = null;
  const dateLabelMatch = text.match(/Date de facturation[\s\S]{0,200}?(\d{2}\/\d{2}\/\d{4})/i);
  if (dateLabelMatch) {
    invoiceDate = dateLabelMatch[1];
  } else {
    const firstDate = text.match(/(\d{2}\/\d{2}\/\d{4})/);
    invoiceDate = firstDate?.[1] ?? null;
  }

  // TOTAL HORS TAXES : 137,66 (or -77,52 for avoirs)
  const htMatch = text.match(/TOTAL\s+HORS\s+TAXES\s*:?\s*(-?[0-9][0-9 .,]*)/i);

  // Ligne récap : "137,66 7,57 145,23 EUR" or "-77,52 -4,26 -81,78 EUR"
  const ttcMatch =
    text.match(/(-?[0-9][0-9 .,]*)\s+(-?[0-9][0-9 .,]*)\s+(-?[0-9][0-9 .,]*)\s+EUR/i);

  return {
    invoice_number: invoiceMatch?.[1] ?? null,
    invoice_date: invoiceDate,
    total_ht: htMatch ? parseFrenchNumber(htMatch[1]) : null,
    total_ttc: ttcMatch ? parseFrenchNumber(ttcMatch[3]) : null,
  };
}

// Lignes à ignorer (frais, totaux, contributions diverses)
const SKIP_LINE_RE = /^(Contribution\s+énergétique|Trait\.\s*des\s+déchets|Interbev\b|TOTAL\b|Conditionnements?\s+exp|BNP\s*:|IBAN\s*:|BIC\s*:|L'entreprise|Article\s+DESIGNATION|Vendeur\b|B\.L\.|Tournée|Commandé\s+par|Facture\s+\d|Avoir\s+\d|D\.avoir\b|Livré\s+le|Date\s+de\s+facturation|VOS\s+REFERENCES|NOS\s+REFERENCES|FACTURER|LIVRER|RESTAURANT|SARL|France|SIRET|SIREN|TVA\s+FR|APE|SAS|Tél|Zone|\d+\s*Place|\d{5}\s+SAINT|TAUX|ECHEANCE|Traite|Papillon|TOTAL\s+H\.T\.|CH-\d|Montant|PIECE$|Avoir\s+sur\s+bl|Client\b)/i;

function parseLines(text: string): ParsedLine[] {
  const tmp: ParsedLine[] = [];

  const rows = text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  // Pattern principal (supports negative quantities for avoirs):
  //   <sku 4-6 digits> <DESIGNATION...> <nombre> P <quantité> Kg <lot> <pu_brut>/Kg <pu_net>/Kg TR <montant>
  const lineRe = /^(\d{4,6})\s+(.+?)\s+(-?\d+(?:[.,]\d+)?)\s+P\s+(-?\d+(?:[.,]\d+)?)\s+(Kg|kg)\s+\d+\s+(\d+(?:[.,]\d+)?)\s*\/Kg\s+(\d+(?:[.,]\d+)?)\s*\/Kg\s+TR\s+(-?\d+(?:[.,]\d+)?)$/i;

  let prevLine = ""; // track previous line for multi-line product names
  for (const r of rows) {
    if (SKIP_LINE_RE.test(r)) { prevLine = ""; continue; }

    const m = r.match(lineRe);
    if (!m) {
      // Not a data line — remember as potential product name for next line
      prevLine = r;
      continue;
    }

    const sku = m[1];
    let name = m[2].trim();
    // If name is just a type code (R, G, M, P, C, A, E) and we have a previous line, use that
    if (/^[RGMPCA E]{1,2}$/.test(name) && prevLine) {
      name = prevLine.trim();
    }
    const qty = parseFrenchNumber(m[4]);
    const unitPriceNet = parseFrenchNumber(m[7]); // P.U. Net = prix réellement payé
    const totalPrice = parseFrenchNumber(m[8]);

    tmp.push({
      sku,
      name,
      quantity: qty,
      unit: "kg",
      unit_price: unitPriceNet,
      total_price: totalPrice,
      tax_rate: 5.5,
      notes: null,
      piece_weight_g: null,
      piece_volume_ml: null,
    });
    prevLine = "";
  }

  // Déduplication (sku + name)
  const seen = new Set<string>();
  const out: ParsedLine[] = [];
  for (const l of tmp) {
    const key = `${l.sku ?? ""}|${l.name}|${l.quantity ?? ""}|${l.unit_price ?? ""}|${l.total_price ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }

  return out;
}

export function parseHardyInvoiceText(text: string): ParsedInvoice {
  const meta = extractMeta(text);
  const lines = parseLines(text);

  return {
    supplier: "HARDY",
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    lines,
    raw_text_preview: text.slice(0, 2000),
  };
}
