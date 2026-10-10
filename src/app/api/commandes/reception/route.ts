import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement } from "@/lib/getEtablissement";
import { ETATS, montantReclame, quantiteEnStock, type EtatReception, type LigneControle } from "@/lib/reception";

/**
 * Contrôle de réception d'une commande (10/10/2026, sur le modèle ComandR).
 *
 * GET  /api/commandes/reception?session_id=xxx
 *   La commande (fournisseur, date, statut, total) et ses lignes avec leur état de contrôle.
 * PATCH /api/commandes/reception
 *   Body : { session_id, lines: [{ id, etat_reception, qty_received, prix_recu, facture_sur_bon, reception_note }], finalize? }
 *   Enregistre le contrôle ligne par ligne (le montant à réclamer est calculé ici), et si
 *   `finalize` : passe la commande en « reçue » et crée les mouvements de stock avec ce qui est
 *   réellement entré (rien pour un manquant ou un refusé, la quantité reçue pour un partiel).
 */
type LigneDb = {
  id: string; ingredient_id: string | null; quantite: number; unite: string | null; prix_unitaire_ht: number | null;
  qty_received: number | null; checked: boolean | null; reception_note: string | null;
  etat_reception: EtatReception | null; prix_recu: number | null; facture_sur_bon: boolean | null; montant_reclame: number | null; litige_statut: string | null;
  ingredients: { name: string; category: string | null; storage_zone?: string | null } | null;
};

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "session_id requis" }, { status: 400 });

  const { data: lines, error } = await supabaseAdmin
    .from("commande_lignes")
    .select("id, ingredient_id, quantite, unite, prix_unitaire_ht, qty_received, checked, reception_note, etat_reception, prix_recu, facture_sur_bon, montant_reclame, litige_statut, ingredients(name, category, storage_zone)")
    .eq("session_id", sessionId)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: session } = await supabaseAdmin
    .from("commande_sessions")
    .select("id, status, supplier_id, created_at, email_sent_at, received_at, total_ht, notes, suppliers(name)")
    .eq("id", sessionId)
    .single();

  return NextResponse.json({
    session: session ? {
      id: session.id,
      status: session.status,
      supplier_id: session.supplier_id,
      supplier_name: (session.suppliers as unknown as { name: string } | null)?.name ?? "",
      created_at: session.created_at,
      email_sent_at: session.email_sent_at,
      received_at: session.received_at,
      total_ht: session.total_ht != null ? Number(session.total_ht) : null,
      notes: session.notes,
    } : null,
    lines: ((lines ?? []) as unknown as LigneDb[]).map((l) => ({
      id: l.id,
      ingredient_id: l.ingredient_id,
      ingredient_name: l.ingredients?.name ?? "?",
      category: l.ingredients?.category ?? null,
      storage_zone: l.ingredients?.storage_zone ?? null,
      quantite: Number(l.quantite),
      unite: l.unite,
      prix_unitaire_ht: l.prix_unitaire_ht != null ? Number(l.prix_unitaire_ht) : null,
      qty_received: l.qty_received != null ? Number(l.qty_received) : null,
      reception_note: l.reception_note,
      // Anciennes réceptions (case cochée sans état) : lues comme « reçu »
      etat_reception: l.etat_reception ?? (l.checked ? "recu" : null),
      prix_recu: l.prix_recu != null ? Number(l.prix_recu) : null,
      facture_sur_bon: l.facture_sur_bon ?? true,
      montant_reclame: l.montant_reclame != null ? Number(l.montant_reclame) : 0,
      litige_statut: l.litige_statut,
    })),
  });
}

type LigneEntree = { id: string; etat_reception: EtatReception | null; qty_received: number | null; prix_recu: number | null; facture_sur_bon: boolean; reception_note?: string | null };

