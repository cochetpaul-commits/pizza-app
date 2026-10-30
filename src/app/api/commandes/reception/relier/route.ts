import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";
import { cleReference } from "@/lib/invoices/rapprochement";
import type { DocumentLu } from "@/lib/rapprochementReception";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/commandes/reception/relier { session_id, sku, nom, ligne_id }
 * Une ligne du bon « hors commande » est en fait une ligne commandée (autre code, autre libellé) :
 * on mémorise la référence fournisseur comme alias de la fiche (le rapprochement des factures et des
 * prochains bons la reconnaîtra), et on corrige le document lu de cette réception.
 */
export async function POST(req: NextRequest) {
  try { await getEtablissement(req); } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const body = (await req.json().catch(() => ({}))) as { session_id?: string; sku?: string | null; nom?: string | null; ligne_id?: string };
  const sessionId = String(body.session_id ?? ""), ligneId = String(body.ligne_id ?? "");
  const sku = (body.sku ?? "").trim(), nom = (body.nom ?? "").trim();
  if (!sessionId || !ligneId || (!sku && !nom)) return NextResponse.json({ error: "session_id, ligne_id et sku ou nom requis" }, { status: 400 });

  const [{ data: session }, { data: ligne }] = await Promise.all([
    supabaseAdmin.from("commande_sessions").select("id, supplier_id, document_lu").eq("id", sessionId).maybeSingle(),
    supabaseAdmin.from("commande_lignes").select("id, session_id, ingredient_id").eq("id", ligneId).maybeSingle(),
  ]);
  if (!session) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
  if (!ligne || ligne.session_id !== sessionId) return NextResponse.json({ error: "Ligne introuvable dans cette commande" }, { status: 404 });
  if (!ligne.ingredient_id) return NextResponse.json({ error: "Cette ligne n'a pas de fiche produit" }, { status: 400 });

  // Alias : le code du bon (ou le libellé normalisé s'il n'y a pas de code) pointe vers la fiche commandée
  const cle = cleReference(sku, nom);
  const { error: eAlias } = await supabaseAdmin.from("ingredient_supplier_refs").upsert({ supplier_id: session.supplier_id, sku: cle, ingredient_id: ligne.ingredient_id, label: nom || null }, { onConflict: "supplier_id,sku" });
  if (eAlias) return NextResponse.json({ error: eAlias.message }, { status: 500 });

  // Le document de cette réception : la ligne reconnue porte maintenant la fiche
  const lu = (session.document_lu ?? null) as DocumentLu | null;
  if (lu) {
    const memeLigne = (l: { sku: string | null; nom: string }) => (sku ? (l.sku ?? "").trim() === sku : l.nom.trim().toLowerCase() === nom.toLowerCase());
    lu.lignes = lu.lignes.map((l) => (memeLigne(l) ? { ...l, ingredient_id: ligne.ingredient_id } : l));
    const { error } = await supabaseAdmin.from("commande_sessions").update({ document_lu: lu }).eq("id", sessionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, document: lu });
}
