import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { etabAccessDenied } from "@/lib/getEtablissement";
import { LIBELLES } from "@/lib/pennylane/syncCharges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/analyse/marge?etablissement_id=X&from=YYYY-MM-DD&to=YYYY-MM-DD   (10/10/2026)
 *
 * Mois par mois, ce qu'il faut pour la page Analyse › Marge : CA HT / TTC (ventes Popina,
 * agrégat SQL) et les charges Pennylane par poste (charges_mensuelles). Tout mois qui touche
 * la période est renvoyé en entier (les charges sont mensuelles). Pas de coût théorique ici :
 * il reste dans /api/rentabilite, trop lourd pour six mois d'un coup.
 */
export type MoisMarge = {
  /** YYYY-MM */
  mois: string;
  ca_ht: number;
  ca_ttc: number;
  /** Montants HT par poste Pennylane (achats_matieres, masse_salariale, remuneration_gerants, loyer…) */
  postes: Record<string, number>;
  /** Le mois est-il terminé (sinon ses charges sont partielles) */
  clos: boolean;
};

const POSTES_EXPLOITATION = ["loyer", "energie", "commissions_cb", "entretien", "assurances", "honoraires", "locations", "autres_charges", "a_categoriser"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const etabId = searchParams.get("etablissement_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!etabId || !from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "etablissement_id, from, to requis" }, { status: 400 });
  }
  const denied = await etabAccessDenied(req, etabId, ["group_admin", "manager"]);
  if (denied) return denied;

  // Mois touchés par la période (au plus 24)
  const moisListe: string[] = [];
  const d = new Date(from.slice(0, 7) + "-01T12:00:00");
  const fin = new Date(to.slice(0, 7) + "-01T12:00:00");
  while (d <= fin && moisListe.length < 24) { moisListe.push(d.toISOString().slice(0, 7)); d.setMonth(d.getMonth() + 1); }
  const dernierJour = (m: string) => { const [a, mm] = m.split("-").map(Number); return `${m}-${String(new Date(a, mm, 0).getDate()).padStart(2, "0")}`; };
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const [cas, { data: charges, error }, { data: objectifs }] = await Promise.all([
    Promise.all(moisListe.map(async (m) => {
      const { data } = await supabaseAdmin.rpc("ventes_ca_periode", { p_etab: etabId, p_from: `${m}-01`, p_to: dernierJour(m) });
      const row = Array.isArray(data) ? data[0] : data;
      return { mois: m, ca_ht: Number(row?.ca_ht ?? 0), ca_ttc: Number(row?.ca_ttc ?? 0) };
    })),
    supabaseAdmin.from("charges_mensuelles").select("mois, poste, montant_ht").eq("etablissement_id", etabId)
      .gte("mois", `${moisListe[0]}-01`).lte("mois", `${moisListe[moisListe.length - 1]}-01`),
    supabaseAdmin.from("objectifs").select("cle, valeur").eq("etablissement_id", etabId).in("cle", ["ratio_masse_sal", "ratio_matiere"]),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const parMois = new Map<string, Record<string, number>>();
  for (const c of charges ?? []) {
    const m = String(c.mois).slice(0, 7);
    const p = parMois.get(m) ?? {};
    p[c.poste as string] = (p[c.poste as string] ?? 0) + Number(c.montant_ht ?? 0);
    parMois.set(m, p);
  }
  const mois: MoisMarge[] = cas.map((c) => ({ ...c, postes: parMois.get(c.mois) ?? {}, clos: dernierJour(c.mois) < aujourdhui }));
  const obj: Record<string, number> = {};
  for (const o of objectifs ?? []) obj[o.cle as string] = Number(o.valeur);
  return NextResponse.json({ mois, libelles: LIBELLES, postes_exploitation: POSTES_EXPLOITATION, objectifs: obj });
}
