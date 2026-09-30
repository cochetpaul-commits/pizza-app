import { NextRequest, NextResponse } from "next/server";
import { etabAccessDenied, roleDenied } from "@/lib/getEtablissement";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ajouterLigne, ajouterLignes, chargerInventaire, cloturer, creerProduitEtLigne, importerFeuille, rouvrir } from "@/lib/inventaireServeur";
import type { CreationProduit } from "@/lib/inventaire";

export const runtime = "nodejs";

/**
 * POST /api/inventaires/[id]  { action: "importer", tableau } | { action: "ajouter", ingredient_id | ingredient_ids[], zone }
 *                             | { action: "creer", nom, categorie, zone } | { action: "cloturer" } | { action: "rouvrir" } (admins)
 * Admins et managers de l'établissement de l'inventaire.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await chargerInventaire(id);
  if (!inv) return NextResponse.json({ error: "Inventaire introuvable" }, { status: 404 });
  const refus = await etabAccessDenied(req, inv.etablissement_id, ["group_admin", "manager"]);
  if (refus) return refus;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await supabaseAdmin.auth.getUser(token);
  const userId = auth.user?.id;
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: string; tableau?: unknown; ingredient_id?: string; ingredient_ids?: string[]; zone?: string; nom?: string; categorie?: string;
    /** création rapide : fiche minimale (unité d'achat, type de pièce, taille, colisage, fournisseur, sous-catégorie), sans prix */
    fiche?: Partial<CreationProduit>;
  };
  let r;
  if (body.action === "importer") {
    if (!Array.isArray(body.tableau)) return NextResponse.json({ error: "Fichier illisible" }, { status: 400 });
    r = await importerFeuille(inv, body.tableau as unknown[][], userId);
  } else if (body.action === "ajouter") {
    if (!body.zone || (!body.ingredient_id && !Array.isArray(body.ingredient_ids))) return NextResponse.json({ error: "Produit et zone requis" }, { status: 400 });
    r = Array.isArray(body.ingredient_ids) ? await ajouterLignes(inv, body.ingredient_ids.map(String), body.zone) : await ajouterLigne(inv, String(body.ingredient_id), body.zone);
  } else if (body.action === "creer") {
    if (!body.nom || !body.categorie || !body.zone) return NextResponse.json({ error: "Nom, catégorie et zone requis" }, { status: 400 });
    const f = body.fiche ?? {};
    r = await creerProduitEtLigne(inv, {
      nom: String(body.nom), categorie: String(body.categorie), sous_categorie: f.sous_categorie ?? null, supplier_id: f.supplier_id ?? null,
      unite: f.unite ?? "piece", type_piece: f.type_piece ?? null, taille_qte: f.taille_qte ?? null, taille_unite: f.taille_unite ?? null,
      colisage: f.colisage ?? null, contenu: f.contenu ?? null,
    }, String(body.zone), userId);
  } else if (body.action === "cloturer") {
    r = await cloturer(inv, userId);
  } else if (body.action === "rouvrir") {
    const refusAdmin = await roleDenied(req, ["group_admin"]);
    if (refusAdmin) return refusAdmin;
    r = await rouvrir(inv, userId);
  } else {
    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  }
  return NextResponse.json(r.body, { status: r.status });
}

/**
 * DELETE /api/inventaires/[id] : supprime l'inventaire et toutes ses lignes.
 * Admins et managers de l'établissement ; un inventaire clôturé ne se supprime que par un admin.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await chargerInventaire(id);
  if (!inv) return NextResponse.json({ error: "Inventaire introuvable" }, { status: 404 });
  const refus = await etabAccessDenied(req, inv.etablissement_id, ["group_admin", "manager"]);
  if (refus) return refus;
  if (inv.statut === "cloture") {
    const refusAdmin = await roleDenied(req, ["group_admin"]);
    if (refusAdmin) return NextResponse.json({ error: "Inventaire clôturé : seul un admin peut le supprimer" }, { status: 403 });
  }
  const { count } = await supabaseAdmin.from("inventaire_lignes").select("id", { count: "exact", head: true }).eq("inventaire_id", id);
  const { error } = await supabaseAdmin.from("inventaires").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, lignes: count ?? 0 });
}
