import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/rh/compteurs?periode=2026-02
 *
 * Retourne les compteurs mensuels de tous les employés pour la période donnée.
 * Le solde_rc est le cumul : solde_rc du mois précédent + rc_acquis du mois.
 */
export async function GET(req: NextRequest) {
  let etabId: string;
  try {
    ({ etabId } = await getEtablissement(req));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const periode = req.nextUrl.searchParams.get("periode");
  if (!periode) {
    return NextResponse.json({ error: "periode requis (YYYY-MM)" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("compteurs_employe")
    .select("*")
    .eq("etablissement_id", etabId)
    .eq("periode", periode);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ compteurs: data ?? [] });
}

/**
 * POST /api/rh/compteurs
 *
 * Upsert les compteurs mensuels pour un ou plusieurs employés.
 * Body: { compteurs: Array<{ employe_id, periode, ...fields }> }
 *
 * Calcule automatiquement solde_rc = solde_rc du mois précédent + rc_acquis.
 */
export async function POST(req: NextRequest) {
  let etabId: string;
  try {
    ({ etabId } = await getEtablissement(req));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const body = await req.json();
  const compteurs = body.compteurs as Array<{
    employe_id: string;
    periode: string;
    heures_contractuelles?: number;
    heures_travaillees?: number;
    heures_normales?: number;
    heures_comp_10?: number;
    heures_comp_25?: number;
    heures_supp_10?: number;
    heures_supp_20?: number;
    heures_supp_25?: number;
    heures_supp_50?: number;
    jours_travailles?: number;
    nb_repas?: number;
    rc_acquis?: number;
  }>;

  if (!compteurs?.length) {
    return NextResponse.json({ error: "compteurs array requis" }, { status: 400 });
  }

  // For each compteur, fetch previous month's solde_rc to compute new solde
  const results = [];
  for (const c of compteurs) {
    // Compute previous period
    const [yearStr, monthStr] = c.periode.split("-");
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevPeriode = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

    // Get previous solde_rc
    const { data: prev } = await supabaseAdmin
      .from("compteurs_employe")
      .select("solde_rc")
      .eq("employe_id", c.employe_id)
      .eq("periode", prevPeriode)
      .maybeSingle();

    const prevSolde = prev?.solde_rc ?? 0;
    const rcAcquis = c.rc_acquis ?? 0;
    const newSolde = Math.round((prevSolde + rcAcquis) * 100) / 100;

    const row = {
      employe_id: c.employe_id,
      etablissement_id: etabId,
      periode: c.periode,
      heures_contractuelles: c.heures_contractuelles ?? 0,
      heures_travaillees: c.heures_travaillees ?? 0,
      heures_normales: c.heures_normales ?? 0,
      heures_comp_10: c.heures_comp_10 ?? 0,
      heures_comp_25: c.heures_comp_25 ?? 0,
      heures_supp_10: c.heures_supp_10 ?? 0,
      heures_supp_20: c.heures_supp_20 ?? 0,
      heures_supp_25: c.heures_supp_25 ?? 0,
      heures_supp_50: c.heures_supp_50 ?? 0,
      jours_travailles: c.jours_travailles ?? 0,
      nb_repas: c.nb_repas ?? 0,
      rc_acquis: rcAcquis,
      solde_rc: newSolde,
    };

    const { error } = await supabaseAdmin
      .from("compteurs_employe")
      .upsert(row, { onConflict: "employe_id,periode" });

    if (error) {
      results.push({ employe_id: c.employe_id, error: error.message });
    } else {
      results.push({ employe_id: c.employe_id, solde_rc: newSolde, ok: true });
    }
  }

  return NextResponse.json({ results });
}
