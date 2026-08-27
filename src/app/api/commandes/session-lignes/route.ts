import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/commandes/session-lignes?session_id=xxx
 * Lignes d'une commande (dépliage de l'historique et des réceptions en attente).
 */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "session_id requis" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("commande_lignes")
    .select("id, quantite, unite, prix_unitaire_ht, total_ligne_ht, qty_received, checked, ingredients(name)")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const lignes = (data ?? []).map((l) => {
    const ing = l.ingredients as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(ing) ? ing[0]?.name : ing?.name;
    return {
      id: l.id,
      name: name ?? "—",
      quantite: Number(l.quantite ?? 0),
      unite: l.unite ?? "",
      prix_unitaire_ht: l.prix_unitaire_ht != null ? Number(l.prix_unitaire_ht) : null,
      total_ligne_ht: l.total_ligne_ht != null ? Number(l.total_ligne_ht) : null,
      qty_received: l.qty_received != null ? Number(l.qty_received) : null,
      checked: l.checked ?? null,
    };
  });
  return NextResponse.json({ lignes });
}
