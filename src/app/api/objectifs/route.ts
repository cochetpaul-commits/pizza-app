import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { callerProfile, etabAccessDenied } from "@/lib/getEtablissement";
import { chargesParMois, dernierJourMois, moisPlus } from "@/lib/analyse/chargesParMois";
import { fusionnerReglages, type Personne, type Reglages, type ServiceVendu } from "@/lib/objectifs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/objectifs?etablissement_id=X&mois=12   (29/10/2026)
 * Tout ce qu'il faut à la page Objectifs : les mois (CA HT Popina, couverts, services, charges Pennylane
 * par poste), les services des huit dernières semaines (service type, hypothèses du simulateur),
 * l'équipe sous contrat (admins seulement : salaires) et les réglages.
 * PUT /api/objectifs { etablissement_id, reglages } : enregistre les réglages (admins et managers).
 */
export type MoisObjectifs = {
  mois: string; ca_ht: number; ca_ttc: number; couverts: number; services: number;
  clos: boolean; postes: Record<string, number>; paie_connue: boolean; paie_exceptionnelle: number;
};
export type ReponseObjectifs = {
  mois: MoisObjectifs[];
  services: ServiceVendu[];
  equipe: Personne[];
  reglages: Reglages;
  /** L'appelant voit les salaires (admin) */
  salaires: boolean;
  aujourdhui: string;
};

const CLE = "objectifs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const etabId = searchParams.get("etablissement_id");
  const nbMois = Math.min(24, Math.max(3, Number(searchParams.get("mois") ?? 12)));
  if (!etabId) return NextResponse.json({ error: "etablissement_id requis" }, { status: 400 });
  const denied = await etabAccessDenied(req, etabId, ["group_admin", "manager"]);
  if (denied) return denied;
  const profil = await callerProfile(req);
  const admin = profil?.role === "group_admin";

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const moisCourant = aujourdhui.slice(0, 7);
  const moisListe = Array.from({ length: nbMois }, (_, i) => moisPlus(moisCourant, i - nbMois + 1));
  // Huit semaines pleines, du lundi au dimanche, qui précèdent la semaine en cours
  const d = new Date(aujourdhui + "T12:00:00Z");
  const lundi = new Date(d); lundi.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const finServices = new Date(lundi); finServices.setUTCDate(lundi.getUTCDate() - 1);
  const debutServices = new Date(lundi); debutServices.setUTCDate(lundi.getUTCDate() - 56);

  const [ventes, services, { parMois, error }, { data: param }, employes] = await Promise.all([
    supabaseAdmin.rpc("ventes_services_periode", { p_etab: etabId, p_from: `${moisListe[0]}-01`, p_to: aujourdhui }),
    supabaseAdmin.rpc("ventes_services_periode", { p_etab: etabId, p_from: debutServices.toISOString().slice(0, 10), p_to: finServices.toISOString().slice(0, 10) }),
    chargesParMois(etabId, moisListe),
    supabaseAdmin.from("etablissement_params").select("valeur").eq("etablissement_id", etabId).eq("cle", CLE).maybeSingle(),
    admin ? lireEquipe(etabId) : Promise.resolve([] as Personne[]),
  ]);
  if (error) return NextResponse.json({ error }, { status: 500 });
  if (ventes.error) return NextResponse.json({ error: ventes.error.message }, { status: 500 });

  type Ligne = { date_service: string; service: string; ca_ht: number; ca_ttc: number; couverts: number };
  const parMoisVentes = new Map<string, { ca_ht: number; ca_ttc: number; couverts: number; services: number }>();
  for (const l of (ventes.data ?? []) as Ligne[]) {
    const m = String(l.date_service).slice(0, 7);
    const x = parMoisVentes.get(m) ?? { ca_ht: 0, ca_ttc: 0, couverts: 0, services: 0 };
    x.ca_ht += Number(l.ca_ht); x.ca_ttc += Number(l.ca_ttc); x.couverts += Number(l.couverts); x.services += Number(l.ca_ht) > 0 ? 1 : 0;
    parMoisVentes.set(m, x);
  }
  const mois = moisListe.map((m) => {
    const v = parMoisVentes.get(m) ?? { ca_ht: 0, ca_ttc: 0, couverts: 0, services: 0 };
    const ch = parMois.get(m) ?? { postes: {}, paie_connue: false, paie_exceptionnelle: 0, pourboires_paie: 0 };
    return { mois: m, ...v, clos: dernierJourMois(m) < aujourdhui, postes: ch.postes, paie_connue: ch.paie_connue, paie_exceptionnelle: ch.paie_exceptionnelle };
  });
  const reponse: ReponseObjectifs = {
    mois,
    services: ((services.data ?? []) as Ligne[]).map((l) => ({ date: String(l.date_service), svc: l.service === "midi" ? "midi" : "soir", ca_ht: Number(l.ca_ht), ca_ttc: Number(l.ca_ttc), couverts: Number(l.couverts) })),
    equipe: employes,
    reglages: fusionnerReglages((param?.valeur ?? null) as Partial<Reglages> | null),
    salaires: admin,
    aujourdhui,
  };
  return NextResponse.json(reponse);
}

