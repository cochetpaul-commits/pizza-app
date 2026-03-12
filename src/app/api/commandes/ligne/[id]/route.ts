import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/commandes/auth";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/commandes/ligne/[id]
 * Update a line in an order session.
 * Body: partial { quantite?, unite?, urgent?, notes?, categorie? }
 */
export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await authenticateRequest(req);
    if (auth instanceof NextResponse) return auth;
    const { supabase } = auth;

    const body = await req.json();
    const allowed = ["quantite", "unite", "urgent", "notes", "categorie", "nom_libre", "ingredient_id"];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: "Aucun champ à modifier." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("commande_lignes")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ligne: data });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/commandes/ligne/[id]
 * Delete a line from an order session.
 */
export async function DELETE(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await authenticateRequest(req);
    if (auth instanceof NextResponse) return auth;
    const { supabase } = auth;

    const { error } = await supabase
      .from("commande_lignes")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
