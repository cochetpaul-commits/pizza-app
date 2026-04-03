import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ── Types ── */
type VenteLigne = {
  date_service: string;
  quantite: number;
  ttc: number;
  ht: number;
};

type DailyRow = {
  date: string;
  qty: number;
  ca_ttc: number;
  ca_ht: number;
};

/* ── GET /api/ventes/marges/trend?etablissement_id=X&product=Y&category=Z&from=YYYY-MM-DD&to=YYYY-MM-DD ── */
/* product — filter by exact product name (description)                                                     */
/* category — filter by categorie column (aggregated)                                                        */
/* neither — aggregate ALL products                                                                          */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const etabId = searchParams.get("etablissement_id");
  const product = searchParams.get("product");
  const category = searchParams.get("category");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!etabId || !from || !to) {
    return NextResponse.json(
      { error: "etablissement_id, from, to requis" },
      { status: 400 },
    );
  }

  /* ── 1. Fetch ventes_lignes (paginated) ── */
  const PAGE = 1000;
  const allRows: VenteLigne[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    let query = supabaseAdmin
      .from("ventes_lignes")
      .select("date_service,quantite,ttc,ht")
      .eq("etablissement_id", etabId)
      .eq("type_ligne", "Produit")
      .eq("annule", false)
      .gt("ttc", 0)
      .gte("date_service", from)
      .lte("date_service", to);

    if (product) {
      query = query.eq("description", product);
    } else if (category) {
      query = query.eq("categorie", category);
    }

    const { data, error } = await query
      .order("date_service", { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    allRows.push(...((data ?? []) as VenteLigne[]));
    hasMore = (data?.length ?? 0) === PAGE;
    offset += PAGE;
  }

  /* ── 2. Aggregate by date_service ── */
  const dayMap = new Map<string, { qty: number; ca_ttc: number; ca_ht: number }>();
  for (const r of allRows) {
    const key = r.date_service;
    const prev = dayMap.get(key);
    if (prev) {
      prev.qty += Number(r.quantite) || 1;
      prev.ca_ttc += Number(r.ttc);
      prev.ca_ht += Number(r.ht);
    } else {
      dayMap.set(key, {
        qty: Number(r.quantite) || 1,
        ca_ttc: Number(r.ttc),
        ca_ht: Number(r.ht),
      });
    }
  }

  /* ── 3. Sort by date ascending ── */
  const daily: DailyRow[] = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      qty: Math.round(v.qty * 100) / 100,
      ca_ttc: Math.round(v.ca_ttc * 100) / 100,
      ca_ht: Math.round(v.ca_ht * 100) / 100,
    }));

  const label = product ?? category ?? "all";
  return NextResponse.json({ product: label, daily });
}
