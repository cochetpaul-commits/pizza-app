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

/** Parse datetime "02/03/2026 23:09:05" → ISO string */
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

/** Extract business date (YYYY-MM-DD). A business day runs 10:00→06:00 next day.
 *  Tickets between 00:00 and 05:59 belong to the previous calendar day. */
function extractDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  // Get hour in Paris timezone
  const parisHour = parseInt(d.toLocaleString("en-US", { timeZone: "Europe/Paris", hour: "numeric", hour12: false }));
  if (parisHour < 6) {
    // Before 6 AM → belongs to previous day's service
    const prev = new Date(d.getTime() - 6 * 3600 * 1000);
    return prev.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  }
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

type KeziaFormat = "commandes" | "products" | "kezia_daily" | "kezia_products" | "kezia_rayon_daily" | "kezia_article_stats";

/** Detect file format */
function detectFormat(rows: unknown[][]): KeziaFormat {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] as string[];
    if (!row || !row[0]) continue;
    const v = String(row[0]).toLowerCase().trim();
    // Kezia StatArticleMultiCritere: contains "Statistiques Articles" or "DEBUT ="
    if (v.includes("site =") || v.includes("debut =")) {
      // Check for "Statistiques Articles" marker in nearby rows
      for (let j = 0; j < Math.min(rows.length, 15); j++) {
        const r = rows[j] as string[];
        if (r && r[2] && String(r[2]).includes("Statistiques Articles")) return "kezia_article_stats";
      }
    }
    if (v === "debut =" || v === "idart") {
      // Check if it's article stats (has CA HT column) or hourly products
      for (let j = 0; j < Math.min(rows.length, 15); j++) {
        const r = rows[j] as string[];
        if (r && r[0] === "IdArt" && r[2] && String(r[2]).includes("CA")) return "kezia_article_stats";
        if (r && r[0] === "IdArt" && r[2] && String(r[2]).includes("0")) return "kezia_products";
      }
    }
    // Kezia daily: "Date, CA HT, CA TTC, MARGE, ..."
    if (v === "date" && row[1] && String(row[1]).toLowerCase().trim() === "ca ht") return "kezia_daily";
    // Kezia rayon daily: "Date, CAVE & SPIRITUEUX, ..." or any other non-CA-HT header
    if (v === "date" && row[1]) return "kezia_rayon_daily";
    // Kezia products: "IdArt, Designation, 0 à1h, ..."
    if (v === "idart" || v.includes("idart")) return "kezia_products";
    if (v === "jour") return "products";
    if (v.includes("ouvert")) return "commandes";
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
    // Skip Total lines only — keep Paiement for payment analysis
    if (typeLigne === "Total") return null;
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
      type_ligne: typeLigne || "Produit",
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

// ── Format "products" (export_products_*.xlsx) ──
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

/** Parse Kezia daily XLSX "Date, CA HT, CA TTC, MARGE, ..." → daily_sales records */
function parseKeziaDaily(rows: unknown[][], etablissementId: string): { records: Record<string, unknown>[]; dates: string[] } {
  const records: Record<string, unknown>[] = [];
  const dates: string[] = [];
  // Skip header row (index 0), skip summary rows (where date is null)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row[0]) continue; // skip summary row
    // Parse date DD/MM/YYYY
    const dateStr = String(row[0]);
    const m = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) continue;
    const isoDate = `${m[3]}-${m[2]}-${m[1]}`;
    const ca_ht = Number(row[1]) || 0;
    const ca_ttc = Number(row[2]) || 0;
    const marge = Number(row[3]) || 0;
    const taux_marque = Number(row[5]) || 0; // Marque(%) in percentage
    const tickets = Math.round(Number(row[6]) || 0);
    const panier_moyen = Number(row[8]) || 0;
    const val_achat = Number(row[9]) || 0;
    records.push({
      etablissement_id: etablissementId,
      date: isoDate,
      source: "kezia_xlsx",
      ca_ttc,
      ca_ht,
      tva_total: Math.round((ca_ttc - ca_ht) * 100) / 100,
      tickets,
      couverts: tickets, // approximate: use tickets as couverts
      panier_moyen,
      marge_total: marge,
      taux_marque: taux_marque / 100, // convert % to decimal
      rayons: { val_achat }, // store purchase value as metadata
    });
    dates.push(isoDate);
  }
  return { records, dates };
}

/** Parse Kezia product XLSX "IdArt, Designation, 0à1h, ..., Total" → product summary */
function parseKeziaProducts(rows: unknown[][], _etablissementId: string): { products: { name: string; total: number; hourly: number[] }[]; count: number } {
  const products: { name: string; total: number; hourly: number[] }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const total = Number(row[26]) || 0;
    if (total <= 0) continue;
    const name = String(row[1] || "").trim();
    if (!name) continue;
    const hourly = Array.from({ length: 24 }, (_, h) => Number(row[h + 2]) || 0);
    products.push({ name, total, hourly });
  }
  products.sort((a, b) => b.total - a.total);
  return { products, count: products.length };
}

