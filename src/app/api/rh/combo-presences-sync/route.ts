import { NextRequest, NextResponse } from "next/server";
import { roleDenied } from "@/lib/getEtablissement";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getContracts, getPlannings, getLocations, COMBO_LOCATIONS } from "@/lib/combo/api";

/**
 * POST /api/rh/combo-presences-sync
 * Body: { from: string, to: string }
 *
 * Fetches plannings from Combo API for all locations, aggregates by employee,
 * and upserts into combo_presences.
 */
/** Semaines lundi → dimanche couvrant la période (vécu 27/10 : une ligne « mois entier » se cumulait avec les semaines) */
function semaines(from: string, to: string): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  const d = new Date(`${from}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  while (d.toISOString().slice(0, 10) <= to) {
    const f = d.toISOString().slice(0, 10); d.setUTCDate(d.getUTCDate() + 6); out.push({ from: f, to: d.toISOString().slice(0, 10) }); d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function POST(req: NextRequest) {
  const refus = await roleDenied(req, ["group_admin"]);
  if (refus) return refus;
  try {
    const body = await req.json();
    if (!body?.from || !body?.to) return NextResponse.json({ error: "from et to requis" }, { status: 400 });
    let totalInserted = 0;
    for (const s of semaines(String(body.from), String(body.to))) {
      const r = await syncSemaine(s.from, s.to);
      if (r instanceof NextResponse) return r;
      totalInserted += r;
    }
    return NextResponse.json({ ok: true, inserted: totalInserted, period: { from: body.from, to: body.to } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Une semaine : le planning Combo remplace les lignes existantes, sauf si la semaine a été importée depuis le rapport des émargements */
async function syncSemaine(from: string, to: string): Promise<number | NextResponse> {
  {
    const locations = await getLocations();

    // Map Combo location IDs to our etablissement IDs
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
      const { data: importee } = await supabaseAdmin.from("combo_imports").select("id").eq("etablissement_id", etabId).eq("periode_debut", from).eq("periode_fin", to).ilike("source_file_name", "%.xls%").limit(1);
      if (importee?.length) continue;

      // Load contracts (for contract_time) and plannings
      const [contracts, plannings] = await Promise.all([
        getContracts(loc.id, from),
        getPlannings(loc.id, from, to),
      ]);

      // Map employee_number → contract for contract_time
      const contractByEmpNum = new Map<string, number>();
      for (const c of contracts) {
        if (c.employee_number) contractByEmpNum.set(c.employee_number, c.contract_time);
      }

      // Aggregate plannings by employee name
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
        // Count meals: shift net > 5h = 1 meal
        if ((shiftMin - p.break_duration) >= 300) entry.repas++;

        empMap.set(key, entry);
      }

      // Build presence rows
      const rows: Record<string, unknown>[] = [];

      for (const [comboNom, emp] of empMap) {
        const workMinutes = emp.totalMinutes - emp.totalBreak;
        const heuresTravaillees = Math.round(workMinutes / 60 * 100) / 100;
        const heuresContrat = emp.employee_number ? (contractByEmpNum.get(emp.employee_number) ?? 0) : 0;

        // Match to employee in DB
        const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        // Try match by employee_number or name
        let employeId: string | null = null;
        if (emp.employee_number) {
          const { data: byMatricule } = await supabaseAdmin
            .from("employes")
            .select("id")
            .eq("matricule", emp.employee_number)
            .eq("etablissement_id", etabId)
            .limit(1);
          if (byMatricule?.[0]) employeId = byMatricule[0].id;
        }
        if (!employeId) {
          const { data: byName } = await supabaseAdmin
            .from("employes")
            .select("id, prenom, nom")
            .eq("etablissement_id", etabId)
            .eq("actif", true);
          const found = (byName ?? []).find(e =>
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
          ecart_total: 0,
          periode_debut: from,
          periode_fin: to,
        });
      }

      if (rows.length > 0) {
        // Delete existing for this period + etab
        await supabaseAdmin
          .from("combo_presences")
          .delete()
          .eq("etablissement_id", etabId)
          .eq("periode_debut", from)
          .eq("periode_fin", to);

        const { error } = await supabaseAdmin.from("combo_presences").insert(rows);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        totalInserted += rows.length;
      }
    }

    return totalInserted;
  }
}
