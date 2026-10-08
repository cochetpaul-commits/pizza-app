import { NextRequest, NextResponse } from "next/server";
import { etabAccessDenied } from "@/lib/getEtablissement";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ── Types ── */
type DailyRow = {
  date: string;
  qty: number;
  ca_ttc: number;
  ca_ht: number;
};

type LigneJour = { categorie: string | null; date_service: string; qty: number | string; ca_ttc: number | string; ca_ht: number | string };
type LigneProduit = { name: string; qty: number | string; ca_ttc: number | string; ca_ht: number | string };

/* ── GET /api/ventes/marges/trend?etablissement_id=X&product=Y&category=Z&from=YYYY-MM-DD&to=YYYY-MM-DD ── */
/* product — filter by exact product name (description)                                                     */
/* category — filter by categorie column (aggregated)                                                        */
/* group_by=category — return data grouped by category instead of flat daily array                           */
/* neither — aggregate ALL products                                                                          */
/*                                                                                                          */
/* Vécu 08/10 : la route rapatriait toutes les lignes de vente de la période (124 000 lignes sur un an,     */
/* 124 pages) et saturait le pool de connexions ; les agrégats sont désormais calculés en base par les       */
/* fonctions ventes_tendance_jour et ventes_tendance_produits (mêmes filtres : Produit, non annulé, TTC>0). */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const etabId = searchParams.get("etablissement_id");
  const product = searchParams.get("product");
  const category = searchParams.get("category");
  const service = searchParams.get("service");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const groupBy = searchParams.get("group_by");

  if (!etabId || !from || !to) {
    return NextResponse.json(
      { error: "etablissement_id, from, to requis" },
      { status: 400 },
    );
  }
  const denied = await etabAccessDenied(req, etabId, ["group_admin", "manager"]);
  if (denied) return denied;

  const params = { p_etab: etabId, p_from: from, p_to: to, p_product: product, p_category: category, p_service: service };
  const num = (x: number | string) => Number(x) || 0;

  /* ── group_by=category mode ── */
  if (groupBy === "category") {
    const { data, error } = await supabaseAdmin.rpc("ventes_tendance_jour", { ...params, p_par_categorie: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const categories: Record<string, DailyRow[]> = {};
    for (const r of (data ?? []) as LigneJour[]) {
      const cat = r.categorie || "Autre";
      (categories[cat] ??= []).push({ date: r.date_service, qty: num(r.qty), ca_ttc: num(r.ca_ttc), ca_ht: num(r.ca_ht) });
    }
    return NextResponse.json({ categories });
  }

  /* ── Par jour + par produit, en deux agrégats légers ── */
  const [jours, produits] = await Promise.all([
    supabaseAdmin.rpc("ventes_tendance_jour", { ...params, p_par_categorie: false }),
    supabaseAdmin.rpc("ventes_tendance_produits", params),
  ]);
  if (jours.error) return NextResponse.json({ error: jours.error.message }, { status: 500 });
  if (produits.error) return NextResponse.json({ error: produits.error.message }, { status: 500 });

  const daily: DailyRow[] = ((jours.data ?? []) as LigneJour[])
    .map((r) => ({ date: r.date_service, qty: num(r.qty), ca_ttc: num(r.ca_ttc), ca_ht: num(r.ca_ht) }));
  const products = ((produits.data ?? []) as LigneProduit[])
    .map((r) => ({ name: r.name, qty: Math.round(num(r.qty)), ca_ttc: num(r.ca_ttc), ca_ht: num(r.ca_ht) }));

  const label = product ?? category ?? "all";
  return NextResponse.json({ product: label, daily, products });
}
