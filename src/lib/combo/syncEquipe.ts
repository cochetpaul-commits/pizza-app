/**
 * Synchronisation de l'équipe avec Combo (03/11/2026, réécrite). Logique pure, testée ; l'API l'applique.
 *
 * Vécu 03/11 : la synchronisation écrivait une colonne « emploi » absente des fiches employés, chaque création et
 * chaque mise à jour échouait en silence (l'écran affichait pourtant « mis à jour »), un nouvel arrivé n'apparaissait
 * pas et les départs (démission, fin d'extra) n'étaient jamais enregistrés.
 * Règles : Combo fait foi pour l'identité et le contrat ; ce que Combo ne connaît pas (équipe, autres établissements,
 * adresse vide) n'efface jamais ce qui est saisi dans l'appli. Un départ se constate sur un contrat à date de fin
 * passée ; sans date de fin, on signale seulement.
 */
export type ContratCombo = {
  id: string; original_contract_id?: string | null; firstname: string; lastname: string; email: string | null; mobile_phone: string | null;
  function: string | null; role: string; contract_type: string; contract_time: number | null; start_date: string; end_date: string | null;
  employee_number: string | null; monthly_gross_salary: number | null; street_address: string | null; zip: string | null; city: string | null;
  social_security_number: string | null; contract_end_reason?: string | null;
};
export type EmployeApp = {
  id: string; prenom: string; nom: string; email: string | null; combo_id: string | null; matricule: string | null; actif: boolean;
  equipes_access: string[] | null; etablissements_ids: string[] | null; date_sortie: string | null;
};

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export const capitaliser = (s: string) => s.toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());

/** Fiche de l'appli qui correspond au contrat : identifiant Combo, puis e-mail, matricule, nom et prénom */
export function trouverEmploye(liste: EmployeApp[], c: ContratCombo): EmployeApp | null {
  return liste.find((e) => e.combo_id && (e.combo_id === c.id || e.combo_id === c.original_contract_id))
    ?? (c.email ? liste.find((e) => norm(e.email) === norm(c.email)) : undefined)
    ?? (c.employee_number ? liste.find((e) => e.matricule === c.employee_number) : undefined)
    ?? liste.find((e) => norm(e.nom) === norm(c.lastname) && norm(e.prenom) === norm(c.firstname))
    ?? null;
}

/** Équipe d'après la fonction Combo (Salle, Cuisine), null si la fonction ne le dit pas */
export function equipeDe(fonction: string | null): string | null {
  const f = norm(fonction);
  if (!f) return null;
  if (/salle|rang|barman|barmaid|serveu|runner|commis de salle|hote/.test(f)) return "Salle";
  if (/cuisi|pizza|plong|chef(?! de rang)|commis|agent de maitrise|second/.test(f)) return "Cuisine";
  return null;
}

const TYPES: Record<string, string> = { CDI: "CDI", CDD: "CDD", seasonal: "CDD", extra: "extra", apprenticeship: "apprenti", internship: "stagiaire" };
export const typeContrat = (t: string | null | undefined) => TYPES[String(t ?? "")] ?? String(t ?? "CDI");

/** Champs de la fiche à écrire : seulement ce que Combo renseigne, sans effacer le reste */
export function champsFiche(c: ContratCombo, existant: EmployeApp | null, etabId: string): Record<string, unknown> {
  const v: Record<string, unknown> = {
    prenom: capitaliser(c.firstname.trim()), nom: c.lastname.trim().toUpperCase(), combo_id: c.id, etablissement_id: existant ? undefined : etabId, actif: true, date_sortie: null, motif_sortie: null,
  };
  const si = (cle: string, val: unknown) => { if (val != null && val !== "") v[cle] = val; };
  si("email", c.email); si("tel_mobile", c.mobile_phone); si("matricule", c.employee_number);
  si("adresse", c.street_address); si("code_postal", c.zip); si("ville", c.city); si("numero_secu", c.social_security_number);
  si("date_entree", c.start_date);
  const etabs = new Set([...(existant?.etablissements_ids ?? []), etabId]);
  v.etablissements_ids = [...etabs];
  const equipe = equipeDe(c.function);
  if (equipe) v.equipes_access = [equipe, ...(existant?.equipes_access ?? []).filter((e) => e !== equipe)];
  else if (!existant) v.equipes_access = [];
  if (v.etablissement_id === undefined) delete v.etablissement_id;
  return v;
}

export function champsContrat(c: ContratCombo, employeId: string, aujourdhui: string): Record<string, unknown> {
  return {
    employe_id: employeId, type: typeContrat(c.contract_type), date_debut: c.start_date, date_fin: c.end_date || null,
    remuneration: c.monthly_gross_salary ?? null, emploi: c.function || null, heures_semaine: c.contract_time ?? null, jours_semaine: 5,
    actif: !c.end_date || c.end_date >= aujourdhui,
  };
}

const MOTIFS: Record<string, string> = { resignation: "Démission", termination: "Fin de contrat", mutual_agreement: "Rupture conventionnelle", dismissal: "Licenciement", trial_period_end: "Fin de période d'essai", retirement: "Retraite" };
export const motifSortie = (r: string | null | undefined, type: string | null | undefined) => (r && MOTIFS[r]) || (type === "extra" || type === "seasonal" ? "Fin de contrat" : r || "Fin de contrat");

export type Depart = { employe: EmployeApp; date: string | null; motif: string | null };
/**
 * Départs : fiches actives reliées à Combo sans contrat aujourd'hui. Le dernier contrat connu (relevé il y a quelques
 * semaines) donne la date de fin et le motif ; sans date de fin passée, le départ est seulement signalé (date null).
 */
export function departs(liste: EmployeApp[], actuels: ContratCombo[], anciens: ContratCombo[], aujourdhui: string): Depart[] {
  const presents = new Set(actuels.flatMap((c) => [c.id, c.original_contract_id ?? ""]).filter(Boolean));
  const encore = (e: EmployeApp) => actuels.some((c) => trouverEmploye([e], c));
  return liste
    .filter((e) => e.actif && e.combo_id && !presents.has(e.combo_id) && !encore(e))
    .map((e) => {
      const ancien = anciens.find((c) => trouverEmploye([e], c));
      const fin = ancien?.end_date && ancien.end_date < aujourdhui ? ancien.end_date : null;
      return { employe: e, date: fin, motif: fin ? motifSortie(ancien?.contract_end_reason, ancien?.contract_type) : null };
    });
}
