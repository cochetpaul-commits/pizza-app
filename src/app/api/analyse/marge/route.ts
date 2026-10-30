import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { etabAccessDenied } from "@/lib/getEtablissement";
import { LIBELLES } from "@/lib/pennylane/syncCharges";
import { chargesParMois, dernierJourMois } from "@/lib/analyse/chargesParMois";

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
  /** La paie de ce mois est-elle passée en banque (début du mois suivant) ? */
  paie_connue: boolean;
  /** PPV, soldes de tout compte : coût réel mais hors rythme de croisière (sorti de postes.masse_salariale) */
  paie_exceptionnelle: number;
  /** Pourboires centralisés passés en paie : argent des clients, sorti de postes.masse_salariale */
  pourboires_paie: number;
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
  const dernierJour = dernierJourMois;
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const [cas, { parMois, error }, { data: objectifs }] = await Promise.all([
    Promise.all(moisListe.map(async (m) => {
      const [{ data }, { data: evt }] = await Promise.all([
        supabaseAdmin.rpc("ventes_ca_periode", { p_etab: etabId, p_from: `${m}-01`, p_to: dernierJour(m) }),
        // Événementiel facturé dans Pennylane (Piccola Mia, 30/10/2026) : compté dans le CA du mois de la facture
        supabaseAdmin.from("evenementiel_pennylane").select("montant_ht, montant_ttc").eq("etablissement_id", etabId).eq("type", "facture").eq("archive", false).neq("statut", "cancelled").gte("date", `${m}-01`).lte("date", dernierJour(m)),
      ]);
      const row = Array.isArray(data) ? data[0] : data;
      const evtHt = (evt ?? []).reduce((t, x) => t + Number(x.montant_ht ?? 0), 0), evtTtc = (evt ?? []).reduce((t, x) => t + Number(x.montant_ttc ?? 0), 0);
      return { mois: m, ca_ht: Number(row?.ca_ht ?? 0) + evtHt, ca_ttc: Number(row?.ca_ttc ?? 0) + evtTtc };
    })),
    chargesParMois(etabId, moisListe),
    supabaseAdmin.from("objectifs").select("cle, valeur").eq("etablissement_id", etabId).in("cle", ["ratio_masse_sal", "ratio_matiere"]),
  ]);
  if (error) return NextResponse.json({ error }, { status: 500 });

  const mois: MoisMarge[] = cas.map((c) => {
    const ch = parMois.get(c.mois) ?? { postes: {}, paie_connue: false, paie_exceptionnelle: 0, pourboires_paie: 0 };
    return { ...c, postes: ch.postes, clos: dernierJour(c.mois) < aujourdhui, paie_connue: ch.paie_connue, paie_exceptionnelle: ch.paie_exceptionnelle, pourboires_paie: ch.pourboires_paie };
  });
  const obj: Record<string, number> = {};
  for (const o of objectifs ?? []) obj[o.cle as string] = Number(o.valeur);
  return NextResponse.json({ mois, libelles: LIBELLES, postes_exploitation: POSTES_EXPLOITATION, objectifs: obj });
}
