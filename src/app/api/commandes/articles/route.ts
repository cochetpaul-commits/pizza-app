import { NextRequest, NextResponse } from "next/server";
import { getEtablissement, roleDenied, EtabError } from "@/lib/getEtablissement";
import { corrigerConditionnement, lireConditionnement } from "@/lib/commandeSimplifiee";

/** Conditionnement de commande d'un produit chez un fournisseur (bloc « Commande chez … » de la fiche produit) */

async function authEtab(req: NextRequest) {
  try {
    return await getEtablissement(req);
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const auth = await authEtab(req);
  if (auth instanceof NextResponse) return auth;
  const supplierId = req.nextUrl.searchParams.get("supplier_id");
  const ingredientId = req.nextUrl.searchParams.get("ingredient_id");
  if (!supplierId || !ingredientId) return NextResponse.json({ error: "supplier_id et ingredient_id requis" }, { status: 400 });
  const r = await lireConditionnement(supplierId, auth.etabId, ingredientId);
  return NextResponse.json(r.body, { status: r.status });
}

/** Correction : admins et managers de l'établissement */
export async function PATCH(req: NextRequest) {
  const refus = await roleDenied(req, ["group_admin", "manager"]);
  if (refus) return refus;
  const auth = await authEtab(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({}));
  const r = await corrigerConditionnement(body, auth.etabId);
  return NextResponse.json(r.body, { status: r.status });
}
