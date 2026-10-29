import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ComboContract } from "@/lib/combo/api";
import { TYPES_CONTRAT, brutMensuelContrat, capitalize, equipeDeFonction, ficheDuContrat, normNom, type FicheExistante } from "@/lib/combo/fiches";

/**
 * Fiches employé créées depuis Combo (29/10/2026). Combo est la source des entrées : quand un contrat
 * y apparaît sans fiche dans l'application (ni combo_id, ni matricule, ni nom connus), la synchro crée
 * la fiche et son contrat. Paul envoie ensuite l'invitation depuis l'application. Les fiches existantes
 * ne sont jamais modifiées ici (c'est le rôle de /api/combo/sync-employee).
 */

/** Crée les fiches et contrats des contrats Combo sans fiche. Renvoie les noms créés. */
export async function creerFichesManquantes(etabId: string, contrats: ComboContract[]): Promise<string[]> {
  const { data: fiches } = await supabaseAdmin.from("employes").select("id, prenom, nom, matricule, combo_id, combo_contract_id")
    .or(`etablissement_id.eq.${etabId},etablissements_ids.cs.{${etabId}}`);
  const existantes = (fiches ?? []) as FicheExistante[];
  const { data: postes } = await supabaseAdmin.from("postes").select("id, nom, equipe").eq("etablissement_id", etabId).eq("actif", true);
  const posteDe = (fonction: string | null) => {
    const f = normNom(fonction);
    const p = (postes ?? []).find((x) => f && normNom(x.nom) === f) ?? (postes ?? []).find((x) => f && (f.includes(normNom(x.nom)) || normNom(x.nom).includes(f)));
    return p?.id ?? null;
  };
  const crees: string[] = [];
  for (const c of contrats) {
    if (!c.firstname || !c.lastname) continue;
    if (ficheDuContrat(c, existantes)) continue;
    const equipe = equipeDeFonction(c.function);
    const { data: emp, error } = await supabaseAdmin.from("employes").insert({
      etablissement_id: etabId, etablissements_ids: [etabId],
      prenom: capitalize(c.firstname), nom: c.lastname.toUpperCase(),
      email: c.email || null, tel_mobile: c.mobile_phone || null, matricule: c.employee_number || null,
      combo_id: c.id, combo_contract_id: c.original_contract_id || null,
      adresse: c.street_address || null, code_postal: c.zip || null, ville: c.city || null,
      numero_secu: c.social_security_number || null,
      date_entree: c.start_date || null, date_sortie: c.end_date || null,
      role: "equipier", equipes_access: equipe ? [equipe] : [], poste_id: posteDe(c.function), actif: true,
    }).select("id").single();
    if (error || !emp) { console.error("[combo] création de fiche impossible", c.lastname, error?.message); continue; }
    await supabaseAdmin.from("contrats").insert({
      employe_id: emp.id, type: TYPES_CONTRAT[c.contract_type] ?? c.contract_type ?? "CDI",
      date_debut: c.start_date, date_fin: c.end_date || null, remuneration: brutMensuelContrat(c),
      emploi: c.function || null, heures_semaine: c.contract_time, jours_semaine: 5,
      actif: !c.end_date || new Date(c.end_date) >= new Date(),
    });
    existantes.push({ id: emp.id, prenom: c.firstname, nom: c.lastname, matricule: c.employee_number, combo_id: c.id, combo_contract_id: c.original_contract_id });
    crees.push(`${capitalize(c.firstname)} ${c.lastname.toUpperCase()}`);
  }
  return crees;
}
