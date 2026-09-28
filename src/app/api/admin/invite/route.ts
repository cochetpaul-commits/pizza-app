import { NextRequest, NextResponse } from "next/server";
import { adminAppelant } from "@/lib/getEtablissement";
import { AccesErreur, inviter } from "@/lib/accesEquipe";
import { origineSite } from "@/lib/origineSite";

export const runtime = "nodejs";

/** POST — ancienne adresse de l'invitation : mêmes règles que /api/admin/acces (admins, compte existant refusé). */
export async function POST(req: NextRequest) {
  const a = await adminAppelant(req);
  if (a instanceof NextResponse) return a;
  try {
    const { email, role, displayName, etablissementsAccess } = await req.json();
    const r = await inviter({ email, nom: displayName, role, etablissements: etablissementsAccess }, a.userId, origineSite(req));
    return NextResponse.json({ ok: true, userId: r.id });
  } catch (e) {
    if (e instanceof AccesErreur) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
