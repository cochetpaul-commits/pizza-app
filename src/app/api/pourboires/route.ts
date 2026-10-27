import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";
import { hasPermission } from "@/lib/permissions";
import { permissionsEmploye } from "@/lib/commandeEnvoi";
import { COMBO_LOCATIONS, getPlannings } from "@/lib/combo/api";
import { compterPresences, repartir, type Absence, type Ajustement, type Service } from "@/lib/pourboires";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pourboires de l'équipe (26/10/2026).
 * GET ?mois=AAAA-MM : le pot du mois (carte + espèces, clôtures jusqu'à J-1), les jours comptés par personne
 *     d'après le planning Combo, la part de chacun et les ajustements. Un équipier ne voit que sa ligne ;
 *     la direction (« Émargement de l'équipe ») voit tout le monde.
 * POST { employe_id, mois, montant, motif } : ajustement (acompte, report, « ne pas compter ») — direction.
 * DELETE ?id= : retire un ajustement — direction.
 */
const MOIS = /^\d{4}-\d{2}$/;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-']/g, " ").replace(/\s+/g, " ").trim();
const jourParis = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(d);

async function acces(req: NextRequest) {
  let a: { etabId: string; userId: string };
  try { a = await getEtablissement(req); } catch (e) {
    if (e instanceof EtabError) return { erreur: NextResponse.json({ error: e.message }, { status: e.status }) };
    throw e;
  }
  const [{ data: profil }, perms, { data: user }] = await Promise.all([
    supabaseAdmin.from("profiles").select("role").eq("id", a.userId).maybeSingle(),
    permissionsEmploye(a.userId),
    supabaseAdmin.auth.admin.getUserById(a.userId),
  ]);
  const direction = hasPermission(String(profil?.role ?? ""), "heures.edit_team", perms);
  // Fiches employé de l'appelant (compte relié, sinon même adresse mail)
  let { data: miens } = await supabaseAdmin.from("employes").select("id").eq("auth_user_id", a.userId).eq("actif", true);
  if (!miens?.length && user?.user?.email) ({ data: miens } = await supabaseAdmin.from("employes").select("id").ilike("email", user.user.email).eq("actif", true));
  return { ...a, direction, mesIds: new Set((miens ?? []).map((e) => e.id as string)) };
}

export async function GET(req: NextRequest) {
  const a = await acces(req);
  if ("erreur" in a) return a.erreur;
  const aujourdhui = jourParis(new Date());
  const mois = req.nextUrl.searchParams.get("mois") ?? aujourdhui.slice(0, 7);
  if (!MOIS.test(mois)) return NextResponse.json({ error: "mois requis (AAAA-MM)" }, { status: 400 });
  const debut = `${mois}-01`;
  const finMois = new Date(Date.UTC(Number(mois.slice(0, 4)), Number(mois.slice(5, 7)), 0)).toISOString().slice(0, 10);
  // Jusqu'à hier : le planning du jour n'est pas encore une présence
  const hier = new Date(Date.now() - 24 * 3600e3);
  const aJour = finMois < jourParis(hier) ? finMois : jourParis(hier);

  const [{ data: etab }, { data: employes }, { data: clotures }, { data: absences }, { data: ajustements }] = await Promise.all([
    supabaseAdmin.from("etablissements").select("slug").eq("id", a.etabId).maybeSingle(),
    supabaseAdmin.from("employes").select("id, prenom, nom, matricule, poste_id, participe_pourboires, postes(nom, equipe), contrats(type, date_fin)")
      .or(`etablissement_id.eq.${a.etabId},etablissements_ids.cs.{${a.etabId}}`).eq("actif", true),
    supabaseAdmin.from("clotures").select("jour, statut, pourboires_paie, pourboires_especes").eq("etablissement_id", a.etabId).gte("jour", debut).lte("jour", finMois),
    supabaseAdmin.from("absences").select("employe_id, date_debut, date_fin, type").eq("statut", "valide").lte("date_debut", finMois).gte("date_fin", debut),
    supabaseAdmin.from("pourboires_ajustements").select("id, employe_id, montant, motif, type, created_at").eq("etablissement_id", a.etabId).eq("mois", debut).order("created_at"),
  ]);

  // Présences : le planning Combo, service par service
  const location = String(etab?.slug ?? "").includes("piccola") ? COMBO_LOCATIONS.piccola : COMBO_LOCATIONS.bello_mio;
  // La direction (participe_pourboires = faux) n'entre ni dans les jours ni dans la répartition
  const tous = (employes ?? []) as unknown as { id: string; prenom: string; nom: string; matricule: string | null; participe_pourboires: boolean | null; postes: { nom: string; equipe: string | null } | null; contrats: { type: string | null; date_fin: string | null }[] | null }[];
  const emps = tous.filter((e) => e.participe_pourboires !== false);
  const horsPot = new Set(tous.filter((e) => e.participe_pourboires === false).map((e) => e.id));
  const parMatricule = new Map(tous.filter((e) => e.matricule).map((e) => [String(e.matricule), e.id]));
  const parNom = new Map(tous.map((e) => [`${norm(e.prenom)} ${norm(e.nom)}`, e.id]));
  const services: Service[] = [];
  const inconnus = new Set<string>();
  let avertissement: string | null = null;
  if (aJour >= debut) {
    try {
      for (const p of await getPlannings(location, debut, aJour)) {
        const date = jourParis(new Date(p.starts_at));
        if (date < debut || date > aJour) continue;
        const employeId = (p.employee_number && parMatricule.get(p.employee_number)) || parNom.get(`${norm(p.firstname)} ${norm(p.lastname)}`) || parNom.get(`${norm(p.lastname)} ${norm(p.firstname)}`);
        if (!employeId) { inconnus.add(`${p.firstname} ${p.lastname}`.trim()); continue; }
        if (horsPot.has(employeId)) continue;
        const minutes = Math.max(0, (new Date(p.ends_at).getTime() - new Date(p.starts_at).getTime()) / 60000 - (p.break_duration || 0));
        services.push({ employeId, date, minutes });
      }
    } catch (e) {
      avertissement = `Planning Combo indisponible : ${e instanceof Error ? e.message : "erreur"}. Les jours de présence ne sont pas calculés.`;
    }
  }
  const abs: Absence[] = (absences ?? []).map((x) => ({ employeId: x.employe_id as string, debut: x.date_debut as string, fin: x.date_fin as string, type: String(x.type ?? "") }));
  // « Ne pas compter » : la personne sort du mois (ni jours au dénominateur, ni part), comme Teddy en août dans le fichier de Paul
  const exclus = new Set((ajustements ?? []).filter((x) => x.type === "exclu").map((x) => x.employe_id as string));
  const presences = compterPresences(services.filter((x) => !exclus.has(x.employeId)), abs);
  const ajs: Ajustement[] = (ajustements ?? []).filter((x) => x.type === "montant").map((x) => ({ employeId: x.employe_id as string, montant: Number(x.montant) || 0, motif: String(x.motif ?? "") }));

  const r2 = (n: number) => Math.round(n * 100) / 100;
  // Complément du pot : pourboires carte des jours sans clôture dans l'app (relevés sur le rapport du TPE)
  const complements = (ajustements ?? []).filter((x) => x.type === "pot").map((x) => ({ id: x.id as string, montant: Number(x.montant) || 0, motif: String(x.motif ?? "") }));
  const carte = r2((clotures ?? []).reduce((t, c) => t + (Number(c.pourboires_paie) || 0), 0) + complements.reduce((t, c) => t + c.montant, 0));
  const especes = r2((clotures ?? []).reduce((t, c) => t + (Number(c.pourboires_especes) || 0), 0));
  const rep = repartir(carte + especes, presences, ajs);
  const joursOuverture = new Set(services.map((s) => s.date)).size;

  const parId = new Map(emps.map((e) => [e.id, e]));
  // Les exclus restent visibles, à 0, avec leurs jours au planning pour mémoire
  const presencesBrutes = compterPresences(services, abs);
  const parts = [...rep.parts, ...[...exclus].filter((id) => parId.has(id)).map((id) => ({ employeId: id, jours: 0, part: 0, ajustements: [], net: 0 }))];
  const lignes = parts.map((p) => {
    const e = parId.get(p.employeId);
    const contrat = (e?.contrats ?? []).filter((c) => !c.date_fin || c.date_fin >= debut).sort((x, y) => String(y.date_fin ?? "9999").localeCompare(String(x.date_fin ?? "9999")))[0]?.type ?? null;
    return {
      employe_id: p.employeId, prenom: e?.prenom ?? "?", nom: e?.nom ?? "", poste: e?.postes?.nom ?? null, equipe: e?.postes?.equipe ?? null, contrat,
      jours: p.jours, jours_absents: r2(Math.max(0, joursOuverture - p.jours)), detail: presences.get(p.employeId)?.detail ?? {},
      part: p.part, net: p.net, moi: a.mesIds.has(p.employeId),
      exclu: exclus.has(p.employeId) ? { id: (ajustements ?? []).find((x) => x.type === "exclu" && x.employe_id === p.employeId)?.id ?? null, jours_planning: presencesBrutes.get(p.employeId)?.jours ?? 0 } : null,
      ajustements: (ajustements ?? []).filter((x) => x.employe_id === p.employeId && x.type !== "exclu").map((x) => ({ id: x.id, montant: Number(x.montant), motif: x.motif })),
    };
  });
  // Un équipier ne voit que sa ligne (et le pot) ; ses collègues restent anonymes
  const visibles = a.direction ? lignes : lignes.filter((l) => l.moi);
  return NextResponse.json({
    mois, a_jour: aJour, direction: a.direction,
    pot: { carte, especes, total: rep.pot, complements }, jours_ouverture: joursOuverture,
    jours_sans_cloture: [...new Set(services.map((s) => s.date))].filter((d) => !(clotures ?? []).some((c) => c.jour === d)).sort(), total_jours: rep.totalJours, valeur_jour: rep.valeurJour,
    nb_clotures: (clotures ?? []).length, soirs_cagnotte: (clotures ?? []).filter((c) => c.pourboires_especes != null).map((c) => c.jour).sort(),
    lignes: visibles, nb_personnes: lignes.length,
    inconnus: a.direction ? [...inconnus] : [], avertissement,
  });
}

export async function POST(req: NextRequest) {
  const a = await acces(req);
  if ("erreur" in a) return a.erreur;
  if (!a.direction) return NextResponse.json({ error: "Réservé à la direction." }, { status: 403 });
  const body = await req.json().catch(() => null) as { employe_id?: string; mois?: string; montant?: number; motif?: string; exclu?: boolean; pot?: boolean } | null;
  if (!body?.mois || !MOIS.test(body.mois)) return NextResponse.json({ error: "mois requis" }, { status: 400 });
  if (body.pot) {
    if (typeof body.montant !== "number" || !Number.isFinite(body.montant) || !body.motif?.trim()) return NextResponse.json({ error: "montant et motif requis" }, { status: 400 });
    const { data, error } = await supabaseAdmin.from("pourboires_ajustements")
      .insert({ etablissement_id: a.etabId, employe_id: null, mois: `${body.mois}-01`, montant: Math.round(body.montant * 100) / 100, motif: body.motif.trim().slice(0, 200), type: "pot", created_by: a.userId }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id });
  }
  if (!body.employe_id) return NextResponse.json({ error: "employe_id requis" }, { status: 400 });
  if (!body.exclu && (typeof body.montant !== "number" || !Number.isFinite(body.montant) || !body.motif?.trim())) {
    return NextResponse.json({ error: "montant et motif requis" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin.from("pourboires_ajustements")
    .insert(body.exclu
      ? { etablissement_id: a.etabId, employe_id: body.employe_id, mois: `${body.mois}-01`, montant: 0, motif: body.motif?.trim().slice(0, 200) || "Ne pas compter ce mois", type: "exclu", created_by: a.userId }
      : { etablissement_id: a.etabId, employe_id: body.employe_id, mois: `${body.mois}-01`, montant: Math.round((body.montant as number) * 100) / 100, motif: (body.motif as string).trim().slice(0, 200), created_by: a.userId })
    .select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

export async function DELETE(req: NextRequest) {
  const a = await acces(req);
  if ("erreur" in a) return a.erreur;
  if (!a.direction) return NextResponse.json({ error: "Réservé à la direction." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  const { error } = await supabaseAdmin.from("pourboires_ajustements").delete().eq("id", id).eq("etablissement_id", a.etabId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
