import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized } from "@/lib/cronAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getContracts, getPlannings, getLocations, COMBO_LOCATIONS } from "@/lib/combo/api";
import { agregerPlannings, heures, jourParis } from "@/lib/combo/presences";
import { syncRestsFromCombo } from "@/lib/combo/syncRests";
import { creerFichesManquantes } from "@/lib/combo/creerFiches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekBounds(d: Date): { from: string; to: string } {
  const dow = d.getDay() || 7;
  const mon = new Date(d); mon.setDate(d.getDate() - dow + 1); mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { from: toISO(mon), to: toISO(sun) };
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

async function syncPeriod(from: string, to: string, fichesCreees: string[] = []) {
  const locations = await getLocations();

  const { data: etabs } = await supabaseAdmin.from("etablissements").select("id, slug");
  const etabMap: Record<string, string> = {};
  for (const e of etabs ?? []) {
    const slug = e.slug as string;
    if (slug.includes("piccola")) etabMap[COMBO_LOCATIONS.piccola] = e.id;
    else etabMap[COMBO_LOCATIONS.bello_mio] = e.id;
  }

  let totalInserted = 0;

  for (const loc of locations) {
    const etabId = etabMap[loc.id];
    if (!etabId) continue;
    // Semaine importée depuis le rapport des émargements (heures validées) : on ne la remplace pas par le planning
    const { data: importee } = await supabaseAdmin.from("combo_imports").select("id").eq("etablissement_id", etabId).eq("periode_debut", from).eq("periode_fin", to).ilike("source_file_name", "%.xls%").limit(1);
    if (importee?.length) continue;

    const [contracts, plannings] = await Promise.all([
      getContracts(loc.id, from),
      getPlannings(loc.id, from, to),
    ]);

    // Nouveau contrat dans Combo sans fiche ici : on crée la fiche (et son contrat) avant de rattacher les présences
    fichesCreees.push(...await creerFichesManquantes(etabId, contracts));

    const contractByEmpNum = new Map<string, number>();
    for (const c of contracts) {
      if (c.employee_number) contractByEmpNum.set(c.employee_number, c.contract_time);
    }

    // Heures : planning et réel validé, jusqu'à la veille (lib/combo/presences)
    const empMap = agregerPlannings(plannings, jourParis(new Date(Date.now() - 24 * 3600e3)));

    // Pre-load employees for matching
    const { data: allEmps } = await supabaseAdmin
      .from("employes")
      .select("id, prenom, nom, matricule")
      .eq("etablissement_id", etabId)
      .eq("actif", true);

    const rows: Record<string, unknown>[] = [];

    for (const [comboNom, emp] of empMap) {
      const heuresTravaillees = heures(emp.minutesTravaillees);
      const heuresPlanifiees = heures(emp.minutesPlanifiees);
      const heuresContrat = emp.employee_number ? (contractByEmpNum.get(emp.employee_number) ?? 0) : 0;

      let employeId: string | null = null;
      if (emp.employee_number) {
        const found = (allEmps ?? []).find(e => e.matricule === emp.employee_number);
        if (found) employeId = found.id;
      }
      if (!employeId) {
        const found = (allEmps ?? []).find(e =>
          norm(e.nom) === norm(emp.lastname) && norm(e.prenom) === norm(emp.firstname)
        );
        if (found) employeId = found.id;
      }

      rows.push({
        etablissement_id: etabId,
        combo_nom: comboNom,
        equipe: emp.team,
        employe_id: employeId,
        matched: !!employeId,
        heures_planifiees: heuresPlanifiees,
        heures_travaillees: heuresTravaillees,
        heures_contrat: heuresContrat,
        nb_repas: emp.repas,
        nb_jours_travailles: emp.joursTravailles.size,
        ecart_total: Math.round((heuresTravaillees - heuresPlanifiees) * 100) / 100,
        periode_debut: from,
        periode_fin: to,
      });
    }

    if (rows.length > 0) {
      await supabaseAdmin
        .from("combo_presences")
        .delete()
        .eq("etablissement_id", etabId)
        .eq("periode_debut", from)
        .eq("periode_fin", to);
      // Lignes « mois entier » (ancienne synchro sur le mois) qui recouvrent cette semaine : elles comptaient double (27/10/2026)
      await supabaseAdmin.from("combo_presences").delete().eq("etablissement_id", etabId).lte("periode_debut", from).gte("periode_fin", to).neq("periode_debut", from);

      await supabaseAdmin.from("combo_presences").insert(rows);
      totalInserted += rows.length;
    }
  }

  return totalInserted;
}

/**
 * GET /api/cron/combo-sync
 * Cron job: sync current week + previous week from Combo API
 */
export async function GET(req: NextRequest) {
  const denied = cronUnauthorized(req);
  if (denied) return denied;

  try {
    const now = new Date();
    const currentWeek = getWeekBounds(now);
    const prevWeekDate = new Date(now);
    prevWeekDate.setDate(now.getDate() - 7);
    const prevWeek = getWeekBounds(prevWeekDate);

    const fichesCreees: string[] = [];
    const currentCount = await syncPeriod(currentWeek.from, currentWeek.to, fichesCreees);
    const prevCount = await syncPeriod(prevWeek.from, prevWeek.to, fichesCreees);

    // Conges/absences depuis Combo (source de verite des conges valides)
    let rests: { synced: number; unmatched: number } | { error: string };
    try {
      rests = await syncRestsFromCombo();
    } catch (e) {
      rests = { error: e instanceof Error ? e.message : "erreur rests" };
    }

    return NextResponse.json({
      ok: true,
      current_week: { ...currentWeek, inserted: currentCount },
      prev_week: { ...prevWeek, inserted: prevCount },
      rests,
      fiches_creees: fichesCreees,
      synced_at: now.toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/combo-sync]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
