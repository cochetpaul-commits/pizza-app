import { NextRequest, NextResponse } from "next/server";
import { adminAppelant } from "@/lib/getEtablissement";
import { AccesErreur, inviter, listerComptes } from "@/lib/accesEquipe";
import { origineSite } from "@/lib/origineSite";

export const runtime = "nodejs";

function erreur(e: unknown) {
  if (e instanceof AccesErreur) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
}

/** GET — comptes (profil + état de connexion), établissements, derniers changements. Admins uniquement. */
export async function GET(req: NextRequest) {
  const a = await adminAppelant(req);
  if (a instanceof NextResponse) return a;
  try { return NextResponse.json(await listerComptes()); } catch (e) { return erreur(e); }
}

/** POST — inviter un employé { email, nom, role, etablissements }. Compte existant : refusé. */
export async function POST(req: NextRequest) {
  const a = await adminAppelant(req);
  if (a instanceof NextResponse) return a;
  try {
    const body = await req.json();
    return NextResponse.json({ ok: true, ...(await inviter(body, a.userId, origineSite(req))) });
  } catch (e) { return erreur(e); }
}
