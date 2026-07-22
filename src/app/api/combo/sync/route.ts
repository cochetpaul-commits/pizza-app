import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getContracts, getLocations, COMBO_LOCATIONS, type ComboContract } from "@/lib/combo/api";

/**
 * POST /api/combo/sync — Synchronise les employes depuis Combo
 *
 * Pour chaque location Combo:
 * - Charge les contrats actifs
 * - Match par combo_id, puis par email, puis par nom
 * - Met a jour ou cree les employes
 */
export async function POST() {
  try {
    const locations = await getLocations();
    const results: { location: string; created: number; updated: number; total: number }[] = [];

    // Map Combo location IDs to our etablissement IDs
    const { data: etabs } = await supabaseAdmin.from("etablissements").select("id, slug");
    const etabMap: Record<string, string> = {};
    for (const e of etabs ?? []) {
      const slug = e.slug as string;
      if (slug.includes("piccola")) etabMap[COMBO_LOCATIONS.piccola] = e.id;
      else etabMap[COMBO_LOCATIONS.bello_mio] = e.id;
    }

    for (const loc of locations) {
      const etabId = etabMap[loc.id];
      if (!etabId) continue;

      const contracts = await getContracts(loc.id);
      let created = 0;
      let updated = 0;

      // Load existing employees for this establishment
      const { data: existing } = await supabaseAdmin
        .from("employes")
        .select("id, prenom, nom, email, combo_id, matricule")
        .eq("etablissement_id", etabId);
      const existingList = (existing ?? []) as { id: string; prenom: string; nom: string; email: string | null; combo_id: string | null; matricule: string | null }[];

      for (const contract of contracts) {
        // Skip ended contracts
        if (contract.end_date && new Date(contract.end_date) < new Date()) continue;

        const match = findMatch(existingList, contract);
        const team = loc.teams.find(t => contract.function?.toLowerCase().includes(t.name.toLowerCase()));

        const employeData = {
          prenom: capitalize(contract.firstname),
          nom: contract.lastname.toUpperCase(),
          email: contract.email || null,
          tel_mobile: contract.mobile_phone || null,
          matricule: contract.employee_number || null,
          combo_id: contract.id,
          combo_contract_id: contract.original_contract_id,
          etablissement_id: etabId,
          equipes_access: team ? [team.name] : [],
          actif: true,
        };

        if (match) {
          // Update existing employee
          await supabaseAdmin.from("employes").update(employeData).eq("id", match.id);
          updated++;
        } else {
          // Create new employee
          await supabaseAdmin.from("employes").insert({
            ...employeData,
            role: contract.role === "main_owner" || contract.role === "owner" ? "group_admin" : "equipier",
          });
          created++;
        }
      }

      results.push({ location: loc.name, created, updated, total: contracts.length });
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function findMatch(
  existing: { id: string; prenom: string; nom: string; email: string | null; combo_id: string | null; matricule: string | null }[],
  contract: ComboContract,
): { id: string } | null {
  // 1. Match by combo_id
  const byCombo = existing.find(e => e.combo_id === contract.id);
  if (byCombo) return byCombo;

  // 2. Match by email
  if (contract.email) {
    const byEmail = existing.find(e => e.email?.toLowerCase() === contract.email?.toLowerCase());
    if (byEmail) return byEmail;
  }

  // 3. Match by matricule / employee_number
  if (contract.employee_number) {
    const byMatricule = existing.find(e => e.matricule === contract.employee_number);
    if (byMatricule) return byMatricule;
  }

  // 4. Match by name (fuzzy)
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const byName = existing.find(e =>
    norm(e.nom) === norm(contract.lastname) && norm(e.prenom) === norm(contract.firstname)
  );
  if (byName) return byName;

  return null;
}
