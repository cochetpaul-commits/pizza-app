import { NextRequest, NextResponse } from "next/server";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";
import { ecranCommande, fixerApport } from "@/lib/commandeSimplifiee";

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
  const r = await ecranCommande(supplierId, auth.etabId, auth.userId, req.nextUrl.searchParams.get("type"));
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  const auth = await authEtab(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({}));
  const r = await fixerApport(body, auth.etabId, auth.userId);
  return NextResponse.json(r.body, { status: r.status });
}
