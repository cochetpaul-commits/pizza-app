import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/commandes/reception?session_id=xxx
 * Returns order lines with ingredient names for reception pointing.
 */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "session_id requis" }, { status: 400 });

  const { data: lines, error } = await supabaseAdmin
    .from("commande_lignes")
    .select("id, ingredient_id, quantite, unite, prix_unitaire_ht, qty_received, checked, reception_note, ingredients(name, category)")
    .eq("session_id", sessionId)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: session } = await supabaseAdmin
    .from("commande_sessions")
    .select("id, status, supplier_id, suppliers(name)")
    .eq("id", sessionId)
    .single();

  return NextResponse.json({
    session: session ? {
      id: session.id,
      status: session.status,
      supplier_name: (session.suppliers as unknown as { name: string } | null)?.name ?? "",
    } : null,
    lines: (lines ?? []).map((l) => ({
      id: l.id,
      ingredient_id: l.ingredient_id,
      ingredient_name: (l.ingredients as unknown as { name: string; category: string | null } | null)?.name ?? "?",
      quantite: Number(l.quantite),
      unite: l.unite,
      prix_unitaire_ht: l.prix_unitaire_ht ? Number(l.prix_unitaire_ht) : null,
      qty_received: l.qty_received != null ? Number(l.qty_received) : null,
      checked: l.checked ?? false,
      reception_note: l.reception_note,
    })),
  });
}

/**
 * PATCH /api/commandes/reception
 * Save reception data for order lines and optionally mark session as received.
 * Body: { session_id, lines: [{ id, qty_received, checked, reception_note }], finalize?: boolean }
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { session_id, lines, finalize } = body as {
    session_id: string;
    lines: { id: string; qty_received: number | null; checked: boolean; reception_note?: string }[];
    finalize?: boolean;
  };

  if (!session_id || !lines) {
    return NextResponse.json({ error: "session_id et lines requis" }, { status: 400 });
  }

  // Update each line
  for (const line of lines) {
    await supabaseAdmin
      .from("commande_lignes")
      .update({
        qty_received: line.qty_received,
        checked: line.checked,
        reception_note: line.reception_note ?? null,
      })
      .eq("id", line.id);
  }

  // Mark session as received if finalize
  if (finalize) {
    await supabaseAdmin
      .from("commande_sessions")
      .update({ status: "recue", received_at: new Date().toISOString() })
      .eq("id", session_id);
  }

  return NextResponse.json({ ok: true });
}
