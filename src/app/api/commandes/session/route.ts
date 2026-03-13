import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

/**
 * POST /api/commandes/session
 * Crée une nouvelle session de commande.
 * Body: { supplier_id: string }
 */
export async function POST(req: NextRequest) {
  try {
    var { etabId } = await getEtablissement(req);
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { supplier_id } = await req.json();
  if (!supplier_id) {
    return NextResponse.json({ error: "supplier_id requis" }, { status: 400 });
  }

  const { data: session, error } = await supabaseAdmin
    .from("commande_sessions")
    .insert({
      supplier_id,
      etablissement_id: etabId,
      status: "brouillon",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ session });
}

/**
 * GET /api/commandes/session?id=xxx
 * Récupère une session par ID avec ses lignes.
 */
export async function GET(req: NextRequest) {
  try {
    var { etabId } = await getEtablissement(req);
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: session } = await supabaseAdmin
    .from("commande_sessions")
    .select("*")
    .eq("id", id)
    .eq("etablissement_id", etabId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "session introuvable" }, { status: 404 });
  }

  const { data: lignes } = await supabaseAdmin
    .from("commande_lignes")
    .select("*, ingredients(name, category, default_unit)")
    .eq("session_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ session: { ...session, lignes: lignes ?? [] } });
}

/**
 * PATCH /api/commandes/session
 * Met à jour le statut d'une session.
 * Body: { id: string, status: string, notes?: string }
 */
export async function PATCH(req: NextRequest) {
  try {
    var { etabId } = await getEtablissement(req);
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { id, status, notes } = await req.json();
  if (!id || !status) {
    return NextResponse.json({ error: "id et status requis" }, { status: 400 });
  }

  // Verify session belongs to this etablissement
  const { data: existing } = await supabaseAdmin
    .from("commande_sessions")
    .select("id")
    .eq("id", id)
    .eq("etablissement_id", etabId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "session introuvable" }, { status: 404 });
  }

  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (notes !== undefined) update.notes = notes;

  // Recalculer total_ht
  const { data: lignes } = await supabaseAdmin
    .from("commande_lignes")
    .select("total_ligne_ht")
    .eq("session_id", id);

  if (lignes) {
    update.total_ht = lignes.reduce((sum, l) => sum + (Number(l.total_ligne_ht) || 0), 0);
  }

  const { data: session, error } = await supabaseAdmin
    .from("commande_sessions")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ session });
}