export async function PATCH(req: NextRequest) {
  let userId: string | null = null;
  try { userId = (await getEtablissement(req)).userId; } catch { /* appel sans jeton : on enregistre sans auteur */ }

  const body = await req.json().catch(() => null) as { session_id?: string; lines?: LigneEntree[]; finalize?: boolean } | null;
  const { session_id, lines, finalize } = body ?? {};
  if (!session_id || !Array.isArray(lines)) return NextResponse.json({ error: "session_id et lines requis" }, { status: 400 });

  const { data: existantes, error: errLignes } = await supabaseAdmin
    .from("commande_lignes")
    .select("id, ingredient_id, quantite, unite, prix_unitaire_ht, litige_statut")
    .eq("session_id", session_id);
  if (errLignes) return NextResponse.json({ error: errLignes.message }, { status: 500 });
  const parId = new Map((existantes ?? []).map((l) => [l.id as string, l]));

  const maintenant = new Date().toISOString();
  for (const entree of lines) {
    const base = parId.get(entree.id);
    if (!base) continue;
    const etat = entree.etat_reception && ETATS[entree.etat_reception] ? entree.etat_reception : null;
    const ctrl: LigneControle = {
      quantite: Number(base.quantite) || 0,
      prix_unitaire_ht: base.prix_unitaire_ht != null ? Number(base.prix_unitaire_ht) : null,
      etat_reception: etat,
      qty_received: entree.qty_received != null ? Number(entree.qty_received) : null,
      prix_recu: entree.prix_recu != null ? Number(entree.prix_recu) : null,
      facture_sur_bon: entree.facture_sur_bon !== false,
    };
    const montant = montantReclame(ctrl);
    // Le statut de litige ne repart à « à réclamer » que si le montant change ou apparaît ; un litige déjà réclamé garde son statut
    const statutActuel = base.litige_statut as string | null;
    const litige = montant > 0 ? (statutActuel && statutActuel !== "abandonne" ? statutActuel : "a_reclamer") : null;
    const { error } = await supabaseAdmin
      .from("commande_lignes")
      .update({
        etat_reception: etat,
        checked: etat != null,
        qty_received: etat ? quantiteEnStock(ctrl) : null,
        prix_recu: etat === "prix" ? ctrl.prix_recu : null,
        facture_sur_bon: ctrl.facture_sur_bon,
        reception_note: entree.reception_note?.trim() || null,
        montant_reclame: montant > 0 ? montant : null,
        litige_statut: litige,
        controle_at: etat ? maintenant : null,
        controle_par: etat ? userId : null,
      })
      .eq("id", entree.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (finalize) {
    const { data: sess, error: errSess } = await supabaseAdmin
      .from("commande_sessions")
      .update({ status: "recue", received_at: maintenant })
      .eq("id", session_id)
      .select("etablissement_id, created_by")
      .single();
    if (errSess) return NextResponse.json({ error: errSess.message }, { status: 500 });

    // Mouvements de stock : ce qui est réellement entré. Une validation rejouée remplace les mouvements précédents.
    const { data: finales } = await supabaseAdmin
      .from("commande_lignes")
      .select("id, ingredient_id, quantite, unite, prix_unitaire_ht, etat_reception, qty_received, prix_recu, facture_sur_bon")
      .eq("session_id", session_id);
    await supabaseAdmin.from("stock_movements").delete().eq("reference_type", "commande_session").eq("reference_id", session_id);
    const movements = (finales ?? [])
      .map((l) => {
        const q = quantiteEnStock({
          quantite: Number(l.quantite) || 0, prix_unitaire_ht: l.prix_unitaire_ht != null ? Number(l.prix_unitaire_ht) : null,
          etat_reception: (l.etat_reception as EtatReception | null) ?? "recu", qty_received: l.qty_received != null ? Number(l.qty_received) : null,
          prix_recu: l.prix_recu != null ? Number(l.prix_recu) : null, facture_sur_bon: l.facture_sur_bon ?? true,
        });
        return { ingredient_id: l.ingredient_id, q, unit: l.unite };
      })
      .filter((m) => m.ingredient_id && m.q > 0)
      .map((m) => ({
        etablissement_id: sess.etablissement_id,
        ingredient_id: m.ingredient_id,
        type: "reception" as const,
        quantity: m.q,
        unit: m.unit,
        reference_type: "commande_session",
        reference_id: session_id,
        created_by: userId ?? sess.created_by,
      }));
    if (movements.length > 0) {
      const { error } = await supabaseAdmin.from("stock_movements").insert(movements);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
