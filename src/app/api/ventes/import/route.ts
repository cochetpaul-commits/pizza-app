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
  // Try DD/MM/YYYY HH:mm:ss
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}+01:00`;
  }
  // Try ISO or other formats
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Deduce service from hour: before 16h = midi, after = soir */
function deduceService(dateStr: string | null): string {
  if (!dateStr) return "soir";
  const h = new Date(dateStr).getHours();
  return h < 16 ? "midi" : "soir";
}

/** Extract just the date part YYYY-MM-DD */
function extractDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  // Use Paris timezone
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const etablissementId = formData.get("etablissement_id") as string | null;

    if (!file) return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    if (!etablissementId) return NextResponse.json({ error: "etablissement_id manquant" }, { status: 400 });

    // Read file
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    // Find header row (row with "Ouvert à")
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const row = rows[i] as string[];
      if (row && row[0] && String(row[0]).includes("Ouvert")) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      return NextResponse.json({ error: "Format invalide — colonne 'Ouvert à' introuvable" }, { status: 400 });
    }

    // Data rows start after header
    const dataRows = rows.slice(headerIdx + 1).filter((r) => {
      const row = r as unknown[];
      return row[0] && String(row[0]).trim() !== "";
    });

    if (dataRows.length === 0) {
      return NextResponse.json({ error: "Aucune ligne de données trouvée" }, { status: 400 });
    }

    // Determine date range for dedup
    const dates = new Set<string>();
    for (const row of dataRows) {
      const r = row as unknown[];
      const dt = parseDate(r[0]);
      const ds = extractDate(dt);
      if (ds) dates.add(ds);
    }
    const dateList = Array.from(dates).sort();
    const minDate = dateList[0];
    const maxDate = dateList[dateList.length - 1];

    // Delete existing data for this date range + establishment (avoid duplicates)
    if (minDate && maxDate) {
      await supabase
        .from("ventes_lignes")
        .delete()
        .eq("etablissement_id", etablissementId)
        .gte("date_service", minDate)
        .lte("date_service", maxDate);
    }

    // Build insert rows
    const fileName = file.name;
    const insertRows = dataRows.map((row) => {
      const r = row as unknown[];
      const ouvertA = parseDate(r[0]);
      const dateService = extractDate(ouvertA);
      return {
        etablissement_id: etablissementId,
        ouvert_a: ouvertA,
        ferme_a: parseDate(r[1]),
        date_service: dateService,
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
        type_ligne: String(r[11] || ""),
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
    }).filter((r) => r.date_service !== null);

    // Insert in batches of 500
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < insertRows.length; i += BATCH) {
      const batch = insertRows.slice(i, i + BATCH);
      const { error } = await supabase.from("ventes_lignes").insert(batch);
      if (error) {
        return NextResponse.json({
          error: `Erreur insertion batch ${Math.floor(i / BATCH) + 1}: ${error.message}`,
          inserted,
        }, { status: 500 });
      }
      inserted += batch.length;
    }

    return NextResponse.json({
      ok: true,
      inserted,
      dates: dateList,
      range: `${minDate} → ${maxDate}`,
      file: fileName,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
