import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRests, getContracts, COMBO_LOCATIONS, type ComboRest } from "@/lib/combo/api";

/**
 * Rapatrie les absences/congés depuis Combo (GET /rests, lecture seule).
 *
 * Combo reste la source de vérité des congés VALIDÉS : chaque rest est
 * upserté dans `absences` (source='combo', statut='valide') via son
 * combo_rest_id.
 *
 * Rapprochement anti-doublon : quand Paul saisit dans Combo un congé déjà
 * présent dans l'app (demande validée ou saisie manager), le rest est
 * POINTÉ sur cette ligne (combo_rest_id + dates Combo) au lieu de créer
 * une deuxième ligne — sinon le congé compterait deux fois dans les
 * compteurs CP. Les demandes encore en attente qui arrivent validées de
 * Combo sont validées au passage.
 *
 * Matching employé : rests.contract_id ↔ employes.combo_contract_id,
 * complété par l'email du contrat Combo si besoin.
 */

// Valeurs contraintes par absences_type_check
const REST_TYPE_MAP: Record<string, string> = {
  paid_leave: "CP",
  sick_leave: "maladie",
  unpaid_leave: "sans_solde",
  rtt: "RTT",
  public_holiday: "ferie",
  family_leave: "evenement_familial",
  work_accident: "accident_travail",
  maternity_leave: "maternite",
  paternity_leave: "maternite",
};

function toDate(iso: string): string {
  return iso.slice(0, 10);
}

export async function syncRestsFromCombo(): Promise<{ synced: number; unmatched: number; details: string[] }> {
  const today = new Date();
  const start = new Date(today); start.setDate(start.getDate() - 60);
  const end = new Date(today); end.setDate(end.getDate() + 240);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const { data: etabs } = await supabaseAdmin.from("etablissements").select("id, slug");
  const etabByLoc: Record<string, string> = {};
  for (const e of etabs ?? []) {
    if ((e.slug as string).includes("piccola")) etabByLoc[COMBO_LOCATIONS.piccola] = e.id;
    else etabByLoc[COMBO_LOCATIONS.bello_mio] = e.id;
  }

  const { data: emps } = await supabaseAdmin
    .from("employes")
    .select("id, email, etablissement_id, combo_contract_id")
    .eq("actif", true);

  let synced = 0;
  let unmatched = 0;
  const details: string[] = [];

  for (const locId of Object.values(COMBO_LOCATIONS)) {
    const etabId = etabByLoc[locId];
    if (!etabId) continue;

    let rests: ComboRest[] = [];
    try {
      rests = await getRests(locId, startStr, endStr);
    } catch (e) {
      details.push(`rests ${locId}: ${e instanceof Error ? e.message : "erreur"}`);
      continue;
    }
    if (rests.length === 0) continue;

    // Contrats de la location pour le matching par email
    const emailByContract: Record<string, string> = {};
    try {
      const contracts = await getContracts(locId);
      for (const c of contracts) {
        if (c.email) {
          emailByContract[c.id] = c.email.toLowerCase();
          if (c.original_contract_id) emailByContract[c.original_contract_id] = c.email.toLowerCase();
        }
      }
    } catch { /* matching par combo_contract_id uniquement */ }

    for (const r of rests) {
      // Les repos hebdomadaires ne sont pas des congés — on les ignore
      if (r.rest_type === "weekly_rest" || r.rest_type === "daily_rest") continue;
      // 1) matching direct par contract_id stocké sur la fiche
      let emp = (emps ?? []).find(e => e.combo_contract_id && (e.combo_contract_id === r.contract_id));
      // 2) sinon par email du contrat Combo
      if (!emp) {
        const mail = emailByContract[r.contract_id];
        if (mail) emp = (emps ?? []).find(e => (e.email ?? "").toLowerCase() === mail);
      }
      if (!emp) { unmatched++; continue; }

      const dDebut = toDate(r.starts_at);
      const dFin = toDate(r.ends_at);
      const nbJours = Math.max(1, Math.round((new Date(dFin).getTime() - new Date(dDebut).getTime()) / 86400000) + 1);
      const valeurs = {
        combo_rest_id: r.id,
        employe_id: emp.id,
        etablissement_id: emp.etablissement_id ?? etabId,
        date_debut: dDebut,
        date_fin: dFin,
        type: REST_TYPE_MAP[r.rest_type] ?? "conge_special",
        nb_jours: r.custom_value != null && r.custom_value > 0 ? Math.round((r.custom_value / 7) * 100) / 100 : nbJours,
        statut: "valide",
        source: "combo",
        note: `Combo (${r.rest_type})`,
      };

      // Ce rest est-il déjà importé ? Sinon, une absence app aux mêmes
      // dates (validée ou en attente) est pointée au lieu d'être doublée.
      const { data: dejaImporte } = await supabaseAdmin
        .from("absences").select("id").eq("combo_rest_id", r.id).limit(1).maybeSingle();
      if (!dejaImporte) {
        const { data: ligneApp } = await supabaseAdmin
          .from("absences")
          .select("id")
          .eq("employe_id", emp.id)
          .is("combo_rest_id", null)
          .in("statut", ["valide", "en_attente"])
          .lte("date_debut", dFin)
          .gte("date_fin", dDebut)
          .limit(1)
          .maybeSingle();
        if (ligneApp) {
          const { error } = await supabaseAdmin.from("absences").update(valeurs).eq("id", ligneApp.id);
          if (error) details.push(`lien ${r.id}: ${error.message}`);
          else synced++;
          continue;
        }
      }

      const { error } = await supabaseAdmin.from("absences").upsert(valeurs, { onConflict: "combo_rest_id" });

      if (error) details.push(`upsert ${r.id}: ${error.message}`);
      else synced++;
    }
  }

  return { synced, unmatched, details };
}
