import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pennylaneConfigured, type PlDossier } from "@/lib/pennylane/api";
import { cronOrAdminUnauthorized } from "@/lib/cronAuth";
import { autoImportFactures } from "@/lib/invoices/autoImport";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron quotidien — récupération automatique des factures Pennylane pour
 * chaque établissement dont le dossier a une clé API :
 *  - Bello Mio   → SARL SASHA
 *  - Piccola Mia → SARL I FRATELLI
 * ?days=N pour élargir la fenêtre (défaut 5, max 60) — utile au premier passage.
 */
export async function GET(req: NextRequest) {
  // Cron (secret) ou administrateur depuis le bouton « Récupérer maintenant »
  const denied = await cronOrAdminUnauthorized(req);
  if (denied) return denied;

  const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("days") ?? "5", 10) || 5, 1), 60);

  const { data: etabs } = await supabaseAdmin
    .from("etablissements").select("id, slug, nom").eq("actif", true);

  const out: Record<string, unknown> = {};
  for (const etab of etabs ?? []) {
    const dossier: PlDossier = ((etab.slug as string) ?? "").includes("bello") ? "bello" : "piccola";
    if (!pennylaneConfigured(dossier)) continue;
    try {
      out[(etab.nom as string) ?? (etab.slug as string)] = await autoImportFactures(etab.id as string, days, dossier);
    } catch (e) {
      out[(etab.nom as string) ?? (etab.slug as string)] = { erreur: e instanceof Error ? e.message : "erreur" };
    }
  }
  if (Object.keys(out).length === 0) {
    return NextResponse.json({ error: "Aucune clé Pennylane configurée" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...out });
}
