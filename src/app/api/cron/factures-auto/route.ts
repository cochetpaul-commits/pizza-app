import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pennylaneConfigured, type PlDossier } from "@/lib/pennylane/api";
import { cronOrAdminUnauthorized } from "@/lib/cronAuth";
import { autoImportFactures, autoImportCandidats } from "@/lib/invoices/autoImport";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron quotidien — récupération automatique des factures Pennylane pour
 * chaque établissement dont le dossier a une clé API :
 *  - Bello Mio   → SARL SASHA
 *  - Piccola Mia → SARL I FRATELLI
 * ?days=N pour élargir la fenêtre (défaut 30, max 200). 30 jours parce que
 * certaines factures (Mael…) arrivent dans Pennylane bien après leur date ;
 * la déduplication par identifiant Pennylane évite tout doublon.
 * ?liste=1 : n'écrit RIEN, renvoie seulement les factures qui seraient traitées
 * (pour valider un rattrapage avant de le lancer).
 */
export async function GET(req: NextRequest) {
  // Cron (secret) ou administrateur depuis le bouton « Récupérer maintenant »
  const denied = await cronOrAdminUnauthorized(req);
  if (denied) return denied;

  const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10) || 30, 1), 200);
  const listeSeule = req.nextUrl.searchParams.get("liste") === "1";

  const { data: etabs } = await supabaseAdmin
    .from("etablissements").select("id, slug, nom").eq("actif", true);

  const out: Record<string, unknown> = {};
  for (const etab of etabs ?? []) {
    const dossier: PlDossier = ((etab.slug as string) ?? "").includes("bello") ? "bello" : "piccola";
    if (!pennylaneConfigured(dossier)) continue;
    try {
      out[(etab.nom as string) ?? (etab.slug as string)] = listeSeule
        ? await autoImportCandidats(days, dossier)
        : await autoImportFactures(etab.id as string, days, dossier);
    } catch (e) {
      out[(etab.nom as string) ?? (etab.slug as string)] = { erreur: e instanceof Error ? e.message : "erreur" };
    }
  }
  if (Object.keys(out).length === 0) {
    return NextResponse.json({ error: "Aucune clé Pennylane configurée" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...out });
}
