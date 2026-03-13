import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/commandes/active?supplier=mael
 * Retourne la session brouillon en cours pour ce fournisseur, avec ses lignes.
 */
export async function GET(req: NextRequest) {
  const supplierName = req.nextUrl.searchParams.get("supplier");
  if (!supplierName) {
    return NextResponse.json({ error: "supplier requis" }, { status: 400 });
  }

  // Trouver le fournisseur par nom (case-insensitive)
  const { data: supplier } = await supabaseAdmin
    .from("suppliers")
    .select("id")
    .ilike("name", `%${supplierName}%`)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!supplier) {
    return NextResponse.json({ session: null, supplier_id: null });
  }

  // Chercher session active (brouillon ou validee)
  const { data: session } = await supabaseAdmin
    .from("commande_sessions")
    .select("*")
    .eq("supplier_id", supplier.id)
    .in("status", ["brouillon", "validee"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ session: null, supplier_id: supplier.id });
  }

  // Charger les lignes avec nom ingrédient
  const { data: lignes } = await supabaseAdmin
    .from("commande_lignes")
    .select("*, ingredients(name, category, default_unit)")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    session: { ...session, lignes: lignes ?? [] },
    supplier_id: supplier.id,
  });
}
