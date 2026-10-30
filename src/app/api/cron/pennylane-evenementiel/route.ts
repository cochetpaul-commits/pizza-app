import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cronUnauthorized } from "@/lib/cronAuth";
import { pennylaneConfigured } from "@/lib/pennylane/api";
import { syncEvenementiel } from "@/lib/pennylane/syncEvenementiel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET /api/cron/pennylane-evenementiel — chaque matin, les devis et factures clients de Piccola Mia depuis Pennylane */
export async function GET(req: NextRequest) {
  const refus = cronUnauthorized(req);
  if (refus) return refus;
  if (!pennylaneConfigured("piccola")) return NextResponse.json({ ok: false, error: "Clé Pennylane Piccola Mia absente" }, { status: 503 });
  const { data: etabs } = await supabaseAdmin.from("etablissements").select("id, slug");
  const out: unknown[] = [];
  for (const e of (etabs ?? []) as { id: string; slug: string | null }[]) {
    if (!(e.slug ?? "").includes("piccola")) continue;
    try { out.push({ etablissement: e.slug, ...(await syncEvenementiel(e.id, "piccola")) }); }
    catch (err) { out.push({ etablissement: e.slug, erreur: err instanceof Error ? err.message : "erreur" }); }
  }
  return NextResponse.json({ ok: true, resultats: out });
}
