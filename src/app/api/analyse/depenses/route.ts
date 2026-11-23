import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { etabAccessDenied } from "@/lib/getEtablissement";
import { toutesLesPages } from "@/lib/supabaseChunks";
import { LIBELLES } from "@/lib/pennylane/syncCharges";
import { moisDePeriode, regrouperDepenses, type LigneDepense } from "@/lib/analyse/depenses";

export const dynamic = "force-dynamic";

/**
 * GET /api/analyse/depenses?etablissement_id=…&from=AAAA-MM-JJ&to=AAAA-MM-JJ (24/11/2026)
 * Toutes les dépenses Pennylane de la période par poste et catégorie, face aux mois d'avant. Responsables seulement :
 * on y voit les salaires et la rémunération des gérants.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const etabId = sp.get("etablissement_id"), from = sp.get("from"), to = sp.get("to");
  if (!etabId || !from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "etablissement_id, from, to requis" }, { status: 400 });
  }
  const denied = await etabAccessDenied(req, etabId, ["group_admin", "manager"]);
  if (denied) return denied;
  const { mois, moisPrec } = moisDePeriode(from, to);
  if (!mois.length) return NextResponse.json({ error: "période vide" }, { status: 400 });
  const { data, error } = await toutesLesPages<LigneDepense>((de, a) => supabaseAdmin.from("charges_detail")
    .select("mois, date, poste, categorie, fournisseur, libelle, montant_ht, type")
    .eq("etablissement_id", etabId).gte("mois", `${moisPrec[0]}-01`).lte("mois", `${mois[mois.length - 1]}-01`)
    .order("mois").order("id").range(de, a));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: derniere } = await supabaseAdmin.from("charges_detail").select("created_at").eq("etablissement_id", etabId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return NextResponse.json({ ...regrouperDepenses(data, mois, moisPrec, LIBELLES), synchro: (derniere?.created_at as string | undefined) ?? null });
}
