import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** Parse French decimal "1 234,56" or "1234.56" → number */
function parseNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/\s/g, "").replace(/\u00a0/g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Parse Popina datetime "02/03/2026 23:09:05" → ISO string */
function parseDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? "00"}+01:00`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Extract just YYYY-MM-DD */
function extractDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

/** Deduce service from hour */
function deduceService(dateStr: string | null): string {
  if (!dateStr) return "soir";
  const h = new Date(dateStr).getHours();
  return h < 16 ? "midi" : "soir";
}

/** Calculate HT from TTC and tax rate */
function calcHT(ttc: number, taxRate: number): number {
  if (!taxRate || taxRate <= 0) return ttc;
  return Math.round((ttc / (1 + taxRate / 100)) * 100) / 100;
}

/** Detect file format */
function detectFormat(rows: unknown[][]): "commandes" | "products" {
  const first = rows[0] as string[];
  if (first && String(first[0] ?? "").toLowerCase() === "jour") return "products";
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] as string[];
    if (row && row[0] && String(row[0]).includes("Ouvert")) return "commandes";
  }
  return "commandes";
}

// ── Format "commandes" (export-commandes_*.xlsx) ──
function parseCommandes(rows: unknown[][], etablissementId: string, fileName: string) {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] as string[];
    if (row && row[0] && String(row[0]).includes("Ouvert")) { headerIdx = i; break; }
  }
  if (headerIdx === -1) throw new Error("Format invalide — colonne 'Ouvert à' introuvable");

  const dataRows = rows.slice(headerIdx + 1).filter(r => {
    const row = r as unknown[];
    return row[0] && String(row[0]).trim() !== "";
  });

  return dataRows.map(row => {
    const r = row as unknown[];
    const ouvertA = parseDate(r[0]);
    const typeLigne = String(r[11] || "");
    // Skip Paiement and Total lines
    if (typeLigne === "Paiement" || typeLigne === "Total") return null;
    return {
      etablissement_id: etablissementId,
      ouvert_a: ouvertA,
      ferme_a: parseDate(r[1]),
      date_service: extractDate(ouvertA),
      service: deduceService(ouvertA),
      salle: String(r[2] || ""),
      table_num: String(r[3] || ""),
      couverts: parseInt(String(r[4] || "0")) || 0,
      num_fiscal: String(r[5] || ""),
      statut: String(r[6] || ""),
      client: String(r[7] || ""),
      operateur: String(r[8] || "").trim(),
      categorie: String(r[9] || ""),
      sous_categorie: String(r[10] || ""),
      type_ligne: "Produit",
      description: String(r[12] || ""),
      menu: String(r[13] || ""),
      quantite: parseInt(String(r[14] || "1")) || 1,
      tarification: String(r[15] || ""),
      annule: String(r[16]).toLowerCase() === "true",
      raison_annulation: String(r[17] || ""),
      perdu: String(r[18]).toLowerCase() === "true",
      raison_perte: String(r[19] || ""),
      transfere: String(r[20]).toLowerCase() === "true",
      taux_tva: String(r[21] || ""),
      prix_unitaire: parseNum(r[22]),
      remise_totale: parseNum(r[23]),
      ttc: parseNum(r[24]),
      tva: parseNum(r[25]),
      ht: parseNum(r[26]),
      import_file: fileName,
    };
  }).filter(Boolean) as Record<string, unknown>[];
}

// ── Format "products" (popina_export_products_*.xlsx) ──
function parseProducts(rows: unknown[][], etablissementId: string, fileName: string) {
  // Header at row 0: jour, caisse, ticket, ticket, fiscal, salle, table, serveur, date, parent, cat, name, unit, tier, tax, quantity, cancelled, transferred, brut
  const dataRows = rows.slice(1).filter(r => {
    const row = r as unknown[];
    const jour = String(row[0] || "");
    return jour !== "" && jour !== "Total";
  });

  return dataRows.map(row => {
    const r = row as unknown[];
    const parent = String(r[9] || "").trim();
    // Skip lines without category (payment lines, totals)
    if (!parent) return null;

    const caisse = parseDate(r[1]);
    const ferme = parseDate(r[3]);
    const ttc = parseNum(r[18]); // brut = TTC
    const taxRate = parseNum(r[14]);
    const ht = calcHT(ttc, taxRate);
    const qty = parseInt(String(r[15] || "1")) || 1;
    const unitPrice = parseNum(r[12]);

    return {
      etablissement_id: etablissementId,
      ouvert_a: caisse,
      ferme_a: ferme,
      date_service: extractDate(caisse),
      service: deduceService(caisse),
      salle: String(r[5] || ""),
      table_num: String(r[6] || ""),
      couverts: 0, // not available in this format — will be estimated from tickets
      num_fiscal: String(r[4] || ""),
      statut: "Payé",
      client: "",
      operateur: String(r[7] || "").trim(),
      categorie: parent,
      sous_categorie: String(r[10] || ""),
      type_ligne: "Produit",
      description: String(r[11] || "").trim(),
      menu: "",
      quantite: qty,
      tarification: String(r[13] || ""),
      annule: r[16] === true || String(r[16]).toLowerCase() === "true",
      raison_annulation: "",
      perdu: false,
      raison_perte: "",
      transfere: r[17] === true || String(r[17]).toLowerCase() === "true",
      taux_tva: taxRate ? `${taxRate}\u00a0%` : "",
      prix_unitaire: unitPrice,
      remise_totale: 0,
      ttc,
      tva: Math.round((ttc - ht) * 100) / 100,
      ht,
      import_file: fileName,
    };
  }).filter(Boolean) as Record<string, unknown>[];
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const etablissementId = formData.get("etablissement_id") as string | null;

    if (!file) return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    if (!etablissementId) return NextResponse.json({ error: "etablissement_id manquant" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    const format = detectFormat(rows);
    let insertRows: Record<string, unknown>[];

    if (format === "products") {
      insertRows = parseProducts(rows, etablissementId, file.name);
    } else {
      insertRows = parseCommandes(rows, etablissementId, file.name);
    }

    // Filter out rows with missing required fields
    insertRows = insertRows.filter(r => r.ouvert_a && r.date_service);

    if (insertRows.length === 0) {
      return NextResponse.json({ error: "Aucune ligne de données trouvée" }, { status: 400 });
    }

    // Determine date range for dedup
    const dates = new Set<string>();
    for (const r of insertRows) {
      if (r.date_service) dates.add(r.date_service as string);
    }
    const dateList = Array.from(dates).sort();
    const minDate = dateList[0];
    const maxDate = dateList[dateList.length - 1];

    // Delete existing data for this date range + establishment
    if (minDate && maxDate) {
      await supabase
        .from("ventes_lignes")
        .delete()
        .eq("etablissement_id", etablissementId)
        .gte("date_service", minDate)
        .lte("date_service", maxDate);
    }

    // Insert in batches
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < insertRows.length; i += BATCH) {
      const batch = insertRows.slice(i, i + BATCH);
      const { error } = await supabase.from("ventes_lignes").insert(batch);
      if (error) {
        return NextResponse.json({
          error: `Erreur batch ${Math.floor(i / BATCH) + 1}: ${error.message}`,
          inserted, format,
        }, { status: 500 });
      }
      inserted += batch.length;
    }

    return NextResponse.json({
      ok: true,
      inserted,
      format,
      dates: dateList,
      range: `${minDate} \u2192 ${maxDate}`,
      file: file.name,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
