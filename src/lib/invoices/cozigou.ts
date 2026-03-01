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
  supplier: "COZIGOU";
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
  const cleaned = t.replace(/\s+/g, "").replace(/[€]/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractMeta(
  text: string
): Pick<ParsedInvoice, "invoice_number" | "invoice_date" | "total_ht" | "total_ttc"> {
  // Numéro de facture: nombre 8-12 chiffres après code client 6 chiffres
  // Ex: "105192\n6020101461\n24/02/26"
  const invoiceBlockMatch = text.match(/^\d{6}\s*\n\s*(\d{8,12})\s*\n\s*(\d{2})\/(\d{2})\/(\d{2})\b/m);

  let invoice_number: string | null = null;
  let invoice_date: string | null = null;

  if (invoiceBlockMatch) {
    invoice_number = invoiceBlockMatch[1];
    invoice_date = `${invoiceBlockMatch[2]}/${invoiceBlockMatch[3]}/20${invoiceBlockMatch[4]}`;
  } else {
    // Fallback: chercher un gros nombre seul
    const invMatch = text.match(/\b(\d{9,12})\b/);
    if (invMatch) invoice_number = invMatch[1];
    // Chercher date DD/MM/YYYY (4 chiffres pour l'année)
    const date4 = text.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
    if (date4) invoice_date = date4[1];
  }

  // Total HT + TVA sur la même ligne: "269.02 47.43"
  // Utilise [ \t]+ (pas \s+) pour ne pas traverser les sauts de ligne
  const htTvaMatch = text.match(/^(\d{2,}\.\d{2})[ \t]+(\d+\.\d{2})[ \t]*$/m);

  let total_ht: number | null = null;
  let total_ttc: number | null = null;

  if (htTvaMatch) {
    const ht = parseFrenchNumber(htTvaMatch[1]);
    const tva = parseFrenchNumber(htTvaMatch[2]);
    if (ht != null) total_ht = ht;
    if (ht != null && tva != null) total_ttc = Math.round((ht + tva) * 100) / 100;
  }

  return { invoice_number, invoice_date, total_ht, total_ttc };
}

// Ancres pour stopper la collecte de noms en remontant (NE PAS mettre \d ici, les noms "70CL..." commencent par un chiffre)
const NAME_STOP_RE =
  /^(DUPAU|SARL|SAS\s|COMMUNAUTE|ADRESSE|Prélèvement|D\s*U\s*P|EXEMPLAIRE|Pénalités|FACTURE\/|FACTURE\s*:|N°\s*Accises|Conditions)/i;

function parseLines(text: string): ParsedLine[] {
  const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);

  // 1. Trouver le bloc de codes: run d'au moins 4 entiers consécutifs de 4-6 chiffres
  let codeStart = -1;
  let codeEnd = -1;

  for (let i = 0; i < rows.length; i++) {
    if (/^\d{4,6}$/.test(rows[i])) {
      let run = 0;
      while (i + run < rows.length && /^\d{4,6}$/.test(rows[i + run])) run++;
      if (run >= 4) {
        codeStart = i;
        codeEnd = i + run - 1;
        break;
      }
    }
  }

  if (codeStart === -1) return [];

  const codes = rows.slice(codeStart, codeEnd + 1);

  // 2. Remonter depuis le bloc de codes pour trouver les noms
  // D'abord sauter les valeurs cas/fut (entiers 1 chiffre)
  let j = codeStart - 1;
  while (j >= 0 && /^\d$/.test(rows[j])) j--;

  // Collecter les noms (lignes avec lettres, ordre inverse → unshift)
  const nameLines: string[] = [];
  while (j >= 0) {
    const r = rows[j];
    if (/^\d$/.test(r)) break; // chiffre seul (numéro de page, cas/fut)
    if (NAME_STOP_RE.test(r)) break;
    if (/^\d{4,}/.test(r) && !/[a-zA-ZÀ-ÿ]/.test(r)) break; // nombre pur long
    if (/[A-Za-zÀ-ÿ°'&]/.test(r)) nameLines.unshift(r);
    j--;
  }

  // 3. Parsing séquentiel par phases après le bloc de codes
  let idx = codeEnd + 1;

  // Phase 1 – col/pack: entiers jusqu'au premier décimal
  const colPackValues: number[] = [];
  while (idx < rows.length) {
    const r = rows[idx];
    if (/^\d+$/.test(r)) {
      colPackValues.push(parseInt(r, 10));
      idx++;
    } else if (r.includes(".")) {
      break;
    } else {
      break;
    }
  }

  const N_delivered = colPackValues.length;
  const N_total = codes.length;
  if (N_delivered === 0) return [];

  // Phase 2 – prix unitaires: N_delivered décimaux
  const unitPrices: number[] = [];
  while (idx < rows.length && unitPrices.length < N_delivered) {
    const r = rows[idx];
    if (/^\d+\.\d+$/.test(r)) {
      const n = parseFrenchNumber(r);
      if (n !== null) unitPrices.push(n);
      idx++;
    } else if (/^\d+$/.test(r)) {
      break; // transition vers TVA
    } else {
      idx++;
    }
  }

  // Phase 3 – codes TVA: N_delivered entiers ≤ 2
  const tvaValues: number[] = [];
  while (idx < rows.length && tvaValues.length < N_delivered) {
    const r = rows[idx];
    if (/^\d+$/.test(r)) {
      const n = parseInt(r, 10);
      if (n <= 2) {
        tvaValues.push(n);
        idx++;
      } else {
        break; // début des contenances
      }
    } else {
      break;
    }
  }

  // Phase 4 – contenances (cl): N_delivered entiers ≥ 60
  const containerValues: number[] = [];
  while (idx < rows.length && containerValues.length < N_delivered) {
    const r = rows[idx];
    if (/^\d+$/.test(r)) {
      const n = parseInt(r, 10);
      if (n >= 60) {
        containerValues.push(n);
        idx++;
      } else {
        break;
      }
    } else if (r.includes(".")) {
      break; // accises/totaux
    } else {
      break;
    }
  }

  // Phase 5 – accises + totaux: décimaux jusqu'à RUPTURE ou texte majuscule
  const accisesAndTotals: number[] = [];
  while (idx < rows.length) {
    const r = rows[idx];
    if (/^\d+\.\d+$/.test(r)) {
      const n = parseFrenchNumber(r);
      if (n !== null && n > 0) accisesAndTotals.push(n);
      idx++;
    } else if (/^[A-Z]/.test(r)) {
      break; // RUPTURE ou adresse
    } else {
      idx++;
    }
  }

  // Les N_delivered dernières valeurs sont les totaux ligne; le reste sont les accises
  const totals = accisesAndTotals.slice(-N_delivered);

  // 4. Construire les lignes
  const lines: ParsedLine[] = [];

  for (let i = 0; i < N_total; i++) {
    const sku = codes[i];
    const name = (nameLines[i] ?? "").trim();
    if (!name) continue;

    if (i >= N_delivered) {
      // Ligne RUPTURE: incluse avec note, prix/qté null
      lines.push({
        sku,
        name,
        quantity: null,
        unit: null,
        unit_price: null,
        total_price: null,
        tax_rate: null,
        notes: "RUPTURE",
        piece_weight_g: null,
        piece_volume_ml: null,
      });
      continue;
    }

    const qty = colPackValues[i] ?? null;
    const unitPrice = unitPrices[i] ?? null;
    const tva = tvaValues[i] ?? null;
    const total = totals[i] ?? null;
    const tax_rate = tva === 1 ? 5.5 : tva === 2 ? 20.0 : null;
    // containerValues[i] est en cl → convertir en ml
    const clVal = containerValues[i] ?? null;
    const pieceVolumeMl = clVal != null ? clVal * 10 : null;

    lines.push({
      sku,
      name,
      quantity: qty,
      unit: "pc",
      unit_price: unitPrice,
      total_price: total,
      tax_rate,
      notes: null,
      piece_weight_g: null,
      piece_volume_ml: pieceVolumeMl,
    });
  }

  // Dédoublonnage
  const seen = new Set<string>();
  const out: ParsedLine[] = [];
  for (const l of lines) {
    const key = [l.sku ?? "", l.name, l.quantity ?? "", l.unit_price ?? "", l.total_price ?? ""].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }

  return out;
}

export function parseCozigouInvoiceText(text: string): ParsedInvoice {
  const meta = extractMeta(text);
  const lines = parseLines(text);

  return {
    supplier: "COZIGOU",
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    lines,
    raw_text_preview: text.slice(0, 2000),
  };
}
