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
  supplier: "METRO";
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


function extractMeta(text: string): Pick<ParsedInvoice, "invoice_number" | "invoice_date" | "total_ht" | "total_ttc"> {
  const invoiceMatch = text.match(/N[\xb0\xba]\s*FACTURE\s+([0-9\/()A-Z]+)/i);
  const dateMatch = text.match(/Date\s+facture\s*:\s*(\d{2}-\d{2}-\d{4})/i);
  const htMatch = text.match(/Total\s+H\.?T\.?\s*[: ]+([0-9][0-9\s.,]*)/i);
  const ttcMatch = text.match(/Total\s+[àa]\s+payer\s+([0-9][0-9\s.,]*)/i);
  return {
    invoice_number: invoiceMatch?.[1]?.trim() ?? null,
    invoice_date: dateMatch?.[1] ?? null,
    total_ht: htMatch ? parseFrenchNumber(htMatch[1]) : null,
    total_ttc: ttcMatch ? parseFrenchNumber(ttcMatch[1]) : null,
  };
}

function parseLines(text: string): ParsedLine[] {
  const rows = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const tmp: ParsedLine[] = [];
  const taxMap: Record<string, number> = { A: 2.1, B: 5.5, D: 20.0 };

  for (const r of rows) {
    // EAN NUM NOM PRIX_UNIT QTE COLISAGE MONTANT TVA — montant = prix × qté × colisage
    const lineMatch = r.match(/^\d{8,13}\s+(\d{7})\s+(.+?)\s+([\d,]+)\s+(\d+)\s+(\d+)\s+([\d,]+)\s+([ABD])(?:\s+[A-Z])*\s*$/i);
    if (!lineMatch) {
      // Remise / promo rattachée à la ligne PRÉCÉDENTE : « 4 POUR 3 8,47- »,
      // « Offre Achetez Plus Payez Moins 2,10- » (montant suivi d'un tiret).
      // Sans ça, la somme des lignes dépassait le total HT de la remise.
      const promo = r.match(/^(?!\d{8,13}\s)(.+?)\s+(\d{1,3}(?:[ .]\d{3})*,\d{2})-\s*$/);
      if (promo && tmp.length > 0) {
        const remise = parseFrenchNumber(promo[2]) ?? 0;
        const prev = tmp[tmp.length - 1];
        prev.total_price = Math.round(((prev.total_price ?? 0) - remise) * 100) / 100;
        if (prev.quantity && prev.quantity > 0) prev.unit_price = Math.round((prev.total_price / prev.quantity) * 1000) / 1000;
        prev.notes = [prev.notes, `${promo[1].trim()} −${remise.toFixed(2)} €`].filter(Boolean).join(" · ");
        continue;
      }
      // VAP = vente au poids : EAN NUM NOM POIDS PRIX_KG QTE MONTANT TVA
      // (4 nombres apres le nom, pas de colisage). Distingué de PIECE via
      // 2 décimaux consécutifs au lieu de dec/int/int/dec.
      const vapMatch = r.match(/^\d{8,13}\s+(\d{7})\s+(.+?)\s+(\d+,\d+)\s+(\d+,\d+)\s+(\d+)\s+([\d,]+)\s+([ABD])(?:\s+[A-Z])*\s*$/i);
      if (vapMatch) {
        tmp.push({ sku: vapMatch[1], name: vapMatch[2].trim(), quantity: parseFrenchNumber(vapMatch[5]), unit: "kg", unit_price: parseFrenchNumber(vapMatch[4]), total_price: parseFrenchNumber(vapMatch[6]), tax_rate: taxMap[vapMatch[7].toUpperCase()] ?? null, notes: "VAP=" + vapMatch[3], piece_weight_g: null, piece_volume_ml: null });
      }
      continue;
    }

    const name = lineMatch[2].trim();

    // Déterminer unité et volumes/poids
    let unit: "pc" | "kg" = "pc";
    let pieceWeightG: number | null = null;
    let pieceVolumeMl: number | null = null;

    if (/\b\d+(?:[.,]\d+)?\s*kg\b/i.test(name)) {
      // Prix au kg (vrac ou produit facturé au kg)
      unit = "kg";
    } else {
      // Bouteilles / contenants : extraire le volume, garder unit="pc"
      // Le prix facturé est TOUJOURS par unité (par bouteille), jamais par litre
      pieceVolumeMl = extractVolumeFromName(name);
      if (pieceVolumeMl == null) {
        pieceWeightG = extractWeightGFromName(name);
      }
    }

    const qte = parseFrenchNumber(lineMatch[4]) ?? 1;
    const colisage = parseFrenchNumber(lineMatch[5]) ?? 1;
    tmp.push({
      sku: lineMatch[1],
      name,
      // Unités réellement facturées (le prix unitaire est par unité, pas par carton)
      quantity: qte * (colisage > 0 ? colisage : 1),
      unit,
      unit_price: parseFrenchNumber(lineMatch[3]),
      total_price: parseFrenchNumber(lineMatch[6]),
      tax_rate: taxMap[lineMatch[7].toUpperCase()] ?? null,
      notes: null,
      piece_weight_g: pieceWeightG,
      piece_volume_ml: pieceVolumeMl,
    });
  }

  const seen = new Set<string>();
  const out: ParsedLine[] = [];
  for (const l of tmp) {
    const key = [l.sku ?? "", l.name, l.quantity ?? "", l.unit ?? "", l.unit_price ?? "", l.total_price ?? ""].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

export function parseMetroInvoiceText(text: string): ParsedInvoice {
  const meta = extractMeta(text);
  const lines = parseLines(text);

  return {
    supplier: "METRO",
    invoice_number: meta.invoice_number,
    invoice_date: meta.invoice_date,
    total_ht: meta.total_ht,
    total_ttc: meta.total_ttc,
    lines,
    raw_text_preview: text.slice(0, 2000),
  };
}
