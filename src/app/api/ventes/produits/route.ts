import { NextRequest, NextResponse } from "next/server";
import { etabAccessDenied } from "@/lib/getEtablissement";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { construireProduitsPeriode, detailProduit, type LigneAgregee } from "@/lib/analyse/produitsPeriode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ventes/produits?etablissement_id=…&from=…&to=…
 * Par produit (30/10/2026) : la tendance des ventes (par jour, semaine ou mois selon la période, par catégorie)
 * et le partage midi / soir par catégorie et par produit. Source : ventes_lignes, hors annulations et messages.
 * Avec &produit=NOM : le zoom sur ce produit seulement (tendance midi / soir, jours de la semaine).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const etabId = sp.get("etablissement_id"), from = sp.get("from"), to = sp.get("to");
  if (!etabId || !from || !to) return NextResponse.json({ error: "etablissement_id, from et to requis" }, { status: 400 });
  const refus = await etabAccessDenied(req, etabId);
  if (refus) return refus;
  // PostgREST coupe à 1 000 lignes : lecture par pages, dans un ordre stable (03/11/2026, 12 834 lignes sur juillet à octobre)
  const PAGE = 1000;
  const data: LigneAgregee[] = [];
  for (let i = 0; ; i += PAGE) {
    const { data: page, error } = await supabaseAdmin.rpc("ventes_produits_periode", { p_etab: etabId, p_from: from, p_to: to })
      .order("date_service").order("service").order("categorie").order("description").range(i, i + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    data.push(...((page ?? []) as LigneAgregee[]));
    if (!page || page.length < PAGE) break;
  }
  const produit = sp.get("produit");
  if (produit) {
    const detail = detailProduit(data, from, to, produit);
    return detail ? NextResponse.json({ detail }) : NextResponse.json({ error: "Produit sans vente sur la période" }, { status: 404 });
  }
  return NextResponse.json(construireProduitsPeriode(data, from, to));
}
