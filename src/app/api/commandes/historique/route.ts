import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/commandes/historique?supplier_id=xxx&limit=10
 * Retourne les commandes passées (non brouillon) pour un fournisseur.
 */
export async function GET(req: NextRequest) {
  const supplierId = req.nextUrl.searchParams.get("supplier_id");
  const limit = Number(req.nextUrl.searchParams.get("limit") || "10");

  if (!supplierId) {
    return NextResponse.json({ error: "supplier_id requis" }, { status: 400 });
  }

  const { data: sessions } = await supabaseAdmin
    .from("commande_sessions")
    .select("*")
    .eq("supplier_id", supplierId)
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
