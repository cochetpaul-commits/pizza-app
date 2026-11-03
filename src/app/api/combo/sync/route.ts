import { NextRequest, NextResponse } from "next/server";
import { roleDenied } from "@/lib/getEtablissement";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getContracts, getLocations, COMBO_LOCATIONS } from "@/lib/combo/api";
import { champsContrat, champsFiche, departs, trouverEmploye, type ContratCombo, type EmployeApp } from "@/lib/combo/syncEquipe";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/combo/sync : synchronise l'équipe depuis Combo (réécrite le 03/11/2026, voir src/lib/combo/syncEquipe.ts).
 * Pour chaque établissement : les contrats actifs du jour créent ou mettent à jour les fiches et leur contrat ;
 * les fiches reliées à Combo sans contrat aujourd'hui sont des départs, enregistrés quand le dernier contrat
 * a une date de fin passée, signalés sinon. Chaque erreur d'écriture est remontée, plus rien n'échoue en silence.
 */
const jourParis = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(d);

export async function POST(req: NextRequest) {
  const refus = await roleDenied(req, ["group_admin"]);
  if (refus) return refus;
  try {
    const aujourdhui = jourParis(new Date());
    const ilYa45j = jourParis(new Date(Date.now() - 45 * 86400000));
    const locations = await getLocations();
    const { data: etabs } = await supabaseAdmin.from("etablissements").select("id, slug");
    const etabMap: Record<string, string> = {};
    for (const e of etabs ?? []) etabMap[String(e.slug).includes("piccola") ? COMBO_LOCATIONS.piccola : COMBO_LOCATIONS.bello_mio] = e.id as string;

    const results: { location: string; created: number; updated: number; total: number; departs: string[]; a_verifier: string[]; erreurs: string[]; crees: string[] }[] = [];
    for (const loc of locations) {
      const etabId = etabMap[loc.id];
      if (!etabId) continue;
      const [actuels, anciensBruts] = await Promise.all([
        getContracts(loc.id, aujourdhui) as unknown as Promise<ContratCombo[]>,
        // Il y a 45 jours, puis il y a 15 jours : le dernier contrat connu des personnes parties depuis
        Promise.all([getContracts(loc.id, ilYa45j), getContracts(loc.id, jourParis(new Date(Date.now() - 15 * 86400000)))]).then((l) => l.flat() as unknown as ContratCombo[]),
      ]);
      // Le plus récent d'abord : la fin du dernier contrat fait foi
      const anciens = [...anciensBruts].sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));

      const { data: existants, error: errLecture } = await supabaseAdmin
        .from("employes")
        .select("id, prenom, nom, email, combo_id, matricule, actif, equipes_access, etablissements_ids, date_sortie")
        .eq("etablissement_id", etabId);
      if (errLecture) throw new Error(`Lecture des fiches : ${errLecture.message}`);
      const liste = (existants ?? []) as EmployeApp[];

      let created = 0, updated = 0;
      const erreurs: string[] = [], crees: string[] = [];
      for (const c of actuels) {
        if (c.end_date && c.end_date < aujourdhui) continue;
        const nom = `${c.firstname} ${c.lastname}`.trim();
        const fiche = trouverEmploye(liste, c);
        const champs = champsFiche(c, fiche, etabId);
        let employeId: string | null = null;
        if (fiche) {
          const { error } = await supabaseAdmin.from("employes").update(champs).eq("id", fiche.id);
          if (error) { erreurs.push(`${nom} : ${error.message}`); continue; }
          employeId = fiche.id; updated++;
        } else {
          const role = c.role === "main_owner" || c.role === "owner" ? "group_admin" : c.role === "manager" ? "manager" : "equipier";
          const { data, error } = await supabaseAdmin.from("employes").insert({ ...champs, etablissement_id: etabId, role }).select("id").single();
          if (error || !data) { erreurs.push(`${nom} : ${error?.message ?? "création impossible"}`); continue; }
          employeId = data.id as string; created++; crees.push(nom);
          liste.push({ id: employeId, prenom: String(champs.prenom), nom: String(champs.nom), email: c.email, combo_id: c.id, matricule: c.employee_number, actif: true, equipes_access: (champs.equipes_access as string[]) ?? [], etablissements_ids: [etabId], date_sortie: null });
        }
        // Contrat en cours : celui de Combo remplace le contrat actif de la fiche
        const contrat = champsContrat(c, employeId, aujourdhui);
        const { data: actif } = await supabaseAdmin.from("contrats").select("id").eq("employe_id", employeId).eq("actif", true).order("date_debut", { ascending: false }).limit(1);
        const { error: errC } = actif && actif.length
          ? await supabaseAdmin.from("contrats").update(contrat).eq("id", actif[0].id)
          : await supabaseAdmin.from("contrats").insert(contrat);
        if (errC) erreurs.push(`${nom}, contrat : ${errC.message}`);
      }

      // Départs
      const partis: string[] = [], aVerifier: string[] = [];
      for (const d of departs(liste, actuels, anciens, aujourdhui)) {
        const nom = `${d.employe.prenom} ${d.employe.nom}`;
        if (!d.date) { aVerifier.push(nom); continue; }
        const { error } = await supabaseAdmin.from("employes").update({ actif: false, date_sortie: d.date, motif_sortie: d.motif }).eq("id", d.employe.id);
        if (error) { erreurs.push(`${nom}, départ : ${error.message}`); continue; }
        await supabaseAdmin.from("contrats").update({ actif: false, date_fin: d.date }).eq("employe_id", d.employe.id).eq("actif", true);
        partis.push(`${nom} (${d.motif?.toLowerCase() ?? "départ"} le ${new Date(`${d.date}T12:00:00`).toLocaleDateString("fr-FR")})`);
      }
      results.push({ location: loc.name, created, updated, total: actuels.length, departs: partis, a_verifier: aVerifier, erreurs, crees });
    }
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
