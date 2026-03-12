import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/commandes/auth";

export const runtime = "nodejs";

/**
 * POST /api/commandes/session
 * Create a new order session (brouillon).
 * Body: { fournisseur: 'mael'|'metro', semaine: string, notes?: string }
 */
export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if (auth instanceof NextResponse) return auth;
    const { supabase, userId } = auth;

    const body = await req.json();
    const { fournisseur, semaine, notes } = body as {
      fournisseur?: string;
      semaine?: string;
      notes?: string;
    };

    if (!fournisseur || !["mael", "metro"].includes(fournisseur)) {
      return NextResponse.json(
        { ok: false, error: "fournisseur requis ('mael' ou 'metro')." },
        { status: 400 }
      );
    }
    if (!semaine) {
      return NextResponse.json(
        { ok: false, error: "semaine requis." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("commande_sessions")
      .insert({
        fournisseur,
        semaine,
        notes: notes ?? null,
        created_by: userId,
        statut: "brouillon",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, session: data }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
