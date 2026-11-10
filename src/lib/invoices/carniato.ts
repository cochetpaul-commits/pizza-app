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
  supplier: "CARNIATO";
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

function extractMeta(
  text: string
): Pick<ParsedInvoice, "invoice_number" | "invoice_date" | "total_ht" | "total_ttc"> {
  // Invoice number + date: "200937598 29667 11.02.2026 ..."
  const pieceMatch = text.match(/\b(\d{8,10})\s+\d{4,6}\s+(\d{2})\.(\d{2})\.(\d{4})\b/);
  const invoice_number = pieceMatch ? pieceMatch[1] : null;
  const invoice_date = pieceMatch
    ? `${pieceMatch[2]}/${pieceMatch[3]}/${pieceMatch[4]}`
    : null;

  // Total HT + TVA from VENTILATION summary line:
  // "TOTAL 12,70 1537,10 1537,10 1549,80 160,35"
  // or "14 ATTESTATION FACTURE TOTAL 10,64 1385,33 1385,33 1395,97 220,27 ..."
  const totalMatch = text.match(
    /TOTAL\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/
  );
  let total_ht: number | null = null;
  let total_ttc: number | null = null;
  if (totalMatch) {
    const ht = parseFrenchNumber(totalMatch[4]);
    const tva = parseFrenchNumber(totalMatch[5]);
    if (ht != null) total_ht = ht;
    if (ht != null && tva != null) total_ttc = Math.round((ht + tva) * 100) / 100;
  }

  return { invoice_number, invoice_date, total_ht, total_ttc };
}

// Product line tail: QTY PU A[24] MONTANT 8 EAN_DIGITS...
// EAN can be 8 or 13 digits, split with spaces: "8 002172 8" or "8 002010 680458"
const TAIL_RE = /(.*)\s(\d+)\s+([\d,]+)\s+(A[24])\s+([\d,]+)\s+8\s+\d{3,6}(?:\s+\d{1,6})?$/;

// Lines that are clearly not product continuations (page headers, footers, noise)
const NOISE_RE = /^(CONDITIONS|VOIR|VENTILATION|DROITS|MARCHANDISES|ATTESTATION|TOTAL|NB\.|VOL\.|VIGNETTE|RETARDS|AVIS|RECOMMANDATIONS|EXPEDITEUR|FACTURE|SIRET|COMMENTAIRES|NBRE|CODE\s+PR|CART\.|REMISES|RUM|IBAN|^\d{5}\s+SAINT|BONNEUIL|RUNGIS|^\*{3}|^-{3}|^N[°º]|^BL\s+N|REGLEMENT|HORS\s+TAXE|T\.V\.A|T\.T\.C|Société|BELLO|PICCOLA|FRATELLI|PLACE|FRANCE|SAINT\s+MALO|facture@|TVA\s*:|ACCISES|DOCUMENT\s+SIMP|COMMERCIAL|CONTROLE|Siège|Tel\s*:|Fax|E-mail|capital|R\.C\.S|Entrepôt|internet|LME\s+du)/i;