/** Salariés sous contrat actif (les gérants TNS sont dans « Direction ») */
async function lireEquipe(etabId: string): Promise<Personne[]> {
  const { data: emps } = await supabaseAdmin.from("employes").select("id, prenom, nom, actif, etablissement_id, etablissements_ids")
    .eq("actif", true).or(`etablissement_id.eq.${etabId},etablissements_ids.cs.{${etabId}}`);
  const ids = (emps ?? []).map((e) => e.id as string);
  if (!ids.length) return [];
  const { data: contrats } = await supabaseAdmin.from("contrats").select("employe_id, type, heures_semaine, remuneration, emploi, actif, date_fin").in("employe_id", ids).eq("actif", true);
  const cap = (s: string) => s.toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());
  const equipe: Personne[] = [];
  for (const c of contrats ?? []) {
    if (String(c.type ?? "").toUpperCase() === "TNS") continue;
    const e = (emps ?? []).find((x) => x.id === c.employe_id);
    if (!e) continue;
    const extra = /extra/i.test(String(c.type ?? ""));
    const heures = Number(c.heures_semaine ?? 0);
    equipe.push({ id: String(c.employe_id), nom: `${e.prenom ?? ""} ${cap(String(e.nom ?? ""))}`.trim(), poste: String(c.emploi ?? "").trim() || (extra ? "Extra" : "à préciser"), contrat: extra ? `extra ${heures} h` : `${c.type ?? "CDI"} ${heures} h`, heures, brut: Number(c.remuneration ?? 0), actif: true, ajout: false, extra });
  }
  return equipe.sort((a, b) => b.brut - a.brut);
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null) as { etablissement_id?: string; reglages?: Partial<Reglages> } | null;
  const etabId = body?.etablissement_id;
  if (!etabId || !body?.reglages) return NextResponse.json({ error: "etablissement_id et reglages requis" }, { status: 400 });
  const denied = await etabAccessDenied(req, etabId, ["group_admin", "manager"]);
  if (denied) return denied;
  const profil = await callerProfile(req);
  const reglages = fusionnerReglages(body.reglages);
  const { error } = await supabaseAdmin.from("etablissement_params").upsert(
    { etablissement_id: etabId, cle: CLE, valeur: reglages, updated_at: new Date().toISOString(), updated_by: profil?.userId ?? null },
    { onConflict: "etablissement_id,cle" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // La page Marge lit ses objectifs dans la table objectifs : on les garde alignés
  for (const [cle, valeur] of [["ratio_matiere", reglages.objectifs.achats_matieres], ["ratio_masse_sal", reglages.objectifs.masse_salariale]] as const) {
    const { data: existant } = await supabaseAdmin.from("objectifs").select("id").eq("etablissement_id", etabId).eq("cle", cle).maybeSingle();
    if (existant) await supabaseAdmin.from("objectifs").update({ valeur, updated_at: new Date().toISOString() }).eq("id", existant.id);
    else await supabaseAdmin.from("objectifs").insert({ etablissement_id: etabId, cle, valeur, unite: "%" });
  }
  return NextResponse.json({ reglages });
}
