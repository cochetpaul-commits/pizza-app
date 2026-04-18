import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * POST /api/ventes/articles/import
 * Body: FormData with `file` (CSV) + `etablissement_id`
 *
 * Parses Kezia CSV export (Produit;SKU;Type de prix;Quantité;HT;TTC)
 * Aggregates by product name, upserts into articles_vente
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const etabId = form.get("etablissement_id") as string | null;
    const mode = (form.get("mode") as string) ?? "preview";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier CSV manquant." }, { status: 400 });
    }
    if (!etabId) {
      return NextResponse.json({ error: "etablissement_id requis." }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      return NextResponse.json({ error: "Fichier vide ou invalide." }, { status: 400 });
    }

    // Parse header
    const header = lines[0].replace(/^\uFEFF/, "").split(";").map(h => h.trim().toLowerCase());
    const prodIdx = header.indexOf("produit");
    const qtyIdx = header.indexOf("quantité");
    const htIdx = header.indexOf("ht");
    const ttcIdx = header.indexOf("ttc");
    const typeIdx = header.indexOf("type de prix");

    if (prodIdx < 0) {
      return NextResponse.json({ error: "Colonne 'Produit' introuvable dans le CSV." }, { status: 400 });
    }

    // Aggregate by product name
    const products = new Map<string, { qty: number; ht: number; ttc: number; types: Set<string> }>();

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(";");
      const name = cols[prodIdx]?.trim();
      if (!name || name.toLowerCase() === "total") continue;

      const qty = parseNum(cols[qtyIdx]);
      const ht = parseNum(cols[htIdx]);
      const ttc = parseNum(cols[ttcIdx]);
      const type = cols[typeIdx]?.trim() ?? "";

      const prev = products.get(name);
      if (prev) {
        prev.qty += qty;
        prev.ht += ht;
        prev.ttc += ttc;
        if (type) prev.types.add(type);
      } else {
        products.set(name, { qty, ht, ttc, types: type ? new Set([type]) : new Set() });
      }
    }

    const productList = Array.from(products.entries()).map(([name, agg]) => ({
      nom_vente: name,
      qty: agg.qty,
      ca_ht: Math.round(agg.ht * 100) / 100,
      ca_ttc: Math.round(agg.ttc * 100) / 100,
      prix_vente_ttc: agg.qty > 0 ? Math.round((agg.ttc / agg.qty) * 100) / 100 : null,
      prix_vente_ht: agg.qty > 0 ? Math.round((agg.ht / agg.qty) * 100) / 100 : null,
    }));

    productList.sort((a, b) => b.ca_ttc - a.ca_ttc);

    if (mode === "preview") {
      return NextResponse.json({
        ok: true,
        nb_products: productList.length,
        ca_ttc_total: productList.reduce((s, p) => s + p.ca_ttc, 0),
        products: productList.slice(0, 30), // preview first 30
      });
    }

    // Commit mode — upsert into articles_vente
    // First, get existing articles to avoid overwriting recipe links
    const { data: existing } = await supabaseAdmin
      .from("articles_vente")
      .select("nom_vente")
      .eq("etablissement_id", etabId);
    const existingNames = new Set((existing ?? []).map(e => e.nom_vente));

    let inserted = 0;
    let updated = 0;

    for (const p of productList) {
      if (existingNames.has(p.nom_vente)) {
        // Update prices only, preserve recipe/ingredient links
        await supabaseAdmin
          .from("articles_vente")
          .update({
            prix_vente_ttc: p.prix_vente_ttc,
            prix_vente_ht: p.prix_vente_ht,
          })
          .eq("etablissement_id", etabId)
          .eq("nom_vente", p.nom_vente);
        updated++;
      } else {
        // Insert new
        await supabaseAdmin
          .from("articles_vente")
          .insert({
            etablissement_id: etabId,
            nom_vente: p.nom_vente,
            prix_vente_ttc: p.prix_vente_ttc,
            prix_vente_ht: p.prix_vente_ht,
            source: "import_csv",
          });
        inserted++;
      }
    }

    return NextResponse.json({
      ok: true,
      nb_products: productList.length,
      inserted,
      updated,
      ca_ttc_total: productList.reduce((s, p) => s + p.ca_ttc, 0),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

function parseNum(s: string | undefined): number {
  if (!s) return 0;
  // Handle French number format: "3 758,86" → 3758.86
  const cleaned = s.trim().replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}
