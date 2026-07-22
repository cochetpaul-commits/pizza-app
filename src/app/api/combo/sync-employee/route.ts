import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getContracts, getLocations, COMBO_LOCATIONS, type ComboContract } from "@/lib/combo/api";

/**
 * POST /api/combo/sync-employee
 * Body: { employe_id: string }
 *
 * Syncs a single employee from Combo by their combo_id.
 * Updates employe fields + upserts active contrat.
 */
export async function POST(req: NextRequest) {
  try {
    const { employe_id } = await req.json();
    if (!employe_id) return NextResponse.json({ ok: false, error: "employe_id required" }, { status: 400 });

    // Load employee
    const { data: emp } = await supabaseAdmin
      .from("employes")
      .select("id, combo_id, combo_contract_id, prenom, nom, email, etablissement_id, matricule")
      .eq("id", employe_id)
      .single();

    if (!emp) return NextResponse.json({ ok: false, error: "Employe introuvable" }, { status: 404 });

    // Map etablissement to Combo location
    const { data: etabs } = await supabaseAdmin.from("etablissements").select("id, slug");
    const etabSlugMap: Record<string, string> = {};
    for (const e of etabs ?? []) {
      const slug = e.slug as string;
      if (slug.includes("piccola")) etabSlugMap[e.id] = COMBO_LOCATIONS.piccola;
      else etabSlugMap[e.id] = COMBO_LOCATIONS.bello_mio;
    }

    const comboLocationId = etabSlugMap[emp.etablissement_id];
    if (!comboLocationId) return NextResponse.json({ ok: false, error: "Etablissement non lie a Combo" }, { status: 400 });

    // Load all contracts from Combo for this location
    const contracts = await getContracts(comboLocationId);
    const locations = await getLocations();
    const loc = locations.find(l => l.id === comboLocationId);

    // Find matching contract
    let contract: ComboContract | undefined;

    // 1. Match by combo_id
    if (emp.combo_id) {
      contract = contracts.find(c => c.id === emp.combo_id);
    }
    // 2. Match by original_contract_id
    if (!contract && emp.combo_contract_id) {
      contract = contracts.find(c => c.original_contract_id === emp.combo_contract_id);
    }
    // 3. Match by email
    if (!contract && emp.email) {
      contract = contracts.find(c => c.email?.toLowerCase() === emp.email?.toLowerCase());
    }
    // 4. Match by matricule
    if (!contract && emp.matricule) {
      contract = contracts.find(c => c.employee_number === emp.matricule);
    }
    // 5. Match by name
    if (!contract) {
      const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      contract = contracts.find(c =>
        norm(c.lastname) === norm(emp.nom) && norm(c.firstname) === norm(emp.prenom)
      );
    }

    if (!contract) {
      return NextResponse.json({ ok: false, error: "Aucun contrat Combo correspondant" }, { status: 404 });
    }

    // Resolve team name
    const teamName = loc?.teams.find(t => contract!.function?.toLowerCase().includes(t.name.toLowerCase()))?.name
      ?? (contract.function?.toLowerCase().match(/salle|rang|barman/) ? "Salle" : null)
      ?? (contract.function?.toLowerCase().match(/cuisi|pizza|plong/) ? "Cuisine" : null);

    // Map Combo contract_type to our types
    const typeMap: Record<string, string> = {
      CDI: "CDI", CDD: "CDD", seasonal: "extra", apprenticeship: "apprenti", internship: "stagiaire",
    };

    // Update employee
    const empUpdate: Record<string, unknown> = {
      prenom: capitalize(contract.firstname),
      nom: contract.lastname.toUpperCase(),
      email: contract.email || emp.email || null,
      tel_mobile: contract.mobile_phone || null,
      matricule: contract.employee_number || null,
      combo_id: contract.id,
      combo_contract_id: contract.original_contract_id,
      adresse: contract.street_address || null,
      code_postal: contract.zip || null,
      ville: contract.city || null,
      numero_secu: contract.social_security_number || null,
      actif: true,
      // RUP fields
      date_entree: contract.start_date || null,
      date_sortie: contract.end_date || null,
    };

    if (teamName) {
      const currentAccess = (emp as Record<string, unknown>).equipes_access as string[] ?? [];
      if (!currentAccess.includes(teamName)) {
        empUpdate.equipes_access = [teamName, ...currentAccess];
      }
    }

    await supabaseAdmin.from("employes").update(empUpdate).eq("id", emp.id);

    // Upsert contrat
    const contratType = typeMap[contract.contract_type] ?? contract.contract_type ?? "CDI";
    const contratPayload = {
      employe_id: emp.id,
      type: contratType,
      date_debut: contract.start_date,
      date_fin: contract.end_date || null,
      remuneration: contract.monthly_gross_salary,
      emploi: contract.function || null,
      heures_semaine: contract.contract_time,
      jours_semaine: 5,
      actif: !contract.end_date || new Date(contract.end_date) >= new Date(),
    };

    // Check existing active contrat
    const { data: existingContrats } = await supabaseAdmin
      .from("contrats")
      .select("id")
      .eq("employe_id", emp.id)
      .eq("actif", true)
      .limit(1);

    if (existingContrats && existingContrats.length > 0) {
      await supabaseAdmin.from("contrats").update(contratPayload).eq("id", existingContrats[0].id);
    } else {
      await supabaseAdmin.from("contrats").insert(contratPayload);
    }

    // Return the synced data for frontend state update
    const { data: updatedEmp } = await supabaseAdmin.from("employes").select("*").eq("id", emp.id).single();
    const { data: updatedContrats } = await supabaseAdmin.from("contrats").select("*").eq("employe_id", emp.id).order("date_debut", { ascending: false });

    return NextResponse.json({
      ok: true,
      employee: updatedEmp,
      contrats: updatedContrats ?? [],
      combo_function: contract.function,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
