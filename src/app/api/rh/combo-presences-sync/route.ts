import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getContracts, getShifts, getLocations, COMBO_LOCATIONS, type ComboContract, type ComboShift } from "@/lib/combo/api";

/**
 * POST /api/rh/combo-presences-sync
 * Body: { from: string, to: string }
 *
 * Fetches shifts from Combo API for all locations, aggregates by employee,
 * and upserts into combo_presences.
 */
export async function POST(req: NextRequest) {
  try {
    const { from, to } = await req.json();
    if (!from || !to) return NextResponse.json({ error: "from et to requis" }, { status: 400 });

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

      // Load contracts and shifts
      const [contracts, shifts] = await Promise.all([
        getContracts(loc.id, from),
        getShifts(loc.id, from, to),
      ]);

      // Map contract_id → contract details
      const contractMap = new Map<string, ComboContract>();
      for (const c of contracts) contractMap.set(c.id, c);

      // Aggregate shifts by contract
      const shiftsByContract = new Map<string, ComboShift[]>();
      for (const s of shifts) {
        const arr = shiftsByContract.get(s.contract_id) ?? [];
        arr.push(s);
        shiftsByContract.set(s.contract_id, arr);
      }

      // Build presence rows
      const rows: Record<string, unknown>[] = [];

      for (const [contractId, contractShifts] of shiftsByContract) {
        const contract = contractMap.get(contractId);
        if (!contract) continue;

        const comboNom = `${contract.firstname} ${contract.lastname}`.trim();

        // Calculate hours
        let totalMinutes = 0;
        let totalBreak = 0;
        const daysWorked = new Set<string>();
        let repas = 0;

        for (const s of contractShifts) {
          const start = new Date(s.start_date);
          const end = new Date(s.end_date);
          const shiftMin = (end.getTime() - start.getTime()) / 60000;
          totalMinutes += shiftMin;
          totalBreak += s.break_duration;
          daysWorked.add(start.toISOString().slice(0, 10));
          // Count meals: shift > 5h = 1 meal
          if ((shiftMin - s.break_duration) >= 300) repas++;
        }

        const workMinutes = totalMinutes - totalBreak;
        const heuresTravaillees = Math.round(workMinutes / 60 * 100) / 100;
        const heuresPlanifiees = heuresTravaillees; // shifts are the plan
        const heuresContrat = contract.contract_time ?? 0;

        // Find team
        const teamId = contractShifts[0]?.team_id;
        const team = teamId ? loc.teams.find(t => t.id === teamId) : null;

        // Match to employee
        const { data: empMatch } = await supabaseAdmin
          .from("employes")
          .select("id")
          .or(`combo_id.eq.${contract.id},and(nom.ilike.${contract.lastname},prenom.ilike.${contract.firstname})`)
          .eq("etablissement_id", etabId)
          .limit(1);

        rows.push({
          etablissement_id: etabId,
          combo_nom: comboNom,
          equipe: team?.name ?? null,
          employe_id: empMatch?.[0]?.id ?? null,
          matched: !!empMatch?.[0],
          heures_planifiees: heuresPlanifiees,
          heures_travaillees: heuresTravaillees,
          heures_contrat: heuresContrat,
          nb_repas: repas,
          nb_jours_travailles: daysWorked.size,
          ecart_total: Math.round((heuresTravaillees - heuresPlanifiees) * 100) / 100,
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

    return NextResponse.json({ ok: true, inserted: totalInserted, period: { from, to } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
