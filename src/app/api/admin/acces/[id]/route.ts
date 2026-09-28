import { NextRequest, NextResponse } from "next/server";
import { adminAppelant } from "@/lib/getEtablissement";
import { AccesErreur, changerActivation, modifierCompte, renvoyerInvitation } from "@/lib/accesEquipe";
import { origineSite } from "@/lib/origineSite";

export const runtime = "nodejs";

function erreur(e: unknown) {
  if (e instanceof AccesErreur) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
}

/** PATCH — rôle et/ou établissements { role?, etablissements? } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await adminAppelant(req);
  if (a instanceof NextResponse) return a;
  const { id } = await params;
  try {
    const body = await req.json();
    return NextResponse.json({ ok: true, ...(await modifierCompte(id, body, a.userId)) });
  } catch (e) { return erreur(e); }
}

/** POST — { action: "desactiver" | "reactiver" | "renvoyer" } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await adminAppelant(req);
  if (a instanceof NextResponse) return a;
  const { id } = await params;
  try {
    const { action, note } = (await req.json()) as { action?: string; note?: string };
    if (action === "desactiver") return NextResponse.json({ ok: true, ...(await changerActivation(id, false, a.userId, note)) });
    if (action === "reactiver") return NextResponse.json({ ok: true, ...(await changerActivation(id, true, a.userId, note)) });
    if (action === "renvoyer") return NextResponse.json(await renvoyerInvitation(id, a.userId, origineSite(req)));
    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e) { return erreur(e); }
}
