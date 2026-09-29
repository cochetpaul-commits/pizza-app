import { NextRequest, NextResponse } from "next/server";
import { etabAccessDenied, roleDenied } from "@/lib/getEtablissement";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ajouterLigne, chargerInventaire, cloturer, importerFeuille, rouvrir } from "@/lib/inventaireServeur";

export const runtime = "nodejs";

/**
 * POST /api/inventaires/[id]  { action: "importer", tableau } | { action: "ajouter", ingredient_id, zone }
 *                             | { action: "cloturer" } | { action: "rouvrir" } (admins)
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

  const body = (await req.json().catch(() => ({}))) as { action?: string; tableau?: unknown; ingredient_id?: string; zone?: string };
  let r;
  if (body.action === "importer") {
    if (!Array.isArray(body.tableau)) return NextResponse.json({ error: "Fichier illisible" }, { status: 400 });
    r = await importerFeuille(inv, body.tableau as unknown[][], userId);
  } else if (body.action === "ajouter") {
    if (!body.ingredient_id || !body.zone) return NextResponse.json({ error: "Produit et zone requis" }, { status: 400 });
    r = await ajouterLigne(inv, body.ingredient_id, body.zone);
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
