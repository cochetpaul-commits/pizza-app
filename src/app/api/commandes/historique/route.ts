import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

/**
 * GET /api/commandes/historique?supplier_id=xxx&limit=10
 * GET /api/commandes/historique?supplier_id=xxx,yyy&limit=10 (plusieurs alias fournisseur en une requête)
 * Retourne les commandes passées (non brouillon) pour un ou plusieurs fournisseurs.
 */
export async function GET(req: NextRequest) {
  let etabId: string;
  try {
    ({ etabId } = await getEtablissement(req));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supplierIdParam = req.nextUrl.searchParams.get("supplier_id");
  const limit = Number(req.nextUrl.searchParams.get("limit") || "10");

  if (!supplierIdParam) {
    return NextResponse.json({ error: "supplier_id requis" }, { status: 400 });
  }
  const supplierIds = supplierIdParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (supplierIds.length === 0) {
    return NextResponse.json({ error: "supplier_id requis" }, { status: 400 });
  }

  const { data: sessions } = await supabaseAdmin
    .from("commande_sessions")
    .select("*")
    .in("supplier_id", supplierIds)
    .eq("etablissement_id", etabId)
    .not("status", "eq", "brouillon")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ historique: [] });
  }

  // Charger le nombre de lignes par session
  const sessionIds = sessions.map((s) => s.id);
  const { data: lignes } = await supabaseAdmin
    .from("commande_lignes")
    .select("session_id, id")
    .in("session_id", sessionIds);

  const countMap: Record<string, number> = {};
  for (const l of lignes ?? []) {
    countMap[l.session_id] = (countMap[l.session_id] || 0) + 1;
  }

  const historique = sessions.map((s) => ({
    ...s,
    nb_articles: countMap[s.id] || 0,
  }));

  return NextResponse.json({ historique });
}
