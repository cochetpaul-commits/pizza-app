import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getContracts, getPlannings, getLocations, COMBO_LOCATIONS } from "@/lib/combo/api";
import { syncRestsFromCombo } from "@/lib/combo/syncRests";

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

async function syncPeriod(from: string, to: string) {
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

    const [contracts, plannings] = await Promise.all([
      getContracts(loc.id, from),
      getPlannings(loc.id, from, to),
    ]);

    const contractByEmpNum = new Map<string, number>();
    for (const c of contracts) {
      if (c.employee_number) contractByEmpNum.set(c.employee_number, c.contract_time);
    }

    const empMap = new Map<string, {
      firstname: string; lastname: string; employee_number: string | null;
      team: string | null; totalMinutes: number; totalBreak: number;
      daysWorked: Set<string>; repas: number;
    }>();

    for (const p of plannings) {
      const key = `${p.firstname} ${p.lastname}`.trim();
      const entry = empMap.get(key) ?? {
        firstname: p.firstname, lastname: p.lastname,
        employee_number: p.employee_number,
        team: p.team_name, totalMinutes: 0, totalBreak: 0,
        daysWorked: new Set<string>(), repas: 0,
      };

      const start = new Date(p.starts_at);
      const end = new Date(p.ends_at);
      const shiftMin = (end.getTime() - start.getTime()) / 60000;
      entry.totalMinutes += shiftMin;
      entry.totalBreak += p.break_duration;
      entry.daysWorked.add(start.toISOString().slice(0, 10));
      if ((shiftMin - p.break_duration) >= 300) entry.repas++;

      empMap.set(key, entry);
    }

    // Pre-load employees for matching
    const { data: allEmps } = await supabaseAdmin
      .from("employes")
      .select("id, prenom, nom, matricule")
      .eq("etablissement_id", etabId)
      .eq("actif", true);

    const rows: Record<string, unknown>[] = [];

    for (const [comboNom, emp] of empMap) {
      const workMinutes = emp.totalMinutes - emp.totalBreak;
      const heuresTravaillees = Math.round(workMinutes / 60 * 100) / 100;
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
        heures_planifiees: heuresTravaillees,
        heures_travaillees: heuresTravaillees,
        heures_contrat: heuresContrat,
        nb_repas: emp.repas,
        nb_jours_travailles: emp.daysWorked.size,
        ecart_total: heuresTravaillees - heuresContrat,
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
  // Verify cron secret (Vercel sends this header)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !req.headers.get("x-vercel-cron")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const currentWeek = getWeekBounds(now);
    const prevWeekDate = new Date(now);
    prevWeekDate.setDate(now.getDate() - 7);
    const prevWeek = getWeekBounds(prevWeekDate);

    const [currentCount, prevCount] = await Promise.all([
      syncPeriod(currentWeek.from, currentWeek.to),
      syncPeriod(prevWeek.from, prevWeek.to),
    ]);

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
      synced_at: now.toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/combo-sync]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
