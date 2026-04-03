import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

/**
 * GET /api/commandes/active?supplier=mael
 * Retourne la session brouillon en cours pour ce fournisseur, avec ses lignes.
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
  const supplierName = req.nextUrl.searchParams.get("supplier");
  if (!supplierIdParam && !supplierName) {
    return NextResponse.json({ error: "supplier ou supplier_id requis" }, { status: 400 });
  }

  let supplierId: string;

  if (supplierIdParam) {
    supplierId = supplierIdParam;
  } else {
    // Trouver le fournisseur par nom (case-insensitive, accent-insensitive via unaccent)
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
    supplierId = supplier.id;
  }

  // Chercher session active (brouillon ou validee)
  const { data: session } = await supabaseAdmin
    .from("commande_sessions")
    .select("*")
    .eq("supplier_id", supplierId)
    .eq("etablissement_id", etabId)
    .in("status", ["brouillon", "validee"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ session: null, supplier_id: supplierId });
  }

  // Charger les lignes avec nom ingrédient
  const { data: lignes } = await supabaseAdmin
    .from("commande_lignes")
    .select("*, ingredients(name, category, default_unit)")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    session: { ...session, lignes: lignes ?? [] },
    supplier_id: supplierId,
  });
}