function parseLines(text: string): ParsedLine[] {
  const rows = text.split(/\r?\n/);

  // Product entries are between "BL N°..." and end of products
  const SECTION_START_RE = /^BL\s+N°/;
  const SECTION_END_RE = /^(LME\s+du|VOIR\s+CONDITIONS)/i;
  // Each entry starts with: CODE 01NAME...
  const PROD_START_RE = /^(\d{4,6})\s+01(.*)$/;

  const entries: Array<{ sku: string; lines: string[] }> = [];
  let currentEntry: { sku: string; lines: string[] } | null = null;
  let inProducts = false;
  for (const row of rows) {
    const trimmed = row.trim();

    if (!inProducts) {
      if (SECTION_START_RE.test(trimmed)) {
        inProducts = true;
      }
      continue;
    }

    // End of a product section
    if (SECTION_END_RE.test(trimmed)) {
      if (currentEntry) entries.push(currentEntry);
      currentEntry = null;
      inProducts = false; // allow finding the next section (page 2)
      continue;
    }

    const m = PROD_START_RE.exec(trimmed);
    if (m) {
      if (currentEntry) entries.push(currentEntry);
      currentEntry = { sku: m[1], lines: [m[2].trim()] };
    } else if (currentEntry && trimmed) {
      // Real continuations are short name parts immediately after: "DOC 0,75", "SICILIA"
      // Stop collecting as soon as we see anything that isn't a short name part
      const isNamePart = trimmed.length < 25 && /[A-Za-z]/.test(trimmed) && !NOISE_RE.test(trimmed) && currentEntry.lines.length <= 2;
      if (isNamePart) {
        currentEntry.lines.push(trimmed);
      } else {
        // Not a continuation — finalize entry and stop collecting
        entries.push(currentEntry);
        currentEntry = null;
      }
    }
  }

  if (currentEntry) entries.push(currentEntry);

  const result: ParsedLine[] = [];

  for (const entry of entries) {
    // Strategy: try TAIL_RE on the first line alone first (handles multi-line
    // entries where continuation text like "DOC 0,75" comes AFTER the EAN).
    // If that fails, join all lines and try again.
    let tail = TAIL_RE.exec(entry.lines[0]);
    let nameSuffix = "";
    if (tail) {
      // Continuation lines are just name parts (e.g., "DOC 0,75", "0,75L", "SICILIA")
      // Only keep short ones that look like real name parts, not page footer noise
      if (entry.lines.length > 1) {
        const parts = entry.lines.slice(1)
          .filter((l) => l.length < 30 && !NOISE_RE.test(l));
        if (parts.length > 0) nameSuffix = " " + parts.join(" ").trim();
      }
    } else {
      // Try joined text
      const fullText = entry.lines.join(" ").trim();
      tail = TAIL_RE.exec(fullText);
      if (!tail) continue;
    }

    const prefix = tail[1]; // name + leading numeric noise
    const qty = parseInt(tail[2], 10);
    const pu = parseFrenchNumber(tail[3]);
    const tvaCode = tail[4]; // "A2" or "A4"
    const montant = parseFrenchNumber(tail[5]);
    const taxRate = tvaCode === "A2" ? 20.0 : 5.5;

    // Strip trailing pure-numeric tokens (e.g., NBRE, PAR, PRIX, VOL, ALC columns)
    const tokens = prefix.split(/\s+/);
    while (tokens.length > 0) {
      const last = tokens[tokens.length - 1];
      if (/^[\d,]+$/.test(last)) {
        tokens.pop();
      } else {
        break;
      }
    }
    let name = tokens.join(" ").trim();
    // Append continuation suffix (e.g., "DOC 0,75") to name
    if (nameSuffix) {
      // Clean suffix: remove pure numeric parts that are not volume/weight info
      const cleanSuffix = nameSuffix.trim();
      if (cleanSuffix && !/^\d+$/.test(cleanSuffix)) {
        name += " " + cleanSuffix;
      }
    }
    name = name.replace(/\s+/g, " ").trim();
    if (!name) continue;

    // Coût = montant HT de la ligne ÷ quantité : droits d'accises INCLUS (règle Pierre 23/09, comme Cozigou).
    // Le P.U. imprimé est hors droits ; on le garde en note.
    const puDroitsInclus = montant != null && qty > 0 ? Math.round((montant / qty) * 10000) / 10000 : pu;
    result.push({
      sku: entry.sku,
      name,
      quantity: qty,
      unit: "pc",
      unit_price: puDroitsInclus,
      total_price: montant,
      tax_rate: taxRate,
      notes: pu != null && puDroitsInclus != null && Math.abs(pu - puDroitsInclus) > 0.0001 ? `droits inclus (P.U. hors droits ${pu})` : null,
      piece_weight_g: null,
      piece_volume_ml: null,
    });
  }

  return result;
}

/** Colonne SERVICES du bloc TVA (participation transport, frais fixes) : « A3 15,44 15,44 20,00 » */
function extractServices(text: string): number | null {
  const m = text.match(/\bA3\s+([\d\s,]+?)\s+([\d\s,]+?)\s+20,00\b/);
  return m ? parseFrenchNumber(m[1].replace(/\s/g, "")) : null;
}

/**
 * Facture électronique (10/11/2026) : depuis la réforme, Carniato envoie du XML ; la plateforme en fait un PDF au
 * gabarit commun (« Facture électronique reçue au format XML uniquement »). Chaque produit tient sur quatre lignes :
 *   « 12.0 DROITS: » · « 000000000000020410 7,50 € 20.00 90,38 € » · « Pièce +0,38 € » · « MONTEPULCIANO ABRUZZO DOC 0,75 »
 * Le total de ligne comprend les droits d'accises ; les frais (« SERVICES +59,77 € ») font une ligne à part.
 */
const E_FACTURE_RE = /Facture électronique reçue au format XML|Identifiant de spécification/i;
const E_LIGNE_RE = /^0*(\d{3,8})\s+(-?[\d\s]+,\d{2,4})\s*€\s+(?:(?:-|[\d.,]+\s*%)\s+)?(\d{1,2}[.,]\d{1,2})\s+(-?[\d\s]+,\d{2})\s*€$/;

