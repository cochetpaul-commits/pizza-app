/** Types partagés pour le module RH */

export type Employe = {
  id: string;
  etablissement_id: string;
  prenom: string;
  nom: string;
  initiales: string | null;
  email: string | null;
  tel_mobile: string | null;
  tel_fixe: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  civilite: string | null;
  nom_usage: string | null;
  genre: string | null;
  date_naissance: string | null;
  lieu_naissance: string | null;
  departement_naissance: string | null;
  nationalite: string | null;
  situation_familiale: string | null;
  nb_personnes_charge: number | null;
  contact_urgence_prenom: string | null;
  contact_urgence_nom: string | null;
  contact_urgence_lien: string | null;
  contact_urgence_tel: string | null;
  numero_secu: string | null;
  handicap: boolean;
  type_handicap: string | null;
  date_visite_medicale: string | null;
  visite_renforcee: boolean;
  prochaine_visite_medicale: string | null;
  iban: string | null;
  bic: string | null;
  titulaire_compte: string | null;
  matricule: string | null;
  date_anciennete: string | null;
  travailleur_etranger: boolean;
  avatar_url: string | null;
  actif: boolean;
  equipes_access: string[];
  role: string;
  poste_rh: string | null;
  contrat_type: string | null;
  heures_semaine: number | null;
  created_at: string;
};

export type Contrat = {
  id: string;
  employe_id: string;
  type: string;
  date_debut: string;
  date_fin: string | null;
  remuneration: number | null;
  salaire_brut: number | null;
  emploi: string | null;
  qualification: string | null;
  heures_semaine: number;
  jours_semaine: number;
  actif: boolean;
  created_at: string;
};

export type ContratElement = {
  id: string;
  contrat_id: string;
  type: string;
  libelle: string;
  montant: number | null;
  code_silae: string | null;
  date_debut: string | null;
  date_fin: string | null;
  created_at: string;
};

export type Poste = {
  id: string;
  etablissement_id: string;
  equipe: string;
  nom: string;
  couleur: string;
  emoji: string | null;
  actif: boolean;
};

export type Shift = {
  id: string;
  employe_id: string;
  etablissement_id: string;
  poste_id: string | null;
  date: string;
  heure_debut: string;
  heure_fin: string;
  pause_minutes: number;
  note: string | null;
  statut: string;
  heures_reelles_debut: string | null;
  heures_reelles_fin: string | null;
  pause_reelle_minutes: number | null;
  created_at: string;
};

export type Absence = {
  id: string;
  employe_id: string;
  etablissement_id: string;
  date_debut: string;
  date_fin: string;
  type: string;
  nb_jours: number | null;
  statut: string;
  code_silae: string | null;
  note: string | null;
  created_at: string;
};

export type EmployeAvecContrat = Employe & { contrat_actif: Contrat | null };
