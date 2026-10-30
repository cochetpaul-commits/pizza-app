import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { etabAccessDenied, roleDenied } from "@/lib/getEtablissement";
import { pennylaneConfigured } from "@/lib/pennylane/api";
import { syncEvenementiel, type LigneEvenementiel } from "@/lib/pennylane/syncEvenementiel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET  /api/evenementiel?etablissement_id=…&from=…&to=…  — devis et factures Pennylane de la période, et les totaux
 * POST /api/evenementiel { etablissement_id }               — resynchronise depuis Pennylane (managers et admins)
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const etabId = sp.get("etablissement_id"), from = sp.get("from"), to = sp.get("to");
  if (!etabId || !from || !to) return NextResponse.json({ error: "etablissement_id, from et to requis" }, { status: 400 });
  const refus = await etabAccessDenied(req, etabId);
  if (refus) return refus;
  const { data, error } = await supabaseAdmin.from("evenementiel_pennylane").select("*").eq("etablissement_id", etabId).eq("archive", false)
    .gte("date", from).lte("date", to).order("date", { ascending: false }).order("numero", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const lignes = (data ?? []) as LigneEvenementiel[];
  const factures = lignes.filter((l) => l.type === "facture" && l.statut !== "cancelled");
  const devis = lignes.filter((l) => l.type === "devis");
  const totaux = {
    facture_ht: factures.reduce((t, f) => t + f.montant_ht, 0),
    facture_ttc: factures.reduce((t, f) => t + f.montant_ttc, 0),
    encaisse_ttc: factures.filter((f) => f.paye).reduce((t, f) => t + f.montant_ttc, 0),
    a_encaisser_ttc: factures.filter((f) => !f.paye).reduce((t, f) => t + (f.reste_ttc ?? f.montant_ttc), 0),
    nb_factures: factures.length,
    devis_en_attente: devis.filter((d) => d.statut === "pending").length,
    devis_en_attente_ht: devis.filter((d) => d.statut === "pending").reduce((t, d) => t + d.montant_ht, 0),
  };
  const { data: derniere } = await supabaseAdmin.from("evenementiel_pennylane").select("synchro_at").eq("etablissement_id", etabId).order("synchro_at", { ascending: false }).limit(1).maybeSingle();
  return NextResponse.json({ lignes, totaux, synchro_at: derniere?.synchro_at ?? null });
}

export async function POST(req: NextRequest) {
  const refus = await roleDenied(req, ["group_admin", "manager"]);
  if (refus) return refus;
  const body = (await req.json().catch(() => ({}))) as { etablissement_id?: string };
  const etabId = String(body.etablissement_id ?? "");
  if (!etabId) return NextResponse.json({ error: "etablissement_id requis" }, { status: 400 });
  const acces = await etabAccessDenied(req, etabId);
  if (acces) return acces;
  if (!pennylaneConfigured("piccola")) return NextResponse.json({ error: "Clé Pennylane Piccola Mia absente" }, { status: 503 });
  try {
    const r = await syncEvenementiel(etabId, "piccola");
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Synchronisation impossible" }, { status: 500 });
  }
}
