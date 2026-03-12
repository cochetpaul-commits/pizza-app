import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/commandes/auth";

export const runtime = "nodejs";

/**
 * POST /api/commandes/ligne
 * Add a line to an order session.
 * Body: { session_id, ingredient_id?, nom_libre?, categorie, quantite, unite, urgent?, notes? }
 */
export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if (auth instanceof NextResponse) return auth;
    const { supabase, userId } = auth;

    const body = await req.json();
    const {
      session_id,
      ingredient_id,
      nom_libre,
      categorie,
      quantite,
      unite,
      urgent,
      notes,
    } = body as {
      session_id?: string;
      ingredient_id?: string;
      nom_libre?: string;
      categorie?: string;
      quantite?: number;
      unite?: string;
      urgent?: boolean;
      notes?: string;
    };

    if (!session_id) {
      return NextResponse.json({ ok: false, error: "session_id requis." }, { status: 400 });
    }
    if (!categorie) {
      return NextResponse.json({ ok: false, error: "categorie requis." }, { status: 400 });
    }
    if (quantite == null || quantite <= 0) {
      return NextResponse.json({ ok: false, error: "quantite doit être > 0." }, { status: 400 });
    }
    if (!unite) {
      return NextResponse.json({ ok: false, error: "unite requis." }, { status: 400 });
    }
    if (!ingredient_id && !nom_libre) {
      return NextResponse.json(
        { ok: false, error: "ingredient_id ou nom_libre requis." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("commande_lignes")
      .insert({
        session_id,
        ingredient_id: ingredient_id ?? null,
        nom_libre: nom_libre ?? null,
        categorie,
        quantite,
        unite,
        urgent: urgent ?? false,
        ajoute_par: userId,
        notes: notes ?? null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ligne: data }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