function parseEFacture(text: string): ParsedInvoice {
  const rows = text.split(/\r?\n/).map((r) => r.trim());
  const montant = (re: RegExp) => { const m = text.match(re); return m ? parseFrenchNumber(m[1].replace(/\s/g, "")) : null; };
  const lines: ParsedLine[] = [];
  for (let i = 0; i < rows.length; i++) {
    const m = E_LIGNE_RE.exec(rows[i]);
    if (!m) continue;
    // Quantité : la ligne du dessus (« 168.0 », « 12.0 DROITS: »)
    let qty: number | null = null;
    for (let k = i - 1; k >= Math.max(0, i - 2) && qty == null; k--) { const q = /^(-?\d+(?:[.,]\d+)?)(?:\s+DROITS\s*:?)?$/i.exec(rows[k]); if (q) qty = Number(q[1].replace(",", ".")); }
    // Unité puis nom : les lignes du dessous (« Pièce +0,38 € », puis le libellé)
    let k = i + 1;
    const uniteBrute = rows[k] ?? "";
    const estUnite = /^(Pi[èe]ce|Kilogramme|Litre|Unit[ée]|Colis|Carton|Bouteille)\b/i.test(uniteBrute);
    if (estUnite) k++;
    const name = (rows[k] ?? "").replace(/\s+/g, " ").trim();
    if (!name || E_LIGNE_RE.test(name) || /^(SERVICES|Sous-total)/i.test(name)) continue;
    const pu = parseFrenchNumber(m[2].replace(/\s/g, ""));
    const total = parseFrenchNumber(m[4].replace(/\s/g, ""));
    const taux = Number(m[3].replace(",", "."));
    // Coût = total de ligne ÷ quantité, droits d'accises inclus (même règle que l'ancien format)
    const puDroitsInclus = total != null && qty != null && qty > 0 ? Math.round((total / qty) * 10000) / 10000 : pu;
    const unit: ParsedLine["unit"] = /^Kilo/i.test(uniteBrute) ? "kg" : /^Litre/i.test(uniteBrute) ? "l" : "pc";
    lines.push({
      sku: m[1], name, quantity: qty, unit, unit_price: puDroitsInclus, total_price: total, tax_rate: taux,
      notes: pu != null && puDroitsInclus != null && Math.abs(pu - puDroitsInclus) > 0.0001 ? `droits inclus (P.U. hors droits ${pu})` : null,
      piece_weight_g: null, piece_volume_ml: null,
    });
  }
  const total_ht = montant(/Total HT\s+(-?[\d\s]+,\d{2})\s*€/i);
  const total_ttc = montant(/Total TTC\s+(-?[\d\s]+,\d{2})\s*€/i) ?? montant(/Montant à payer\s+(-?[\d\s]+,\d{2})\s*€/i);
  // Frais (transport, frais fixes) : une ligne de frais, jamais une fiche ni une offre, pour recoller au total HT
  const services = montant(/^SERVICES\s+\+?(-?[\d\s]+,\d{2})\s*€/im) ?? montant(/Total frais\s+(-?[\d\s]+,\d{2})\s*€/i);
  if (services != null && services > 0) {
    const somme = lines.reduce((a, l) => a + (l.total_price ?? 0), 0);
    if (total_ht == null || Math.abs(somme + services - total_ht) < 0.02) {
      lines.push({ sku: "FRAIS", name: "PARTICIPATION TRANSPORT (frais)", quantity: 1, unit: "pc", unit_price: services, total_price: services, tax_rate: 20, notes: "frais | TVA=20", piece_weight_g: null, piece_volume_ml: null });
    }
  }
  const num = text.match(/Num[ée]ro\s+(\d{6,12})/i);
  const date = text.match(/Date d[’']émission\s+(\d{2}\/\d{2}\/\d{4})/i);
  return { supplier: "CARNIATO", invoice_number: num ? num[1].replace(/^0+/, "") : null, invoice_date: date ? date[1] : null, total_ht, total_ttc, lines, raw_text_preview: text.slice(0, 2000) };
}

export function parseCarniatoInvoiceText(text: string): ParsedInvoice {
  if (E_FACTURE_RE.test(text)) return parseEFacture(text);
  const meta = extractMeta(text);
  const lines = parseLines(text);
  // Participation transport / frais fixes (colonne SERVICES) : une ligne de frais, jamais une fiche ni une offre,
  // pour que la somme des lignes recolle au total HT (201009732 : 114,00 + 15,44).
  const services = extractServices(text);
  if (services != null && services > 0 && meta.total_ht != null) {
    const somme = lines.reduce((a, l) => a + (l.total_price ?? 0), 0);
    if (Math.abs(somme + services - meta.total_ht) < 0.02) {
      lines.push({ sku: "FRAIS", name: "PARTICIPATION TRANSPORT (frais)", quantity: 1, unit: "pc", unit_price: services, total_price: services, tax_rate: 20, notes: "frais | TVA=20", piece_weight_g: null, piece_volume_ml: null });
    }
  }

  return {
    supplier: "CARNIATO",
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    lines,
    raw_text_preview: text.slice(0, 2000),
  };
}
