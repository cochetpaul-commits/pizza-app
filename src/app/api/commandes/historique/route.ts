import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/commandes/auth";

export const runtime = "nodejs";

/**
 * GET /api/commandes/historique
 * Returns order history patterns for suggestions.
 * Query params: ?fournisseur=mael|metro
 */
export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if (auth instanceof NextResponse) return auth;
    const { supabase } = auth;

    const { searchParams } = new URL(req.url);
    const fournisseur = searchParams.get("fournisseur");

    let query = supabase
      .from("commande_historique")
      .select("*")
      .order("fournisseur");

    if (fournisseur) {
      query = query.eq("fournisseur", fournisseur);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, historique: data });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
