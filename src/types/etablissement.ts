export type Etablissement = {
  id: string;
  slug: string;
  nom: string;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  popina_location_id: string | null;
  couleur: string;
  logo_url: string | null;
  actif: boolean;
  // HR settings
  convention: string;
  code_ape: string | null;
  siret: string | null;
  medecin_travail: string | null;
  pause_defaut_minutes: number;
  duree_min_shift_pause: string | null;
  objectif_cout_ventes: number;
  objectif_productivite: number;
  cotisations_patronales: number;
  ajouter_cp_taux_horaire: boolean;
  base_calcul_cp: number;
  acquisition_mensuelle_cp: number;
  type_indemnisation_repas: string;
  valeur_avantage_nature: number;
  taux_accident_travail: number;
  taux_horaire_moyen: number;
};