/** Parse Kezia rayon daily "Date, CAVE, EPICERIE, ..., TOTAL" → daily rayon breakdown */
function parseKeziaRayonDaily(rows: unknown[][]): { entries: { date: string; rayons: Record<string, number>; total: number }[] } {
  const headers = (rows[0] as string[]).slice(1); // skip "Date", get rayon names
  const entries: { date: string; rayons: Record<string, number>; total: number }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    // Date is Excel serial number or "Somme"
    if (typeof row[0] !== "number") continue;
    const serial = row[0] as number;
    const date = new Date((serial - 25569) * 86400000).toISOString().slice(0, 10);
    const total = Number(row[row.length - 1]) || 0;
    if (total <= 0) continue; // skip days with no sales
    const rayons: Record<string, number> = {};
    for (let j = 1; j < headers.length; j++) {
      const name = String(headers[j] || "").trim();
      const val = Number(row[j + 0]) || 0; // row[1] = first rayon value
      if (name && name !== "TOTAL" && val > 0) {
        rayons[name] = val;
      }
    }
    entries.push({ date, rayons, total });
  }
  return { entries };
}

/** Parse Kezia StatArticleMultiCritere → monthly product stats with CA + marge */
function parseKeziaArticleStats(rows: unknown[][]): {
  period: { from: string; to: string };
  products: { name: string; ca_ht: number; ca_ttc: number; marge: number; nb_ventes: number; nb_articles: number; panier_moyen: number }[];
} {
  let periodFrom = "", periodTo = "";
  let headerIdx = -1;

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i] as string[];
    if (!row) continue;
    // Find period: "DEBUT = DD/MM/YYYY ... FIN = DD/MM/YYYY"
    if (String(row[0]).includes("DEBUT")) {
      const dStr = String(row[1] || "");
      const dm = dStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (dm) periodFrom = `${dm[3]}-${dm[2]}-${dm[1]}`;
      // FIN is at index 5 or 6
      for (let k = 4; k < row.length; k++) {
        const fStr = String(row[k] || "");
        const fm = fStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (fm) { periodTo = `${fm[3]}-${fm[2]}-${fm[1]}`; break; }
      }
    }
    // Find header row: "IdArt, Article, CA HT, ..."
    if (String(row[0]) === "IdArt") {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) return { period: { from: periodFrom, to: periodTo }, products: [] };

  const products: { name: string; ca_ht: number; ca_ttc: number; marge: number; nb_ventes: number; nb_articles: number; panier_moyen: number }[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row[0] || String(row[0]).includes("Nombre")) break; // end at summary row
    const name = String(row[1] || "").trim();
    if (!name || name === "Article inconnu") continue;
    products.push({
      name,
      ca_ht: Number(row[2]) || 0,
      ca_ttc: Number(row[3]) || 0,
      marge: Number(row[4]) || 0,
      nb_ventes: Math.round(Number(row[5]) || 0),
      nb_articles: Number(row[6]) || 0,
      panier_moyen: Number(row[7]) || 0,
    });
  }
  products.sort((a, b) => b.ca_ttc - a.ca_ttc);
  return { period: { from: periodFrom, to: periodTo }, products };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const etablissementId = formData.get("etablissement_id") as string | null;

    if (!file) return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    if (!etablissementId) return NextResponse.json({ error: "etablissement_id manquant" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    let rows: unknown[][];

    if (file.name.endsWith(".csv")) {
      // Parse CSV (semicolon-separated, French format)
      const text = buffer.toString("utf-8");
      rows = text.split("\n").map(line => line.split(";").map(cell => cell.trim()));
    } else {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    }

    const format = detectFormat(rows);

    // ── Kezia daily format → daily_sales ──
    if (format === "kezia_daily") {
      const { records, dates } = parseKeziaDaily(rows, etablissementId);
      if (records.length === 0) {
        return NextResponse.json({ error: "Aucune ligne de données trouvée" }, { status: 400 });
      }
      const dateList = dates.sort();
      const minDate = dateList[0];
      const maxDate = dateList[dateList.length - 1];

      // Delete existing kezia_xlsx data for this date range
      if (minDate && maxDate) {
        await supabase
          .from("daily_sales")
          .delete()
          .eq("etablissement_id", etablissementId)
          .eq("source", "kezia_xlsx")
          .gte("date", minDate)
          .lte("date", maxDate);
      }

      // Insert in batches
      const BATCH = 100;
      let inserted = 0;
      for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const { error } = await supabase.from("daily_sales").insert(batch);
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
        format: "kezia_daily",
        dates: dateList,
        range: `${minDate} \u2192 ${maxDate}`,
        file: file.name,
      });
    }

    // ── Kezia products format → store as metadata ──
    if (format === "kezia_products") {
      const { products, count } = parseKeziaProducts(rows, etablissementId);
      if (count === 0) {
        return NextResponse.json({ error: "Aucun produit avec ventes trouvé" }, { status: 400 });
      }

      // Store product summary as a special daily_sales entry
      const productData = { top_products: products.slice(0, 50), total_products: count };

      // Check if exists, then update or insert
      const { data: existing } = await supabase
        .from("daily_sales")
        .select("id")
        .eq("etablissement_id", etablissementId)
        .eq("source", "kezia_products")
        .limit(1);

      let error;
      if (existing && existing.length > 0) {
        ({ error } = await supabase.from("daily_sales")
          .update({ rayons: productData, ca_ttc: 0, ca_ht: 0 })
          .eq("id", existing[0].id));
      } else {
        ({ error } = await supabase.from("daily_sales").insert({
          etablissement_id: etablissementId,
          date: "2000-01-01",
          source: "kezia_products",
          ca_ttc: 0, ca_ht: 0,
          rayons: productData,
        }));
      }

      if (error) {
        return NextResponse.json({ error: `kezia_products: ${error.message}` }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        inserted: count,
        format: "kezia_products",
        file: file.name,
      });
    }

    // ── Kezia rayon daily → update daily_sales rayons ──
    if (format === "kezia_rayon_daily") {
      const { entries } = parseKeziaRayonDaily(rows);
      if (entries.length === 0) {
        return NextResponse.json({ error: "Aucune donnée trouvée" }, { status: 400 });
      }

      let updated = 0;
      for (const entry of entries) {
        // Try to update existing daily_sales entry (from kezia_xlsx or kezia_pdf)
        const { data: existing } = await supabase
          .from("daily_sales")
          .select("id,rayons")
          .eq("etablissement_id", etablissementId)
          .eq("date", entry.date)
          .in("source", ["kezia_xlsx", "kezia_pdf"])
          .limit(1);

        if (existing && existing.length > 0) {
          // Merge rayon data into existing rayons JSONB
          const currentRayons = (typeof existing[0].rayons === "object" && existing[0].rayons) ? existing[0].rayons as Record<string, unknown> : {};
          const mergedRayons = { ...currentRayons, categories: entry.rayons, ca_rayons_total: entry.total };
          await supabase.from("daily_sales").update({ rayons: mergedRayons }).eq("id", existing[0].id);
          updated++;
        } else {
          // Create minimal entry with just rayon data
          await supabase.from("daily_sales").insert({
            etablissement_id: etablissementId,
            date: entry.date,
            source: "kezia_xlsx",
            ca_ttc: entry.total,
            ca_ht: 0,
            rayons: { categories: entry.rayons, ca_rayons_total: entry.total },
          });
          updated++;
        }
      }

      const dateList = entries.map(e => e.date).sort();
      return NextResponse.json({
        ok: true,
        inserted: updated,
        format: "kezia_rayon_daily",
        range: `${dateList[0]} \u2192 ${dateList[dateList.length - 1]}`,
        file: file.name,
      });
    }

    // ── Kezia article stats → monthly product data with margins ──
    if (format === "kezia_article_stats") {
      const { period, products } = parseKeziaArticleStats(rows);
      if (products.length === 0) {
        return NextResponse.json({ error: "Aucun produit trouvé" }, { status: 400 });
      }

      const monthKey = period.from || "unknown";
      const productData = {
        period,
        products: products.slice(0, 100), // top 100 products
        total_products: products.length,
        total_ca_ht: products.reduce((s, p) => s + p.ca_ht, 0),
        total_ca_ttc: products.reduce((s, p) => s + p.ca_ttc, 0),
        total_marge: products.reduce((s, p) => s + p.marge, 0),
      };

      // Delete existing article stats for this period
      await supabase
        .from("daily_sales")
        .delete()
        .eq("etablissement_id", etablissementId)
        .eq("source", "kezia_article_stats")
        .eq("date", monthKey);

      const { error } = await supabase.from("daily_sales").insert({
        etablissement_id: etablissementId,
        date: monthKey, // first day of the month
        source: "kezia_article_stats",
        ca_ttc: productData.total_ca_ttc,
        ca_ht: productData.total_ca_ht,
        marge_total: productData.total_marge,
        rayons: productData,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        inserted: products.length,
        format: "kezia_article_stats",
        range: `${period.from} \u2192 ${period.to}`,
        file: file.name,
      });
    }

    // ── POS formats → ventes_lignes (existing logic) ──
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

    // Insert in batches (smaller for large files)
    const BATCH = 200;
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
