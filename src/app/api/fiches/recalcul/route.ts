import { NextRequest, NextResponse } from "next/server";
import { montantsAutorises } from "@/lib/montantsServeur";
import { appliquerRecalcul, calculerRecalcul } from "@/lib/fiche/recalculServeur";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET : ce qui changerait (rien n'est écrit). POST : applique. Réservé aux responsables. */
export async function GET(req: NextRequest) {
  if (!(await montantsAutorises(req))) return NextResponse.json({ error: "Réservé aux responsables" }, { status: 403 });
  try {
    const { changements, nbFiches } = await calculerRecalcul();
    return NextResponse.json({ nbFiches, changements });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  if (!(await montantsAutorises(req))) return NextResponse.json({ error: "Réservé aux responsables" }, { status: 403 });
  try {
    const r = await appliquerRecalcul();
    return NextResponse.json({ ok: r.echecs.length === 0, ...r });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 }); }
}
