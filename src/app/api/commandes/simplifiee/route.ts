import { NextRequest, NextResponse } from "next/server";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";
import { ecranCommande, fixerApport, fixerToujours } from "@/lib/commandeSimplifiee";
import { acteurAction } from "@/lib/tablette/acteur";

/** Commande simplifiée (Maël) : voir src/lib/commandeSimplifiee.ts */

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
  if (!supplierId) return NextResponse.json({ error: "supplier_id requis" }, { status: 400 });
  const acteur = await acteurAction(req, auth.userId, auth.etabId);
  const r = await ecranCommande(supplierId, auth.etabId, auth.userId, req.nextUrl.searchParams.get("type"), acteur);
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  const auth = await authEtab(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({}));
  const acteur = await acteurAction(req, auth.userId, auth.etabId);
  const r = await fixerApport(body, auth.etabId, auth.userId, acteur);
  return NextResponse.json(r.body, { status: r.status });
}

/** Épingler un produit dans la liste (toujours affiché) : { supplier_id, ingredient_id, toujours } */
export async function PATCH(req: NextRequest) {
  const auth = await authEtab(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({}));
  const r = await fixerToujours(body, auth.etabId, auth.userId);
  return NextResponse.json(r.body, { status: r.status });
}
